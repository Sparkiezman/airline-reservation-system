# SkyReserve — Airline Reservation System

A full-stack airline reservation system built for a university cybersecurity
penetration-testing exercise: customers can search flights, pick seats, pay
(simulated), and download e-tickets; airline staff manage flights, aircraft,
and check-in; administrators manage users, roles, settings, and audit logs.

**Stack:** Node.js / Express.js · PostgreSQL · Redis · vanilla HTML/CSS/JS (no
frontend framework or build step).

## Project layout

```
airline web/
├── server/                  Express API
│   ├── src/
│   │   ├── config/          env, PostgreSQL pool, Redis client
│   │   ├── middleware/      auth/RBAC, CSRF, rate limiting, sessions, security headers
│   │   ├── routes/          auth, flights, bookings, staff, admin
│   │   ├── controllers/     request handlers
│   │   ├── services/        seat locking, payments, e-ticket PDF, booking logic
│   │   └── validators/      zod input-validation schemas
│   ├── db/                  schema.sql, seed.sql, migrate/seed runners
│   └── tests/
├── public/                  Static frontend (served by Express, no build step)
│   ├── css/styles.css
│   ├── js/                  one file per page + shared api.js / nav.js
│   └── *.html
├── docs/                    Setup scripts and documentation
└── docker-compose.yml       Optional: Postgres + Redis in containers
```

## Quick start

See [`docs/SETUP.md`](docs/SETUP.md) for full instructions (including the
Windows-specific steps already used to provision this machine). Short version:

```bash
cd server
npm install
npm run migrate   # applies db/schema.sql
npm run seed       # loads sample airports/aircraft/flights/users
npm start
```

Then open http://localhost:3000.

**Seed accounts** (change these before any non-local use):

| Role     | Email                   | Password        |
|----------|--------------------------|-----------------|
| Admin    | admin@airline.test       | Admin#12345     |
| Staff    | staff@airline.test       | Staff#12345     |
| Customer | customer@airline.test    | Customer#12345  |

## Documentation

- [docs/SETUP.md](docs/SETUP.md) — local environment setup (Postgres, Redis, env vars)
- [docs/API.md](docs/API.md) — REST API reference
- [docs/SECURITY.md](docs/SECURITY.md) — security controls, threat model, and known limitations for pentesters

## Security posture (summary)

- Passwords hashed with bcrypt (cost 12); account lockout after repeated failures.
- Sessions stored server-side in Redis (httpOnly, sameSite=lax cookies), not JWT-in-localStorage.
- Synchronizer-token CSRF protection on every mutating request.
- All SQL uses parameterized queries via `pg` — no string-concatenated SQL anywhere.
- Zod schema validation on every route's body/params/query.
- Helmet security headers with a strict Content-Security-Policy (no inline scripts/styles).
- express-rate-limit on auth, password-reset, and payment endpoints.
- Role-based access control re-checked against the database on every request (not just at login).
- Full audit log of authentication and state-changing actions.

See [docs/SECURITY.md](docs/SECURITY.md) for the full write-up and known
simplifications made for this exercise.

This application is intended for a controlled classroom / CTF-style
penetration-testing exercise. Review `docs/SECURITY.md` before exposing it
beyond a local or isolated lab network.
