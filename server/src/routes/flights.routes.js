'use strict';
const express = require('express');
const router = express.Router();

const flightController = require('../controllers/flightController');
const { requireAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { listAirportsSchema, searchFlightsSchema, flightIdParamSchema } = require('../validators/flightValidators');
const { holdSeatSchema } = require('../validators/bookingValidators');

router.get('/airports', validate(listAirportsSchema), flightController.listAirports);
router.get('/search', validate(searchFlightsSchema), flightController.searchFlights);
router.get('/:id', validate(flightIdParamSchema), flightController.getFlight);
router.get('/:id/seats', validate(flightIdParamSchema), flightController.getFlightSeats);
router.post('/:id/seats/:seatId/hold', requireAuth, validate(holdSeatSchema), flightController.holdSeat);
router.delete('/:id/seats/:seatId/hold', requireAuth, validate(holdSeatSchema), flightController.releaseSeatHold);

module.exports = router;
