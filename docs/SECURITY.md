# Security Notes

This document describes the controls implemented in SkyReserve, why they were
chosen, and — since this app is meant to be attacked as part of a class
exercise — the simplifications made that a real production system would need
to close.

## Controls implemented (mapped to OWASP Top 10 / ASVS themes)

**Authentication**
- Passwords hashed with bcrypt, cost factor 12 (`server/src/config/env.js` → `BCRYPT_COST`).
- Failed-login lockout: `MAX_LOGIN_ATTEMPTS` failures locks the account for `LOGIN_LOCKOUT_MINUTES` (`authController.login`).
- Login/registration responses are generic ("Invalid email or password") to avoid user enumeration; a dummy bcrypt comparison runs on the "user not found" path so response timing doesn't leak account existence.
- Password reset tokens are single-use, expire in 30 minutes, and are stored as a SHA-256 hash (never the raw token) in `password_reset_tokens`.
- Session is regenerated (`req.session.regenerate`) on login/register to prevent session fixation.

**Session management**
- Sessions live server-side in Redis (`connect-redis`), not as a client-trusted JWT — logout/lockout/role-change take effect immediately.
- Cookie flags: `httpOnly`, `sameSite=lax`, `secure` (once `COOKIE_SECURE=true` behind HTTPS).
- `requireAuth` middleware re-queries the user's `is_active`/`role` from Postgres on **every** request, so a disabled account or role change is enforced instantly, not just at next login.

**CSRF**
- Synchronizer-token pattern (`server/src/middleware/csrf.js`): a random token is bound to the session and must be echoed back in `X-CSRF-Token` on every mutating request. `csurf` was deliberately avoided since it's deprecated/unmaintained.

**Injection**
- Every database call uses parameterized queries (`$1, $2, ...` via `pg`) — see `server/src/config/db.js`. No string concatenation of user input into SQL anywhere in the codebase. Try it: this is the one control worth fuzzing hardest, since a single regression would reintroduce SQLi.

**XSS**
- Strict CSP (`server/src/middleware/security.js`): no `unsafe-inline`, no remote script/style origins. All frontend JS lives in external files under `public/js/`.
- All dynamic content rendered by the frontend goes through `escapeHtml()` (`public/js/api.js`) before being inserted via `innerHTML`.

**Access control / IDOR**
- Every booking/flight/admin route checks the resource's owner or the caller's role server-side (`assertOwnerOrStaff` in `bookingController.js`, `requireRole` middleware) — not merely obscured IDs. Booking IDs are sequential on purpose, as a teaching point: authorization must not depend on unguessable identifiers. `booking_ref` (the customer-facing PNR) is a separate random code, but access is still enforced by ownership check, not by the ref being secret.

**Input validation**
- Every route validates `body`/`params`/`query` with `zod` schemas (`server/src/validators/`) before the handler runs.

**Rate limiting**
- `express-rate-limit` on general API traffic, and tighter limits specifically on `/auth/login`, `/auth/register`, `/auth/forgot-password`, and `/bookings/:id/pay` (`server/src/middleware/rateLimit.js`).

**Security headers**
- `helmet` sets CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, disables `X-Powered-By`, etc.
- `hpp` middleware strips HTTP Parameter Pollution attempts (duplicate query/body keys).

**Logging / audit trail**
- `winston` structured logs to `server/logs/`.
- A dedicated `audit_logs` table records authentication events, bookings, payments, and every staff/admin mutation, including actor, IP, user agent, and a JSON detail blob (`server/src/utils/audit.js`). Viewable in the admin dashboard's Audit Logs tab.

**Payment simulation**
- No real payment gateway or card storage. Only a Luhn check, brand guess, last-4 digits, and expiry check happen server-side (`server/src/services/payment.js`). Any Luhn-valid number **not** ending in `0002` is "approved"; numbers ending in `0002` are a deterministic decline for testing. This keeps PCI scope at zero while still exercising validation logic.

## Known simplifications (intentional, for pentest realism/scope)

These are reasonable places to focus a penetration test, and reasonable
follow-ups if this were headed to production:

1. **No email delivery.** Password reset tokens are returned directly in the API response outside of `NODE_ENV=production` (`authController.forgotPassword`) since no SMTP/email provider is wired up. In production this must be sent by email only, never returned in the response.
2. **No global session revocation index.** Changing a password does not invalidate that user's other active sessions (no per-user session index is kept in Redis). Disabling a user *does* take effect immediately (checked in `requireAuth`), but a plain password change doesn't force other devices to re-authenticate.
3. **No abandoned-booking cron.** Seats "blocked" by a `pending_payment` booking are released lazily (`releaseStaleBookings` runs inline before the next booking attempt on that flight) rather than by a background job. Under low traffic a stale hold could sit blocked slightly past its 15-minute window.
4. **No file uploads.** No profile pictures or attachments — removes an entire class of upload-based vulnerabilities from scope, since it wasn't a stated requirement.
5. **No MFA.** Single-factor password auth only.
6. **`tar`/`@mapbox/node-pre-gyp` transitive advisory.** `npm audit` flags a high-severity advisory in `tar`, pulled in only as a *build-time* dependency of `bcrypt`'s native compilation step (`node-pre-gyp`). It is not present in the request-handling path at runtime. Worth knowing about if you're auditing the dependency tree, not exploitable via the running app.
7. **CSP has no `report-uri`.** Violations are blocked but not centrally logged; add a reporting endpoint before relying on CSP telemetry.

## Suggested things to test

- IDOR on `/api/bookings/:id`, `/api/bookings/:id/eticket` with another user's numeric ID (should 403/404, not leak data).
- Privilege escalation via `role` in the `/api/auth/register` body (server ignores any client-supplied role — always `customer`).
- CSRF replay without a valid `X-CSRF-Token` (should 403).
- Brute force on `/api/auth/login` past `MAX_LOGIN_ATTEMPTS` (should 423 lockout).
- Double-booking race: two browsers holding/booking the same seat concurrently (seat `FOR UPDATE` locking + Redis hold should prevent it).
- SQLi payloads in every text field — all queries are parameterized, but regressions are the highest-value bug class here.
- Stored/reflected XSS in passenger names, profile fields, admin settings values — all render paths go through `escapeHtml`.
