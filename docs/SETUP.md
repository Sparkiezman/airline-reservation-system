# Setup Guide

## Option A — Docker (recommended if Docker Desktop is available)

```bash
docker compose up -d          # starts Postgres 16 + Redis 7
cd server
npm install
cp .env.example .env          # then edit DB_*/REDIS_* to match docker-compose.yml
npm run migrate
npm run seed
npm start
```

## Option B — Native Windows services (used for this machine)

This machine already has PostgreSQL 16 installed as a Windows service, and no
Docker. Redis has no official Windows build, so we use **Memurai Developer**
(a maintained, Redis-protocol-compatible Windows service, free for dev use).

1. Run `docs/setup-local-services.ps1` in an **Administrator PowerShell**
   window. It will:
   - Temporarily set Postgres local auth to `trust`, reset the `postgres`
     superuser password, create the `airline_app` role + `airline_reservation`
     database, then restore secure `scram-sha-256` auth.
   - Install Memurai Developer via `winget` and set its `requirepass`.

   ```powershell
   powershell -ExecutionPolicy Bypass -File "docs\setup-local-services.ps1"
   ```

2. From a normal (non-admin) terminal:

   ```bash
   cd server
   npm install
   npm run migrate
   npm run seed
   npm start
   ```

3. Open http://localhost:3000.

`server/.env` already contains matching credentials for both services — see
`.env.example` for what each variable means. **Never commit `.env`.**

## Verifying services are up

```powershell
Get-Service postgresql-x64-16, Memurai
```

Both should show `Running`. If Memurai didn't install (e.g. `winget` needs a
reboot after first use), you can substitute any Redis-compatible server —
just make sure `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` in `.env` match.

## Environment variables

All variables are documented in `server/.env.example`. Key ones:

| Variable | Purpose |
|---|---|
| `SESSION_SECRET` | Signs the session cookie. Generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`. Rotate this to invalidate all sessions. |
| `COOKIE_SECURE` | Set to `true` once served over HTTPS (required for `Secure` cookies). |
| `BCRYPT_COST` | bcrypt work factor. 12 is a reasonable default; raise on faster hardware. |
| `MAX_LOGIN_ATTEMPTS` / `LOGIN_LOCKOUT_MINUTES` | Account lockout tuning. |
| `SEAT_HOLD_SECONDS` | How long a seat selection is reserved in Redis before release. |

## Running tests

```bash
cd server
npm test
```

## Resetting local data

```bash
cd server
npm run migrate   # re-applies schema.sql (idempotent — IF NOT EXISTS everywhere)
npm run seed       # re-applies seed.sql (idempotent — ON CONFLICT DO NOTHING)
```

To fully wipe and start over, drop and recreate the `airline_reservation`
database, then re-run the two commands above.
