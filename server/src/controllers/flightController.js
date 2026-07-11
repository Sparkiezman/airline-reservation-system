'use strict';
const { query } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const seatLock = require('../services/seatLock');
const scheduleGenerator = require('../services/scheduleGenerator');

/** Resolves a free-text search term (code, city, or airport name) to the single best-matching airport code, or null. */
async function resolveAirportCode(term) {
    const result = await query(
        `SELECT code FROM airports
         WHERE code = UPPER($1) OR city ILIKE $1 OR name ILIKE '%' || $1 || '%' OR city ILIKE '%' || $1 || '%'
         ORDER BY
           CASE
             WHEN code = UPPER($1) THEN 0
             WHEN city ILIKE $1 THEN 1
             WHEN city ILIKE $1 || '%' THEN 2
             ELSE 3
           END,
           city
         LIMIT 1`,
        [term]
    );
    return result.rows[0] ? result.rows[0].code : null;
}

function toFlightSummary(row) {
    return {
        id: row.id,
        flightNumber: row.flight_number,
        originCode: row.origin_code,
        originCity: row.origin_city,
        destinationCode: row.destination_code,
        destinationCity: row.destination_city,
        departureTime: row.departure_time,
        arrivalTime: row.arrival_time,
        gate: row.gate,
        terminal: row.terminal,
        status: row.status,
        basePriceEconomy: row.base_price_economy_cents,
        basePriceBusiness: row.base_price_business_cents,
        basePriceFirst: row.base_price_first_cents,
        seatsAvailable: row.seats_available != null ? Number(row.seats_available) : undefined
    };
}

async function listAirports(req, res, next) {
    try {
        const { q } = req.query;

        if (!q) {
            const result = await query('SELECT code, name, city, country FROM airports ORDER BY city LIMIT 50');
            return res.json({ airports: result.rows });
        }

        const result = await query(
            `SELECT code, name, city, country FROM airports
             WHERE code = UPPER($1) OR city ILIKE '%' || $1 || '%' OR name ILIKE '%' || $1 || '%' OR country ILIKE '%' || $1 || '%'
             ORDER BY
               CASE
                 WHEN code = UPPER($1) THEN 0
                 WHEN city ILIKE $1 THEN 1
                 WHEN city ILIKE $1 || '%' THEN 2
                 ELSE 3
               END,
               city
             LIMIT 20`,
            [q]
        );
        res.json({ airports: result.rows });
    } catch (err) {
        next(err);
    }
}

async function searchFlights(req, res, next) {
    try {
        const { origin, destination, date, passengers } = req.query;

        const runSearch = () => query(
            `SELECT f.id, f.flight_number, f.origin_code, o.city AS origin_city,
                    f.destination_code, d.city AS destination_city,
                    f.departure_time, f.arrival_time, f.gate, f.terminal, f.status,
                    f.base_price_economy_cents, f.base_price_business_cents, f.base_price_first_cents,
                    COUNT(fs.id) FILTER (WHERE fs.status = 'available') AS seats_available
             FROM flights f
             JOIN airports o ON o.code = f.origin_code
             JOIN airports d ON d.code = f.destination_code
             LEFT JOIN flight_seats fs ON fs.flight_id = f.id
             WHERE (o.code = UPPER($1) OR o.city ILIKE '%' || $1 || '%' OR o.name ILIKE '%' || $1 || '%')
               AND (d.code = UPPER($2) OR d.city ILIKE '%' || $2 || '%' OR d.name ILIKE '%' || $2 || '%')
               AND f.departure_time::date = $3::date
               AND f.status NOT IN ('cancelled')
             GROUP BY f.id, o.city, d.city
             HAVING COUNT(fs.id) FILTER (WHERE fs.status = 'available') >= $4
             ORDER BY f.departure_time ASC`,
            [origin, destination, date, passengers]
        );

        let result = await runSearch();

        // No pre-existing flight for this route/date — if both endpoints
        // resolve to real, distinct airports, derive and generate a route
        // on the fly so any real city/country pair is bookable immediately.
        if (result.rowCount === 0) {
            const [originCode, destinationCode] = await Promise.all([
                resolveAirportCode(origin),
                resolveAirportCode(destination)
            ]);
            if (originCode && destinationCode && originCode !== destinationCode) {
                await scheduleGenerator.ensureRouteAvailable(originCode, destinationCode, date);
                result = await runSearch();
            }
        }

        res.json({ flights: result.rows.map(toFlightSummary) });
    } catch (err) {
        next(err);
    }
}

async function getFlight(req, res, next) {
    try {
        const result = await query(
            `SELECT f.id, f.flight_number, f.origin_code, o.city AS origin_city, o.name AS origin_name,
                    f.destination_code, d.city AS destination_city, d.name AS destination_name,
                    f.departure_time, f.arrival_time, f.gate, f.terminal, f.status,
                    f.base_price_economy_cents, f.base_price_business_cents, f.base_price_first_cents
             FROM flights f
             JOIN airports o ON o.code = f.origin_code
             JOIN airports d ON d.code = f.destination_code
             WHERE f.id = $1`,
            [req.params.id]
        );
        if (!result.rows[0]) throw new AppError(404, 'Flight not found');
        res.json({ flight: toFlightSummary(result.rows[0]) });
    } catch (err) {
        next(err);
    }
}

async function getFlightSeats(req, res, next) {
    try {
        const flightId = req.params.id;
        const flightCheck = await query('SELECT id FROM flights WHERE id = $1', [flightId]);
        if (!flightCheck.rows[0]) throw new AppError(404, 'Flight not found');

        const result = await query(
            `SELECT id, seat_number, class, price_cents, status
             FROM flight_seats WHERE flight_id = $1 ORDER BY seat_number`,
            [flightId]
        );

        const currentUserId = req.currentUser?.id;
        const seats = await Promise.all(result.rows.map(async (seat) => {
            let displayStatus = seat.status;
            if (seat.status === 'available') {
                const owner = await seatLock.getHoldOwner(seat.id);
                if (owner && String(owner) === String(currentUserId)) {
                    displayStatus = 'held_by_you';
                } else if (owner) {
                    displayStatus = 'held';
                }
            }
            return {
                id: seat.id,
                seatNumber: seat.seat_number,
                class: seat.class,
                price: seat.price_cents,
                status: displayStatus
            };
        }));

        res.json({ seats });
    } catch (err) {
        next(err);
    }
}

async function holdSeat(req, res, next) {
    try {
        const { id: flightId, seatId } = req.params;
        const seatResult = await query(
            'SELECT id, status FROM flight_seats WHERE id = $1 AND flight_id = $2',
            [seatId, flightId]
        );
        const seat = seatResult.rows[0];
        if (!seat) throw new AppError(404, 'Seat not found');
        if (seat.status !== 'available') throw new AppError(409, 'Seat is not available');

        const holdResult = await seatLock.holdSeat(seatId, req.currentUser.id);
        if (!holdResult.acquired) {
            return res.status(409).json({ error: 'Seat is currently held by another customer' });
        }
        res.json({ success: true, expiresInSeconds: holdResult.expiresInSeconds });
    } catch (err) {
        next(err);
    }
}

async function releaseSeatHold(req, res, next) {
    try {
        const { seatId } = req.params;
        await seatLock.releaseSeat(seatId, req.currentUser.id);
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

module.exports = { listAirports, searchFlights, getFlight, getFlightSeats, holdSeat, releaseSeatHold, toFlightSummary };
