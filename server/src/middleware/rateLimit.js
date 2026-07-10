'use strict';
const rateLimit = require('express-rate-limit');

// Generic API limiter — generous, just to blunt scripted abuse.
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests. Please try again later.' }
});

// Tight limiter for authentication endpoints — mitigates credential stuffing / brute force.
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Too many authentication attempts. Please try again later.' }
});

// Very tight limiter for password reset requests — prevents email enumeration/spam.
const passwordResetLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many password reset requests. Please try again later.' }
});

// Payment endpoint limiter — payments are simulated but still throttle to mirror real-world PCI posture.
const paymentLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many payment attempts. Please try again later.' }
});

module.exports = { apiLimiter, authLimiter, passwordResetLimiter, paymentLimiter };
