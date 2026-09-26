#!/usr/bin/env python3
"""Small command line client for the RustDesk console REST API.

Dependency free (Python 3.6+, standard library only).

Configuration (environment):
  CONSOLE_URL       base URL of the console, e.g. https://rd.example.com
  CONSOLE_TOKEN     console API token (create one under Settings > API tokens)
  or, instead of a token:
  CONSOLE_USER / CONSOLE_PASSWORD   log in with an account (password is asked
                                    for interactively when not set)

Token scopes needed: `read` for list/export commands, `manage` for the rest
(`assign` is enough for `devices assign`). The token owner's own console
permissions still apply on top of the scopes.

Examples:
  ./console.py users list
  ./console.py users create alice --password 'S3cret!!' --email a@example.com
  ./console.py users disable alice
  ./console.py devices list --online
  ./console.py devices assign 123456789 --user alice --group Sales
  ./console.py audits export --type conn --from 2026-01-01 -o conn.csv
"""
import argparse
import csv
import getpass
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

PAGE_SIZE = 100


class CliError(Exception):
    pass


class Client(object):
    def __init__(self, url, token=None):
        self.url = url.rstrip("/")
        if self.url.endswith("/api"):
            self.url = self.url[:-4]
        self.token = token

    @classmethod
    def from_env(cls):
        url = os.environ.get("CONSOLE_URL")
        if not url:
            raise CliError("CONSOLE_URL is not set (e.g. https://rd.example.com)")
        client = cls(url, os.environ.get("CONSOLE_TOKEN"))
        if not client.token:
            user = os.environ.get("CONSOLE_USER")
            if not user:
                raise CliError("set CONSOLE_TOKEN, or CONSOLE_USER (+ CONSOLE_PASSWORD)")
            password = os.environ.get("CONSOLE_PASSWORD") or getpass.getpass(
                "Password for %s: " % user
            )
            data = client.request(
                "POST",
                "/login",
                {"username": user, "password": password, "type": "account",
                 "id": "console-cli", "uuid": "console-cli"},
            )
            client.token = data.get("access_token")
            if not client.token:
                raise CliError("login failed: %s" % json.dumps(data))
        return client

    def request(self, method, path, body=None, query=None):
        url = self.url + "/api" + path
        if query:
            url += "?" + urllib.parse.urlencode(
                [(k, v) for k, v in query.items() if v is not None]
            )
        data = json.dumps(body).encode("utf-8") if body is not None else None
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Content-Type", "application/json")
        req.add_header("Accept", "application/json")
        if self.token:
            req.add_header("Authorization", "Bearer " + self.token)
        try:
            resp = urllib.request.urlopen(req, timeout=60)
            text = resp.read().decode("utf-8")
        except urllib.error.HTTPError as err:
            text = err.read().decode("utf-8", "replace")
            try:
                msg = json.loads(text).get("message", text)
            except ValueError:
                msg = text
            if isinstance(msg, list):
                msg = "; ".join(str(m) for m in msg)
            raise CliError("HTTP %d: %s" % (err.code, msg))
        except urllib.error.URLError as err:
            raise CliError("cannot reach %s: %s" % (self.url, err.reason))
        if not text:
            return {}
        try:
            return json.loads(text)
        except ValueError:
            return {"raw": text}

    def pages(self, path, query=None):
        """Yield every row of a paginated {data, total} endpoint."""
        page = 1
        while True:
            q = dict(query or {})
            q.update({"current": page, "pageSize": PAGE_SIZE})
            res = self.request("GET", path, query=q)
            rows = res.get("data", [])
            for row in rows:
                yield row
            if not rows or page * PAGE_SIZE >= res.get("total", 0):
                return
            page += 1


# ------------------------------------------------------------------ output

def flat(value):
    if isinstance(value, (dict, list)):
        return json.dumps(value, sort_keys=True)
    return "" if value is None else str(value)


def print_table(rows, columns):
    rows = list(rows)
    table = [columns] + [[flat(r.get(c)) for c in columns] for r in rows]
    widths = [max(len(line[i]) for line in table) for i in range(len(columns))]
    for n, line in enumerate(table):
        print("  ".join(cell.ljust(widths[i]) for i, cell in enumerate(line)).rstrip())
        if n == 0:
            print("  ".join("-" * w for w in widths))
    print("(%d rows)" % len(rows))


def emit(args, rows, columns):
    if getattr(args, "json", False):
        print(json.dumps(list(rows), indent=2, sort_keys=True))
    else:
        print_table(rows, columns)


# ---------------------------------------------------------------- commands

def find_user(client, name):
    for row in client.pages("/admin/users", {"name": name}):
        if (row.get("name") or "").lower() == name.lower():
            return row
    raise CliError("user not found: %s" % name)


def cmd_users_list(args, client):
    q = {"name": args.name, "status": args.status}
    emit(args, client.pages("/admin/users", q),
         ["name", "display_name", "email", "status", "is_admin", "user_group_name", "guid"])


def cmd_users_create(args, client):
    password = args.password or os.environ.get("CONSOLE_NEW_PASSWORD") or getpass.getpass(
        "Password for new user %s: " % args.name
    )
    body = {"name": args.name, "password": password}
    if args.email:
        body["email"] = args.email
    if args.note:
        body["note"] = args.note
    client.request("POST", "/users", body)
    print("created user %s" % args.name)


def cmd_users_set_status(status, label):
    def run(args, client):
        user = find_user(client, args.name)
        client.request("PATCH", "/users/batch/status",
                       {"user_guids": [user["guid"]], "status": status})
        print("%s user %s" % (label, user["name"]))
    return run


def cmd_users_reset_password(args, client):
    user = find_user(client, args.name)
    password = args.password or os.environ.get("CONSOLE_NEW_PASSWORD") or getpass.getpass(
        "New password for %s: " % user["name"]
    )
    client.request("PATCH", "/users/%s/security" % user["guid"], {"new_password": password})
    print("password reset for %s" % user["name"])


def find_device(client, ident):
    """Match a device by RustDesk id or by uuid (guid)."""
    for row in client.pages("/devices", {"id": ident}):
        if row.get("id") == ident or row.get("guid") == ident:
            return row
    for row in client.pages("/devices"):
        if row.get("guid") == ident:
            return row
    raise CliError("device not found: %s" % ident)


def cmd_devices_list(args, client):
    q = {"id": args.id, "is_online": "1" if args.online else None}
    rows = []
    for r in client.pages("/devices", q):
        info = r.get("info") or {}
        rows.append({
            "id": r.get("id"), "device_name": info.get("device_name"),
            "user_name": r.get("user_name"), "group": r.get("device_group_name"),
            "strategy": r.get("strategy_name"), "online": r.get("is_online"),
            "status": r.get("status"), "note": r.get("note"), "uuid": r.get("guid"),
        })
    emit(args, rows, ["id", "device_name", "user_name", "group", "strategy",
                      "online", "status", "note", "uuid"])


def cmd_devices_assign(args, client):
    dev = find_device(client, args.device)
    body = {"id": dev["id"], "uuid": dev["guid"]}
    mapping = [
        ("user", "user_name"), ("group", "device_group_name"),
        ("strategy", "strategy_name"), ("note", "note"),
        ("device_username", "device_username"), ("device_name", "device_name"),
        ("address_book", "address_book_name"), ("ab_tag", "address_book_tag"),
        ("ab_alias", "address_book_alias"), ("ab_password", "address_book_password"),
        ("ab_note", "address_book_note"),
    ]
    for attr, field in mapping:
        value = getattr(args, attr)
        if value is not None:
            body[field] = value
    if len(body) == 2:
        raise CliError("nothing to assign; pass at least one option (see --help)")
    client.request("POST", "/devices/cli", body)
    print("assigned device %s" % dev["id"])


def cmd_devices_delete(args, client):
    dev = find_device(client, args.device)
    if not args.yes:
        answer = input("Delete device %s? [y/N] " % dev["id"])
        if answer.strip().lower() not in ("y", "yes"):
            raise CliError("aborted")
    client.request("DELETE", "/devices/%s" % dev["guid"])
    print("deleted device %s" % dev["id"])


def cmd_user_groups_list(args, client):
    emit(args, client.pages("/user-groups"),
         ["name", "user_count", "is_default", "note", "guid"])


def cmd_device_groups_list(args, client):
    emit(args, client.pages("/device-groups"), ["name", "note", "guid"])


def cmd_address_books_list(args, client):
    rows = list(client.request("GET", "/ab/shared/profiles").get("data", []))
    personal = client.request("GET", "/ab/personal")
    rows.insert(0, {"name": "(personal)", "owner": "token owner",
                    "guid": personal.get("guid")})
    emit(args, rows, ["name", "owner", "note", "guid"])


AUDIT_PATHS = {
    "conn": "/audits/conn",
    "file": "/audits/file",
    "alarm": "/audits/alarm",
    "console": "/audits/console",
}


def cmd_audits_export(args, client):
    query = {}
    if args.type == "console":
        query["start_time"] = args.date_from
        query["end_time"] = args.date_to
    else:
        query["startTime"] = args.date_from
        query["endTime"] = args.date_to
    rows = list(client.pages(AUDIT_PATHS[args.type], query))
    columns = []
    for row in rows:
        for key in row:
            if key not in columns:
                columns.append(key)
    out = open(args.output, "w", newline="", encoding="utf-8") if args.output else sys.stdout
    try:
        writer = csv.writer(out)
        writer.writerow(columns)
        for row in rows:
            writer.writerow([flat(row.get(c)) for c in columns])
    finally:
        if args.output:
            out.close()
    sys.stderr.write("exported %d %s audit rows\n" % (len(rows), args.type))


# ------------------------------------------------------------------ parser

def build_parser():
    parser = argparse.ArgumentParser(
        prog="console.py",
        description="RustDesk console command line tools. "
                    "Set CONSOLE_URL and CONSOLE_TOKEN (or CONSOLE_USER/CONSOLE_PASSWORD).",
    )
    parser.add_argument("--json", action="store_true", help="print list output as JSON")
    top = parser.add_subparsers(dest="group", metavar="<group>")
    top.required = True

    users = top.add_parser("users", help="manage users").add_subparsers(dest="cmd", metavar="<command>")
    users.required = True
    p = users.add_parser("list", help="list users")
    p.add_argument("--name", help="filter by name (substring)")
    p.add_argument("--status", help="filter by status (1 active, 0 disabled)")
    p.set_defaults(func=cmd_users_list)
    p = users.add_parser("create", help="create a user")
    p.add_argument("name")
    p.add_argument("--password", help="omit to be prompted (or set CONSOLE_NEW_PASSWORD)")
    p.add_argument("--email")
    p.add_argument("--note")
    p.set_defaults(func=cmd_users_create)
    p = users.add_parser("enable", help="enable a user")
    p.add_argument("name")
    p.set_defaults(func=cmd_users_set_status(1, "enabled"))
    p = users.add_parser("disable", help="disable a user")
    p.add_argument("name")
    p.set_defaults(func=cmd_users_set_status(0, "disabled"))
    p = users.add_parser("reset-password", help="set a new password for a user")
    p.add_argument("name")
    p.add_argument("--password", help="omit to be prompted (or set CONSOLE_NEW_PASSWORD)")
    p.set_defaults(func=cmd_users_reset_password)

    devices = top.add_parser("devices", help="manage devices").add_subparsers(dest="cmd", metavar="<command>")
    devices.required = True
    p = devices.add_parser("list", help="list devices")
    p.add_argument("--id", help="filter by RustDesk id (substring)")
    p.add_argument("--online", action="store_true", help="only online devices")
    p.set_defaults(func=cmd_devices_list)
    p = devices.add_parser("assign", help="assign user/group/strategy/address book/... to a device")
    p.add_argument("device", help="RustDesk id (or uuid) of the device")
    p.add_argument("--user")
    p.add_argument("--group", help="device group name")
    p.add_argument("--strategy", help="strategy name")
    p.add_argument("--note")
    p.add_argument("--device-username", dest="device_username")
    p.add_argument("--device-name", dest="device_name")
    p.add_argument("--address-book", dest="address_book", help="address book name")
    p.add_argument("--ab-tag", dest="ab_tag", help="tag(s), comma separated")
    p.add_argument("--ab-alias", dest="ab_alias")
    p.add_argument("--ab-password", dest="ab_password")
    p.add_argument("--ab-note", dest="ab_note")
    p.set_defaults(func=cmd_devices_assign)
    p = devices.add_parser("delete", help="delete a device")
    p.add_argument("device", help="RustDesk id (or uuid) of the device")
    p.add_argument("-y", "--yes", action="store_true", help="do not ask for confirmation")
    p.set_defaults(func=cmd_devices_delete)

    ug = top.add_parser("user-groups", help="user groups").add_subparsers(dest="cmd", metavar="<command>")
    ug.required = True
    ug.add_parser("list", help="list user groups").set_defaults(func=cmd_user_groups_list)

    dg = top.add_parser("device-groups", help="device groups").add_subparsers(dest="cmd", metavar="<command>")
    dg.required = True
    dg.add_parser("list", help="list device groups").set_defaults(func=cmd_device_groups_list)

    ab = top.add_parser("address-books", help="address books").add_subparsers(dest="cmd", metavar="<command>")
    ab.required = True
    ab.add_parser("list", help="list address books of the token owner").set_defaults(func=cmd_address_books_list)

    au = top.add_parser("audits", help="audit logs").add_subparsers(dest="cmd", metavar="<command>")
    au.required = True
    p = au.add_parser("export", help="export an audit log as CSV")
    p.add_argument("--type", choices=sorted(AUDIT_PATHS), default="conn")
    p.add_argument("--from", dest="date_from", help="start, ISO-8601 with timezone (2026-01-01T00:00:00Z)")
    p.add_argument("--to", dest="date_to", help="end, ISO-8601 with timezone")
    p.add_argument("-o", "--output", help="output file (default: stdout)")
    p.set_defaults(func=cmd_audits_export)
    return parser


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if "--json" in argv:  # accept --json anywhere on the command line
        argv.remove("--json")
        argv.insert(0, "--json")
    args = build_parser().parse_args(argv)
    try:
        args.func(args, Client.from_env())
    except CliError as err:
        sys.stderr.write("error: %s\n" % err)
        return 1
    except KeyboardInterrupt:
        return 130
    return 0


if __name__ == "__main__":
    sys.exit(main())
