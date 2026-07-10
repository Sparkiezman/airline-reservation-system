'use strict';
const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { authLimiter, passwordResetLimiter } = require('../middleware/rateLimit');
const {
    registerSchema, loginSchema, changePasswordSchema,
    forgotPasswordSchema, resetPasswordSchema, updateProfileSchema
} = require('../validators/authValidators');

router.get('/csrf-token', authController.csrfToken);

router.post('/register', authLimiter, validate(registerSchema), authController.register);
router.post('/login', authLimiter, validate(loginSchema), authController.login);
router.post('/logout', requireAuth, authController.logout);
router.get('/me', requireAuth, authController.me);
router.put('/profile', requireAuth, validate(updateProfileSchema), authController.updateProfile);
router.post('/change-password', requireAuth, validate(changePasswordSchema), authController.changePassword);
router.post('/forgot-password', passwordResetLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
router.post('/reset-password', passwordResetLimiter, validate(resetPasswordSchema), authController.resetPassword);

module.exports = router;
