'use strict';
const { z } = require('zod');

const airportCode = z.string().trim().toUpperCase().length(3, 'Airport code must be 3 letters');

const createScheduleSchema = z.object({
    body: z.object({
        flightNumber: z.string().trim().toUpperCase().min(2).max(10),
        aircraftId: z.coerce.number().int().positive(),
        originCode: airportCode,
        destinationCode: airportCode,
        departureTimeOfDay: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Must be 24-hour HH:MM'),
        durationMinutes: z.coerce.number().int().min(15).max(1440),
        daysOfWeek: z.array(z.coerce.number().int().min(0).max(6)).min(1).max(7),
        basePriceEconomyCents: z.coerce.number().int().min(0),
        basePriceBusinessCents: z.coerce.number().int().min(0),
        basePriceFirstCents: z.coerce.number().int().min(0).optional().default(0),
        gate: z.string().trim().max(10).optional().or(z.literal('')),
        terminal: z.string().trim().max(10).optional().or(z.literal(''))
    })
});

const updateScheduleStatusSchema = z.object({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({ status: z.enum(['active', 'paused', 'ended']) })
});

module.exports = { createScheduleSchema, updateScheduleStatusSchema };
