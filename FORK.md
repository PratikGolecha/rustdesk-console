# Golecha fork of databk/rustdesk-console

This is a maintained fork of [databk/rustdesk-console](https://github.com/databk/rustdesk-console) used to run
the Golecha RustDesk management console (behind stock `hbbs`/`hbbr`). Default branch: **`golecha`**.

## What differs from upstream

| Change | Upstream status |
|---|---|
| All Chinese comments, API/exception messages, logs, emails, OIDC pages and docs translated to English | PR [databk/rustdesk-console#366](https://github.com/databk/rustdesk-console/pull/366) |
| Heartbeat asks the client to (re-)upload system info (`sysinfo: true`) when the console has none for that device, so device name / user / OS / icon self-heal after a device record is deleted - `heartbeat.service.ts` | not submitted |
| Case-insensitive login (`Pratik` = `pratik`; exact-case match wins if two users differ only by case) - `findByUsernameOrEmail` in `src/modules/auth/services/auth-user.helper.ts` | not submitted |

Companion frontend fork: [PratikGolecha/rustdesk-console-web](https://github.com/PratikGolecha/rustdesk-console-web) (`golecha` branch).

## Keeping up with upstream

```bash
git remote add upstream https://github.com/databk/rustdesk-console.git   # once
git fetch upstream
git checkout golecha
git merge upstream/main        # or: git rebase upstream/main
npm ci && npx tsc --noEmit && npx jest && npm run build
```

Expect merge conflicts in files touched by the translation whenever upstream edits Chinese strings or
comments: keep the English wording and take upstream's logic. When #366 is merged upstream, most conflicts disappear.

## Build and deploy

`docker build -t rustdesk-console:<tag> .` (needs ~2 GB RAM/swap for the `npm ci` + Nest build), then point the
`rustdesk-console` service in your compose file at that tag. Data lives in the `/data` volume (SQLite);
back it up before switching images.

## Operational notes (learned the hard way)

- Newer upstream allows **exactly one system owner** (`users.isAdmin = 1`); the server refuses to start with more.
  Give other admins a role (RBAC) instead. Device-group management remains owner-only.
- Usernames used to be case-sensitive; with the patch above they are not.
- Clients bind a device to a user when they log in and unbind it on logout; a new device must have heartbeated once.
- Login is rate-limited (HTTP 429) after a burst of attempts from one IP.

## Pro-parity features added in this fork (2026-09)

| Feature | Where | Notes |
|---|---|---|
| Cross-group access (shared group, group->group, group->device group) | `src/modules/access-control` | manage in the console: user groups -> Access |
| Client setup / config generator (+ multi-relay notes) | `src/modules/client-config`, `docs/client-setup-and-relays.md` | needs `RUSTDESK_KEY_FILE` (public key file) |
| API tokens + `rustdesk --assign` endpoint (`POST /api/devices/cli`) | `src/modules/api-token` | tokens are stored hashed |
| CLI tools | `scripts/cli/console.py` | stdlib-only Python |
| Strategy options catalog + validation | `src/modules/strategy/strategy-options.catalog.ts` | options verified against RustDesk client 1.4.9 |
| Control roles (console side) | `src/modules/control-roles` | enforced by the patched relay (see PratikGolecha/rustdesk-server) |
| Relay callbacks `POST /api/relay/authorize`, `/api/relay/verify` | `src/modules/relay-verify` | needs `RELAY_SHARED_SECRET` (authorize) / `RELAY_VERIFY_SECRET` (verify) |
| Browser web client config | `src/modules/web-client` | env `WEB_CLIENT_ENABLED`, `WEB_CLIENT_ID_SERVER`, `WEB_CLIENT_API_SERVER`, `RUSTDESK_KEY_FILE` |

Not built (not possible with this stack): changing a device's ID from the console - only the device itself can change its ID.

## Acknowledgements and licences

Ideas and reference behaviour were studied from these open-source projects; unless noted, the code here was written for this fork against RustDesk's own client source and public Pro documentation:
- [databk/rustdesk-console](https://github.com/databk/rustdesk-console) - the base of this fork (AGPL-3.0).
- [lejianwen/rustdesk-api](https://github.com/lejianwen/rustdesk-api) (MIT) - shared-group visibility semantics, `MUST_LOGIN` and web-client integration approach.
- [lejianwen/rustdesk-server](https://github.com/lejianwen/rustdesk-server) (AGPL-3.0) - `MUST_LOGIN` behaviour reference.
- [UNITRONIX/BetterDesk](https://github.com/UNITRONIX/BetterDesk) (AGPL-3.0) - reference for enrollment tokens, client generator and web remote designs.
- RustDesk client and server sources (AGPL-3.0) - wire formats, option keys, `--assign` / `--config` contracts.
