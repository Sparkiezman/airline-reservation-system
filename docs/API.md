# API Reference

Base URL: `http://localhost:3000/api`

All requests/responses are JSON unless noted. Authentication is
session-cookie based (`airline.sid`, httpOnly). Every mutating request
(POST/PUT/DELETE) must include an `X-CSRF-Token` header — fetch it first from
`GET /api/auth/csrf-token`. The bundled `public/js/api.js` client does this
automatically.

## Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/csrf-token` | none | Returns `{ csrfToken }` for the current session. |
| POST | `/register` | none | `{ firstName, lastName, email, password, phone? }` → creates a `customer` account and logs in. |
| POST | `/login` | none | `{ email, password }` → establishes a session. Rate-limited; locks account after repeated failures. |
| POST | `/logout` | session | Destroys the session. |
| GET | `/me` | session | Current user profile. |
| PUT | `/profile` | session | `{ firstName, lastName, phone? }`. |
| POST | `/change-password` | session | `{ currentPassword, newPassword }`. |
| POST | `/forgot-password` | none | `{ email }` → generic response; in non-production, also returns `devResetToken` (no email service is wired up). |
| POST | `/reset-password` | none | `{ token, newPassword }`. |

## Flights — `/api/flights` (public read, auth required to hold seats)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/airports` | none | List of airports for search typeahead. |
| GET | `/search?origin=&destination=&date=&passengers=` | none | Flights matching route/date with enough available seats. |
| GET | `/:id` | none | Flight detail. |
| GET | `/:id/seats` | none (session-aware) | Seat map with `available` / `held` / `held_by_you` / `booked` status. |
| POST | `/:id/seats/:seatId/hold` | session | Reserves a seat in Redis for `SEAT_HOLD_SECONDS`. |
| DELETE | `/:id/seats/:seatId/hold` | session | Releases your own hold. |

## Bookings — `/api/bookings` (all require session)

| Method | Path | Description |
|---|---|---|
| POST | `/` | `{ flightId, passengers: [{ seatId, firstName, lastName, dob? }] }` → creates a `pending_payment` booking. |
| GET | `/` | Your booking history. |
| GET | `/:id` | Booking detail (owner, staff, or admin only). |
| POST | `/:id/cancel` | Cancels a pending or confirmed booking and releases its seats. |
| POST | `/:id/pay` | `{ cardholderName, cardNumber, expMonth, expYear, cvc }` → simulated charge. See `SECURITY.md` for test card behavior. |
| GET | `/:id/eticket` | Streams a PDF e-ticket (confirmed/checked-in/completed bookings only). |

## Staff — `/api/staff` (requires `staff` or `admin` role)

| Method | Path | Description |
|---|---|---|
| GET | `/flights` | All flights with booking counts. |
| POST | `/flights` | Create a flight (also generates its seat map from the aircraft's layout). |
| PUT | `/flights/:id` | Update status/gate/terminal/prices/times. |
| POST | `/flights/:id/cancel` | Cancels the flight and all its active bookings (simulated refund). |
| GET | `/flights/:id/manifest` | Passenger list for a flight. |
| POST | `/booking-items/:bookingItemId/check-in` | Marks a passenger checked in. |
| GET | `/aircraft` | List aircraft. |
| POST | `/aircraft` | Create aircraft (rows/columns/class sections define its seat map). |
| PUT | `/aircraft/:id/status` | `{ status: 'active' \| 'maintenance' \| 'retired' }`. |

## Admin — `/api/admin` (requires `admin` role)

| Method | Path | Description |
|---|---|---|
| GET | `/users?search=&role=&page=&pageSize=` | Paginated user list. |
| PUT | `/users/:id/role` | `{ role }` — cannot change your own role. |
| PUT | `/users/:id/status` | `{ isActive }` — cannot disable your own account. |
| GET | `/audit-logs?action=&userId=&page=&pageSize=` | Paginated audit trail. |
| GET | `/settings` | List system settings. |
| PUT | `/settings/:key` | `{ value }` — upserts a setting. |

## Error format

```json
{ "error": "Human-readable message", "details": [{ "path": "body.email", "message": "Invalid email address" }] }
```

`details` is only present for validation failures (HTTP 400).
