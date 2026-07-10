'use strict';
const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');
const seatGenerator = require('../services/seatGenerator');

// ---------- Flights ----------

async function listFlights(req, res, next) {
    try {
        const result = await query(
            `SELECT f.id, f.flight_number, f.origin_code, f.destination_code, f.departure_time, f.arrival_time,
                    f.gate, f.terminal, f.status, f.base_price_economy_cents, f.base_price_business_cents, f.base_price_first_cents,
                    a.tail_number, a.model,
                    COUNT(b.id) FILTER (WHERE b.status IN ('confirmed','checked_in','completed')) AS confirmed_bookings
             FROM flights f
             JOIN aircraft a ON a.id = f.aircraft_id
             LEFT JOIN bookings b ON b.flight_id = f.id
             GROUP BY f.id, a.tail_number, a.model
             ORDER BY f.departure_time DESC`
        );
        res.json({
            flights: result.rows.map((r) => ({
                id: r.id,
                flightNumber: r.flight_number,
                originCode: r.origin_code,
                destinationCode: r.destination_code,
                departureTime: r.departure_time,
                arrivalTime: r.arrival_time,
                gate: r.gate,
                terminal: r.terminal,
                status: r.status,
                basePriceEconomyCents: r.base_price_economy_cents,
                basePriceBusinessCents: r.base_price_business_cents,
                basePriceFirstCents: r.base_price_first_cents,
                aircraftTailNumber: r.tail_number,
                aircraftModel: r.model,
                confirmedBookings: Number(r.confirmed_bookings)
            }))
        });
    } catch (err) {
        next(err);
    }
}

async function createFlight(req, res, next) {
    try {
        const {
            flightNumber, aircraftId, originCode, destinationCode,
            departureTime, arrivalTime, basePriceEconomyCents, basePriceBusinessCents, basePriceFirstCents, gate, terminal
        } = req.body;

        const flight = await withTransaction(async (client) => {
            const aircraftResult = await client.query('SELECT id, seat_layout, status FROM aircraft WHERE id = $1', [aircraftId]);
            const aircraft = aircraftResult.rows[0];
            if (!aircraft) throw new AppError(404, 'Aircraft not found');
            if (aircraft.status !== 'active') throw new AppError(409, 'Aircraft is not active');

            const [originExists, destExists] = await Promise.all([
                client.query('SELECT 1 FROM airports WHERE code = $1', [originCode]),
                client.query('SELECT 1 FROM airports WHERE code = $1', [destinationCode])
            ]);
            if (!originExists.rowCount) throw new AppError(400, 'Unknown origin airport code');
            if (!destExists.rowCount) throw new AppError(400, 'Unknown destination airport code');

            const insertResult = await client.query(
                `INSERT INTO flights (flight_number, aircraft_id, origin_code, destination_code, departure_time,
                                       arrival_time, base_price_economy_cents, base_price_business_cents, base_price_first_cents,
                                       gate, terminal, created_by)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
                 RETURNING id, flight_number, status`,
                [flightNumber, aircraftId, originCode, destinationCode, departureTime, arrivalTime,
                    basePriceEconomyCents, basePriceBusinessCents, basePriceFirstCents, gate || null, terminal || null, req.currentUser.id]
            );
            const newFlight = insertResult.rows[0];

            await seatGenerator.insertSeatsForFlight(client, newFlight.id, aircraft.seat_layout, {
                economy: basePriceEconomyCents,
                business: basePriceBusinessCents,
                first: basePriceFirstCents
            });
            return newFlight;
        });

        await recordAudit({ req, action: 'flight_created', entityType: 'flight', entityId: flight.id, details: { flightNumber } });
        res.status(201).json({ flight });
    } catch (err) {
        next(err);
    }
}

async function updateFlight(req, res, next) {
    try {
        const { id } = req.params;
        const fields = req.body;
        const allowed = ['departureTime', 'arrivalTime', 'gate', 'terminal', 'status', 'basePriceEconomyCents', 'basePriceBusinessCents', 'basePriceFirstCents'];
        const columnMap = {
            departureTime: 'departure_time', arrivalTime: 'arrival_time', gate: 'gate', terminal: 'terminal',
            status: 'status', basePriceEconomyCents: 'base_price_economy_cents', basePriceBusinessCents: 'base_price_business_cents',
            basePriceFirstCents: 'base_price_first_cents'
        };

        const setClauses = [];
        const values = [];
        let idx = 1;
        for (const key of allowed) {
            if (fields[key] !== undefined) {
                setClauses.push(`${columnMap[key]} = $${idx}`);
                values.push(fields[key]);
                idx++;
            }
        }
        if (!setClauses.length) throw new AppError(400, 'No valid fields to update');
        values.push(id);

        const result = await query(
            `UPDATE flights SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING id, flight_number, status`,
            values
        );
        if (!result.rows[0]) throw new AppError(404, 'Flight not found');

        await recordAudit({ req, action: 'flight_updated', entityType: 'flight', entityId: id, details: fields });
        res.json({ flight: result.rows[0] });
    } catch (err) {
        next(err);
    }
}

async function cancelFlight(req, res, next) {
    try {
        const { id } = req.params;
        await withTransaction(async (client) => {
            const flightResult = await client.query('SELECT id, status FROM flights WHERE id = $1 FOR UPDATE', [id]);
            if (!flightResult.rows[0]) throw new AppError(404, 'Flight not found');

            await client.query(`UPDATE flights SET status = 'cancelled' WHERE id = $1`, [id]);

            const bookings = await client.query(
                `SELECT id FROM bookings WHERE flight_id = $1 AND status IN ('pending_payment','confirmed','checked_in')`,
                [id]
            );
            const bookingIds = bookings.rows.map((r) => r.id);
            if (bookingIds.length) {
                await client.query(`UPDATE bookings SET status = 'cancelled' WHERE id = ANY($1::bigint[])`, [bookingIds]);
                await client.query(`UPDATE booking_items SET status = 'cancelled' WHERE booking_id = ANY($1::bigint[])`, [bookingIds]);
                await client.query(
                    `UPDATE payments SET status = 'refunded' WHERE booking_id = ANY($1::bigint[]) AND status = 'succeeded'`,
                    [bookingIds]
                );
            }
        });

        await recordAudit({ req, action: 'flight_cancelled', entityType: 'flight', entityId: id });
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function getManifest(req, res, next) {
    try {
        const { id } = req.params;
        const result = await query(
            `SELECT bi.id AS booking_item_id, bi.passenger_first_name, bi.passenger_last_name, bi.status AS item_status,
                    fs.seat_number, fs.class, b.id AS booking_id, b.booking_ref, b.status AS booking_status,
                    u.email AS booked_by_email
             FROM booking_items bi
             JOIN flight_seats fs ON fs.id = bi.seat_id
             JOIN bookings b ON b.id = bi.booking_id
             JOIN users u ON u.id = b.user_id
             WHERE fs.flight_id = $1 AND bi.status != 'cancelled'
             ORDER BY fs.seat_number`,
            [id]
        );
        res.json({
            manifest: result.rows.map((r) => ({
                bookingItemId: r.booking_item_id,
                passengerName: `${r.passenger_first_name} ${r.passenger_last_name}`,
                seatNumber: r.seat_number,
                class: r.class,
                itemStatus: r.item_status,
                bookingId: r.booking_id,
                bookingRef: r.booking_ref,
                bookingStatus: r.booking_status,
                bookedByEmail: r.booked_by_email
            }))
        });
    } catch (err) {
        next(err);
    }
}

async function checkInPassenger(req, res, next) {
    try {
        const { bookingItemId } = req.params;
        const result = await query(
            `UPDATE booking_items SET status = 'checked_in'
             WHERE id = $1 AND status = 'booked'
             RETURNING id, booking_id`,
            [bookingItemId]
        );
        if (!result.rows[0]) throw new AppError(404, 'Booking item not found or already checked in');

        await query(
            `UPDATE bookings SET status = 'checked_in'
             WHERE id = $1 AND NOT EXISTS (
                 SELECT 1 FROM booking_items WHERE booking_id = $1 AND status = 'booked'
             )`,
            [result.rows[0].booking_id]
        );

        await recordAudit({ req, action: 'passenger_checked_in', entityType: 'booking_item', entityId: bookingItemId });
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

// ---------- Aircraft ----------

async function listAircraft(req, res, next) {
    try {
        const result = await query('SELECT id, tail_number, model, manufacturer, total_seats, seat_layout, status FROM aircraft ORDER BY tail_number');
        res.json({ aircraft: result.rows });
    } catch (err) {
        next(err);
    }
}

async function createAircraft(req, res, next) {
    try {
        const {
            tailNumber, model, manufacturer, rows, cols,
            firstRowStart, firstRowEnd, businessRowStart, businessRowEnd, economyRowStart, economyRowEnd
        } = req.body;

        const sections = [];
        if (firstRowEnd >= firstRowStart && firstRowStart > 0) {
            sections.push({ class: 'first', rowStart: firstRowStart, rowEnd: firstRowEnd });
        }
        if (businessRowEnd >= businessRowStart) {
            sections.push({ class: 'business', rowStart: businessRowStart, rowEnd: businessRowEnd });
        }
        sections.push({ class: 'economy', rowStart: economyRowStart, rowEnd: economyRowEnd });

        const seatLayout = { rows, cols, sections };
        const totalSeats = rows * cols.length;

        const result = await query(
            `INSERT INTO aircraft (tail_number, model, manufacturer, total_seats, seat_layout, status)
             VALUES ($1, $2, $3, $4, $5, 'active')
             RETURNING id, tail_number, model, manufacturer, total_seats, seat_layout, status`,
            [tailNumber, model, manufacturer || null, totalSeats, JSON.stringify(seatLayout)]
        );

        await recordAudit({ req, action: 'aircraft_created', entityType: 'aircraft', entityId: result.rows[0].id });
        res.status(201).json({ aircraft: result.rows[0] });
    } catch (err) {
        next(err);
    }
}

async function updateAircraftStatus(req, res, next) {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!['active', 'maintenance', 'retired'].includes(status)) {
            throw new AppError(400, 'Invalid status');
        }
        const result = await query(
            'UPDATE aircraft SET status = $1 WHERE id = $2 RETURNING id, tail_number, status',
            [status, id]
        );
        if (!result.rows[0]) throw new AppError(404, 'Aircraft not found');

        await recordAudit({ req, action: 'aircraft_status_updated', entityType: 'aircraft', entityId: id, details: { status } });
        res.json({ aircraft: result.rows[0] });
    } catch (err) {
        next(err);
    }
}

module.exports = {
    listFlights, createFlight, updateFlight, cancelFlight, getManifest, checkInPassenger,
    listAircraft, createAircraft, updateAircraftStatus
};
