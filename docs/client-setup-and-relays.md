# Client setup ("Automatic Configs") and multiple relay servers

The console has a **Client setup** page (Settings > Client setup) that produces
everything needed to point RustDesk clients at this deployment, in the spirit of
RustDesk Server Pro's "Automatic Configs". Every format below was checked against
the RustDesk client source (`src/custom_server.rs`, `src/core_main.rs`,
`src/rendezvous_mediator.rs`, `flutter/lib/common.dart`); the unit tests in
`src/modules/client-config/` round-trip through a port of the client parser and
include the client's own test vectors.

## Settings

| Field | Meaning |
|---|---|
| ID server | hbbs host[:port] (`custom-rendezvous-server`) |
| Relay servers | list of hbbr host[:port]; see below |
| Pin relay | copy the single relay into the client config (off by default) |
| API server | URL clients use to reach this console; falls back to *General settings > site backend URL* |
| Public key | manual override; otherwise read from the file named by `RUSTDESK_KEY_FILE` |

`RUSTDESK_KEY_FILE` (env, default unset) should point at hbbs's `id_ed25519.pub`.
Only a value that is exactly a 32-byte base64 public key is accepted, so pointing it
at the private key file (64 bytes) is rejected; the private key is never read into a
response.

Endpoints: `GET/PUT /api/client-config/settings` (administrators),
`GET /api/client-config/setup` (any logged-in user: it only contains public values).

## Formats (from the client source)

1. **Config string** (`rustdesk --config <string>`, the GUI "Import server config",
   `rustdesk://config/<string>`): `reverse(base64url(JSON{"key","host","api","relay"}))`.
   Rust accepts padded and unpadded base64url; we emit unpadded.
   `--config` only works on an **installed** client run as **admin/root**, and sets
   `key`, `custom-rendezvous-server`, `api-server` and `relay-server` together
   (an empty relay clears a previously set one). Options can also be set one by one:
   `rustdesk --option <name> <value>`.
2. **Executable name** (Windows; also read at runtime by the client):
   - `rustdesk-licensed-<config string>.exe` (also `rustdesk--<string>.exe`). The
     client splits the name on `--`, so an encoded string that itself contains `--`
     is flagged as unusable rather than emitted silently.
   - `rustdesk-host=<h>,key=<k>,api=<a>,relay=<r>,.exe` (comma-delimited, trailing
     comma allowed). Values cannot contain `,` or characters illegal in Windows file
     names (`/` `:` ...), which excludes most API URLs and some keys; then it is flagged.
   The console does **not** build or serve the EXE; rename an official
   `rustdesk-<version>-install.exe` to the suggested name.
   (`rustdesk-custom_serverd-...` from `src/naming.rs` is a stale helper and does not parse; not used.)
3. **Deep link** `rustdesk://config/<string>`: handled only on Android/iOS, and only when
   the client build has `allow-deep-link-server-settings` = `Y`. Shown with that caveat.

## Several relay servers: what really happens

* `hbbs -r host1:21117,host2:21117` (`--relay-servers`, comma separated, or env
  `RELAY_SERVERS`). Run one `hbbr` per host (each with the same `-k` key setting as hbbs).
* hbbs picks the relay **per connection, round-robin** (`ROTATION_RELAY_SERVER` counter
  in `rendezvous_server.rs`). It health-checks the list every 3 s by opening a TCP
  connection to each relay and drops unreachable ones from the rotation until they
  answer again. **There is no geo/latency routing** in the open-source server; the
  parameters passed to `get_relay_server(ip_a, ip_b)` are unused.
* A LAN-to-WAN connection uses hbbs's own local IP as relay (rustdesk-server issue #24).
* The client's `relay-server` option is **one** host[:port] (`Config::get_option("relay-server")`
  is used verbatim, then port 21117 added). There is no comma splitting in the client,
  so a comma list in a client config would be treated as one (invalid) host name.
  Therefore the console never puts more than one relay in the client config: with several
  relays leave *Pin relay* off, the config's `relay` is empty and hbbs distributes them.
  Pinning is only accepted with exactly one relay (a pinned client always uses that relay).
* The console page shows the exact `-r` argument to give hbbs for the list you entered.

Open ports per relay: 21117/tcp (plus 21119/tcp for web clients if used). Console-side
settings do not restart hbbs; after changing the list update the hbbs command and restart it.
