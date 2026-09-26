# Golecha fork of databk/rustdesk-console

This is a maintained fork of [databk/rustdesk-console](https://github.com/databk/rustdesk-console) used to run
the Golecha RustDesk management console (behind stock `hbbs`/`hbbr`). Default branch: **`golecha`**.

## What differs from upstream

| Change | Upstream status |
|---|---|
| All Chinese comments, API/exception messages, logs, emails, OIDC pages and docs translated to English | PR [databk/rustdesk-console#366](https://github.com/databk/rustdesk-console/pull/366) |
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
