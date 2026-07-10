'use strict';
const { query, withTransaction } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { generateBookingRef } = require('../utils/bookingRef');
const seatLock = require('./seatLock');

const PENDING_BOOKING_TIMEOUT_MINUTES = 15;

/**
 * Self-cleaning sweep: any booking still 'pending_payment' after the
 * timeout is auto-cancelled and its seats released back to 'available'.
 * Runs inline (best-effort) instead of a separate cron job, keeping the
 * seat inventory consistent without extra infrastructure.
 */
async function releaseStaleBookings(flightId) {
    await withTransaction(async (client) => {
        const stale = await client.query(
            `SELECT id FROM bookings
             WHERE flight_id = $1 AND status = 'pending_payment'
               AND created_at < now() - ($2 || ' minutes')::interval
             FOR UPDATE`,
            [flightId, PENDING_BOOKING_TIMEOUT_MINUTES]
        );
        if (stale.rowCount === 0) return;

        const bookingIds = stale.rows.map((r) => r.id);
        await client.query(
            `UPDATE flight_seats SET status = 'available'
             WHERE id IN (SELECT seat_id FROM booking_items WHERE booking_id = ANY($1::bigint[]))`,
            [bookingIds]
        );
        await client.query(
            `UPDATE booking_items SET status = 'cancelled' WHERE booking_id = ANY($1::bigint[])`,
            [bookingIds]
        );
        await client.query(
            `UPDATE bookings SET status = 'cancelled' WHERE id = ANY($1::bigint[])`,
            [bookingIds]
        );
    });
}

async function createBooking({ userId, flightId, passengers }) {
    await releaseStaleBookings(flightId);

    return withTransaction(async (client) => {
        const flightResult = await client.query(
            `SELECT id, status FROM flights WHERE id = $1 FOR UPDATE`,
            [flightId]
        );
        const flight = flightResult.rows[0];
        if (!flight) throw new AppError(404, 'Flight not found');
        if (['cancelled', 'departed', 'arrived'].includes(flight.status)) {
            throw new AppError(409, 'This flight is no longer available for booking');
        }

        const seatIds = passengers.map((p) => p.seatId);
        const uniqueSeatIds = new Set(seatIds);
        if (uniqueSeatIds.size !== seatIds.length) {
            throw new AppError(400, 'Duplicate seat selected for multiple passengers');
        }

        const seatsResult = await client.query(
            `SELECT id, seat_number, class, price_cents, status FROM flight_seats
             WHERE id = ANY($1::bigint[]) AND flight_id = $2 FOR UPDATE`,
            [seatIds, flightId]
        );
        if (seatsResult.rowCount !== seatIds.length) {
            throw new AppError(400, 'One or more selected seats do not belong to this flight');
        }
        const seatsById = new Map(seatsResult.rows.map((s) => [String(s.id), s]));

        for (const seatId of seatIds) {
            const seat = seatsById.get(String(seatId));
            if (seat.status !== 'available') {
                throw new AppError(409, `Seat ${seat.seat_number} is no longer available`);
            }
            const heldByOther = await seatLock.isHeldByOther(seatId, userId);
            if (heldByOther) {
                throw new AppError(409, `Seat ${seat.seat_number} is currently held by another customer`);
            }
        }

        const totalPriceCents = passengers.reduce((sum, p) => sum + seatsById.get(String(p.seatId)).price_cents, 0);
        const bookingRef = await generateBookingRef();

        const bookingResult = await client.query(
            `INSERT INTO bookings (booking_ref, user_id, flight_id, status, total_price_cents)
             VALUES ($1, $2, $3, 'pending_payment', $4)
             RETURNING id, booking_ref, status, total_price_cents, created_at`,
            [bookingRef, userId, flightId, totalPriceCents]
        );
        const booking = bookingResult.rows[0];

        for (const p of passengers) {
            const seat = seatsById.get(String(p.seatId));
            await client.query(
                `INSERT INTO booking_items (booking_id, seat_id, passenger_first_name, passenger_last_name, passenger_dob, class, price_cents, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'booked')`,
                [booking.id, p.seatId, p.firstName, p.lastName, p.dob || null, seat.class, seat.price_cents]
            );
            await client.query(`UPDATE flight_seats SET status = 'blocked' WHERE id = $1`, [p.seatId]);
        }

        for (const seatId of seatIds) {
            await seatLock.releaseSeat(seatId, userId);
        }

        return booking;
    });
}

async function cancelBooking({ bookingId, requester }) {
    return withTransaction(async (client) => {
        const result = await client.query(
            `SELECT id, user_id, status FROM bookings WHERE id = $1 FOR UPDATE`,
            [bookingId]
        );
        const booking = result.rows[0];
        if (!booking) throw new AppError(404, 'Booking not found');

        const isOwner = booking.user_id === requester.id;
        const isStaffOrAdmin = ['staff', 'admin'].includes(requester.role);
        if (!isOwner && !isStaffOrAdmin) throw new AppError(403, 'Not authorized to cancel this booking');

        if (['cancelled', 'completed'].includes(booking.status)) {
            throw new AppError(409, 'Booking cannot be cancelled in its current state');
        }

        const items = await client.query('SELECT seat_id FROM booking_items WHERE booking_id = $1', [bookingId]);
        const seatIds = items.rows.map((r) => r.seat_id);

        if (seatIds.length) {
            await client.query(`UPDATE flight_seats SET status = 'available' WHERE id = ANY($1::bigint[])`, [seatIds]);
        }
        await client.query(`UPDATE booking_items SET status = 'cancelled' WHERE booking_id = $1`, [bookingId]);
        await client.query(`UPDATE bookings SET status = 'cancelled' WHERE id = $1`, [bookingId]);

        return { id: bookingId };
    });
}

module.exports = { releaseStaleBookings, createBooking, cancelBooking, PENDING_BOOKING_TIMEOUT_MINUTES };
