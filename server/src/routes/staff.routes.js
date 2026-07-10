'use strict';
const express = require('express');
const router = express.Router();

const staffController = require('../controllers/staffController');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createFlightSchema, updateFlightSchema, flightIdParamSchema, createAircraftSchema } = require('../validators/flightValidators');
const { z } = require('zod');

router.use(requireAuth, requireRole('staff', 'admin'));

router.get('/flights', staffController.listFlights);
router.post('/flights', validate(createFlightSchema), staffController.createFlight);
router.put('/flights/:id', validate(updateFlightSchema), staffController.updateFlight);
router.post('/flights/:id/cancel', validate(flightIdParamSchema), staffController.cancelFlight);
router.get('/flights/:id/manifest', validate(flightIdParamSchema), staffController.getManifest);

router.post('/booking-items/:bookingItemId/check-in',
    validate(z.object({ params: z.object({ bookingItemId: z.coerce.number().int().positive() }) })),
    staffController.checkInPassenger
);

router.get('/aircraft', staffController.listAircraft);
router.post('/aircraft', validate(createAircraftSchema), staffController.createAircraft);
router.put('/aircraft/:id/status',
    validate(z.object({
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: z.object({ status: z.enum(['active', 'maintenance', 'retired']) })
    })),
    staffController.updateAircraftStatus
);

module.exports = router;
