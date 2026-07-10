'use strict';
const express = require('express');
const router = express.Router();

const bookingController = require('../controllers/bookingController');
const { requireAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { paymentLimiter } = require('../middleware/rateLimit');
const { createBookingSchema, bookingIdParamSchema, paySchema } = require('../validators/bookingValidators');

router.use(requireAuth);

router.post('/', validate(createBookingSchema), bookingController.createBooking);
router.get('/', bookingController.listMyBookings);
router.get('/:id', validate(bookingIdParamSchema), bookingController.getBooking);
router.post('/:id/cancel', validate(bookingIdParamSchema), bookingController.cancelBooking);
router.post('/:id/pay', paymentLimiter, validate(paySchema), bookingController.payBooking);
router.get('/:id/eticket', validate(bookingIdParamSchema), bookingController.downloadETicket);

module.exports = router;
