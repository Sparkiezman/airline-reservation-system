'use strict';
const { z } = require('zod');

// Requires 8+ chars with upper, lower, digit, and symbol — balances usability
// with resistance to dictionary/credential-stuffing attacks.
const passwordSchema = z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password is too long')
    .regex(/[a-z]/, 'Password must contain a lowercase letter')
    .regex(/[A-Z]/, 'Password must contain an uppercase letter')
    .regex(/[0-9]/, 'Password must contain a digit')
    .regex(/[^A-Za-z0-9]/, 'Password must contain a symbol');

const emailSchema = z.string().trim().toLowerCase().email('Invalid email address').max(255);

const registerSchema = z.object({
    body: z.object({
        firstName: z.string().trim().min(1).max(100),
        lastName: z.string().trim().min(1).max(100),
        email: emailSchema,
        password: passwordSchema,
        phone: z.string().trim().max(30).optional().or(z.literal(''))
    })
});

const loginSchema = z.object({
    body: z.object({
        email: emailSchema,
        password: z.string().min(1).max(128)
    })
});

const changePasswordSchema = z.object({
    body: z.object({
        currentPassword: z.string().min(1).max(128),
        newPassword: passwordSchema
    })
});

const forgotPasswordSchema = z.object({
    body: z.object({
        email: emailSchema
    })
});

const resetPasswordSchema = z.object({
    body: z.object({
        token: z.string().min(10).max(200),
        newPassword: passwordSchema
    })
});

const updateProfileSchema = z.object({
    body: z.object({
        firstName: z.string().trim().min(1).max(100),
        lastName: z.string().trim().min(1).max(100),
        phone: z.string().trim().max(30).optional().or(z.literal(''))
    })
});

module.exports = {
    registerSchema,
    loginSchema,
    changePasswordSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    updateProfileSchema
};
