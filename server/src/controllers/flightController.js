'use strict';
const { query } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const seatLock = require('../services/seatLock');

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
        const result = await query('SELECT code, name, city, country FROM airports ORDER BY city');
        res.json({ airports: result.rows });
    } catch (err) {
        next(err);
    }
}

async function searchFlights(req, res, next) {
    try {
        const { origin, destination, date, passengers } = req.query;

        const result = await query(
            `SELECT f.id, f.flight_number, f.origin_code, o.city AS origin_city,
                    f.destination_code, d.city AS destination_city,
                    f.departure_time, f.arrival_time, f.gate, f.terminal, f.status,
                    f.base_price_economy_cents, f.base_price_business_cents, f.base_price_first_cents,
                    COUNT(fs.id) FILTER (WHERE fs.status = 'available') AS seats_available
             FROM flights f
             JOIN airports o ON o.code = f.origin_code
             JOIN airports d ON d.code = f.destination_code
             LEFT JOIN flight_seats fs ON fs.flight_id = f.id
             WHERE f.origin_code = $1
               AND f.destination_code = $2
               AND f.departure_time::date = $3::date
               AND f.status NOT IN ('cancelled')
             GROUP BY f.id, o.city, d.city
             HAVING COUNT(fs.id) FILTER (WHERE fs.status = 'available') >= $4
             ORDER BY f.departure_time ASC`,
            [origin, destination, date, passengers]
        );

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
