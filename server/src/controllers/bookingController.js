'use strict';
const { query } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');
const bookingService = require('../services/bookingService');
const paymentService = require('../services/payment');
const ticketService = require('../services/ticket');

async function fetchBookingDetail(bookingId) {
    const bookingResult = await query(
        `SELECT b.id, b.booking_ref, b.user_id, b.status, b.total_price_cents, b.currency, b.created_at,
                f.id AS flight_id, f.flight_number, f.origin_code, o.city AS origin_city,
                f.destination_code, d.city AS destination_city,
                f.departure_time, f.arrival_time, f.gate, f.terminal
         FROM bookings b
         JOIN flights f ON f.id = b.flight_id
         JOIN airports o ON o.code = f.origin_code
         JOIN airports d ON d.code = f.destination_code
         WHERE b.id = $1`,
        [bookingId]
    );
    const row = bookingResult.rows[0];
    if (!row) return null;

    const itemsResult = await query(
        `SELECT bi.id, bi.passenger_first_name, bi.passenger_last_name, bi.class, bi.price_cents, bi.status,
                fs.seat_number
         FROM booking_items bi
         JOIN flight_seats fs ON fs.id = bi.seat_id
         WHERE bi.booking_id = $1
         ORDER BY fs.seat_number`,
        [bookingId]
    );

    return {
        id: row.id,
        bookingRef: row.booking_ref,
        userId: row.user_id,
        status: row.status,
        totalPriceCents: row.total_price_cents,
        currency: row.currency,
        createdAt: row.created_at,
        flight: {
            id: row.flight_id,
            flightNumber: row.flight_number,
            originCode: row.origin_code,
            originCity: row.origin_city,
            destinationCode: row.destination_code,
            destinationCity: row.destination_city,
            departureTime: row.departure_time,
            arrivalTime: row.arrival_time,
            gate: row.gate,
            terminal: row.terminal
        },
        passengers: itemsResult.rows.map((i) => ({
            id: i.id,
            firstName: i.passenger_first_name,
            lastName: i.passenger_last_name,
            seatNumber: i.seat_number,
            class: i.class,
            priceCents: i.price_cents,
            status: i.status
        }))
    };
}

function assertOwnerOrStaff(booking, requester) {
    const isOwner = booking.userId === requester.id;
    const isStaffOrAdmin = ['staff', 'admin'].includes(requester.role);
    if (!isOwner && !isStaffOrAdmin) {
        throw new AppError(403, 'Not authorized to access this booking');
    }
}

async function createBooking(req, res, next) {
    try {
        const { flightId, passengers } = req.body;
        const booking = await bookingService.createBooking({ userId: req.currentUser.id, flightId, passengers });
        await recordAudit({ req, action: 'booking_created', entityType: 'booking', entityId: booking.id, details: { flightId } });
        res.status(201).json({ booking });
    } catch (err) {
        next(err);
    }
}

async function listMyBookings(req, res, next) {
    try {
        const result = await query(
            `SELECT b.id, b.booking_ref, b.status, b.total_price_cents, b.currency, b.created_at,
                    f.flight_number, f.origin_code, f.destination_code, f.departure_time, f.arrival_time
             FROM bookings b
             JOIN flights f ON f.id = b.flight_id
             WHERE b.user_id = $1
             ORDER BY b.created_at DESC`,
            [req.currentUser.id]
        );
        res.json({
            bookings: result.rows.map((r) => ({
                id: r.id,
                bookingRef: r.booking_ref,
                status: r.status,
                totalPriceCents: r.total_price_cents,
                currency: r.currency,
                createdAt: r.created_at,
                flightNumber: r.flight_number,
                originCode: r.origin_code,
                destinationCode: r.destination_code,
                departureTime: r.departure_time,
                arrivalTime: r.arrival_time
            }))
        });
    } catch (err) {
        next(err);
    }
}

async function getBooking(req, res, next) {
    try {
        const booking = await fetchBookingDetail(req.params.id);
        if (!booking) throw new AppError(404, 'Booking not found');
        assertOwnerOrStaff(booking, req.currentUser);
        res.json({ booking });
    } catch (err) {
        next(err);
    }
}

async function cancelBooking(req, res, next) {
    try {
        await bookingService.cancelBooking({ bookingId: req.params.id, requester: req.currentUser });
        await recordAudit({ req, action: 'booking_cancelled', entityType: 'booking', entityId: req.params.id });
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function payBooking(req, res, next) {
    try {
        const booking = await fetchBookingDetail(req.params.id);
        if (!booking) throw new AppError(404, 'Booking not found');
        assertOwnerOrStaff(booking, req.currentUser);

        if (booking.status !== 'pending_payment') {
            throw new AppError(409, 'Booking is not awaiting payment');
        }

        const { cardholderName, cardNumber, expMonth, expYear, cvc } = req.body;
        const result = paymentService.processPayment({ cardNumber, expMonth, expYear, cvc });

        await query(
            `INSERT INTO payments (booking_id, amount_cents, method, card_last4, card_brand, status, transaction_ref)
             VALUES ($1, $2, 'card', $3, $4, $5, $6)`,
            [booking.id, booking.totalPriceCents, result.last4, result.brand, result.approved ? 'succeeded' : 'failed', result.transactionRef]
        );

        if (!result.approved) {
            await recordAudit({ req, action: 'payment_declined', entityType: 'booking', entityId: booking.id, details: { reason: result.reason } });
            return res.status(402).json({ error: result.reason || 'Payment declined' });
        }

        await query(`UPDATE bookings SET status = 'confirmed' WHERE id = $1`, [booking.id]);
        await query(
            `UPDATE flight_seats SET status = 'booked'
             WHERE id IN (SELECT seat_id FROM booking_items WHERE booking_id = $1)`,
            [booking.id]
        );
        await recordAudit({ req, action: 'payment_succeeded', entityType: 'booking', entityId: booking.id, details: { transactionRef: result.transactionRef } });

        const updated = await fetchBookingDetail(booking.id);
        res.json({ booking: updated, transactionRef: result.transactionRef });
    } catch (err) {
        next(err);
    }
}

async function downloadETicket(req, res, next) {
    try {
        const booking = await fetchBookingDetail(req.params.id);
        if (!booking) throw new AppError(404, 'Booking not found');
        assertOwnerOrStaff(booking, req.currentUser);

        if (booking.status !== 'confirmed' && booking.status !== 'checked_in' && booking.status !== 'completed') {
            throw new AppError(409, 'E-ticket is only available for confirmed bookings');
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="eticket-${booking.bookingRef}.pdf"`);
        await recordAudit({ req, action: 'eticket_downloaded', entityType: 'booking', entityId: booking.id });
        ticketService.streamETicket(res, booking);
    } catch (err) {
        next(err);
    }
}

module.exports = { createBooking, listMyBookings, getBooking, cancelBooking, payBooking, downloadETicket, fetchBookingDetail };
