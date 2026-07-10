'use strict';
const { z } = require('zod');

const airportCode = z.string().trim().toUpperCase().length(3, 'Airport code must be 3 letters');

const searchFlightsSchema = z.object({
    query: z.object({
        origin: airportCode,
        destination: airportCode,
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
        passengers: z.coerce.number().int().min(1).max(9).optional().default(1)
    })
});

const flightIdParamSchema = z.object({
    params: z.object({
        id: z.coerce.number().int().positive()
    })
});

const createFlightSchema = z.object({
    body: z.object({
        flightNumber: z.string().trim().toUpperCase().min(2).max(10),
        aircraftId: z.coerce.number().int().positive(),
        originCode: airportCode,
        destinationCode: airportCode,
        departureTime: z.string().datetime({ offset: true }).or(z.string().min(10)),
        arrivalTime: z.string().datetime({ offset: true }).or(z.string().min(10)),
        basePriceEconomyCents: z.coerce.number().int().min(0),
        basePriceBusinessCents: z.coerce.number().int().min(0),
        basePriceFirstCents: z.coerce.number().int().min(0).optional().default(0),
        gate: z.string().trim().max(10).optional().or(z.literal('')),
        terminal: z.string().trim().max(10).optional().or(z.literal(''))
    })
});

const updateFlightSchema = z.object({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({
        departureTime: z.string().min(10).optional(),
        arrivalTime: z.string().min(10).optional(),
        gate: z.string().trim().max(10).optional().or(z.literal('')),
        terminal: z.string().trim().max(10).optional().or(z.literal('')),
        status: z.enum(['scheduled', 'boarding', 'departed', 'arrived', 'cancelled', 'delayed']).optional(),
        basePriceEconomyCents: z.coerce.number().int().min(0).optional(),
        basePriceBusinessCents: z.coerce.number().int().min(0).optional(),
        basePriceFirstCents: z.coerce.number().int().min(0).optional()
    })
});

const createAircraftSchema = z.object({
    body: z.object({
        tailNumber: z.string().trim().toUpperCase().min(3).max(20),
        model: z.string().trim().min(1).max(100),
        manufacturer: z.string().trim().max(100).optional().or(z.literal('')),
        rows: z.coerce.number().int().min(1).max(100),
        cols: z.array(z.string().trim().toUpperCase().length(1)).min(1).max(10),
        firstRowStart: z.coerce.number().int().min(0).optional().default(0),
        firstRowEnd: z.coerce.number().int().min(0).optional().default(0),
        businessRowStart: z.coerce.number().int().min(1),
        businessRowEnd: z.coerce.number().int().min(0),
        economyRowStart: z.coerce.number().int().min(1),
        economyRowEnd: z.coerce.number().int().min(1)
    })
});

module.exports = {
    searchFlightsSchema,
    flightIdParamSchema,
    createFlightSchema,
    updateFlightSchema,
    createAircraftSchema
};
