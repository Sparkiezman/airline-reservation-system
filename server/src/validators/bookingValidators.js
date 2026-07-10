'use strict';
const { z } = require('zod');

const passengerSchema = z.object({
    seatId: z.coerce.number().int().positive(),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal(''))
});

const createBookingSchema = z.object({
    body: z.object({
        flightId: z.coerce.number().int().positive(),
        passengers: z.array(passengerSchema).min(1).max(6)
    })
});

const bookingIdParamSchema = z.object({
    params: z.object({ id: z.coerce.number().int().positive() })
});

const holdSeatSchema = z.object({
    params: z.object({
        id: z.coerce.number().int().positive(),
        seatId: z.coerce.number().int().positive()
    })
});

const paySchema = z.object({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({
        cardholderName: z.string().trim().min(1).max(120),
        cardNumber: z.string().trim().regex(/^[\d\s]{12,23}$/, 'Invalid card number'),
        expMonth: z.coerce.number().int().min(1).max(12),
        expYear: z.coerce.number().int().min(new Date().getFullYear()).max(new Date().getFullYear() + 20),
        cvc: z.string().trim().regex(/^\d{3,4}$/, 'Invalid security code')
    })
});

module.exports = { createBookingSchema, bookingIdParamSchema, holdSeatSchema, paySchema };
