'use strict';
require('dotenv').config();

function required(name, fallback) {
    const val = process.env[name] ?? fallback;
    if (val === undefined) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return val;
}

const env = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    isProd: process.env.NODE_ENV === 'production',
    PORT: Number(process.env.PORT || 3000),
    APP_BASE_URL: process.env.APP_BASE_URL || 'http://localhost:3000',

    db: {
        // A single DATABASE_URL (as most hosts provide) takes priority over
        // the individual fields, which remain the primary path for local dev.
        url: process.env.DATABASE_URL || null,
        host: required('DB_HOST', 'localhost'),
        port: Number(process.env.DB_PORT || 5432),
        database: required('DB_NAME', 'airline_reservation'),
        user: required('DB_USER', 'airline_app'),
        password: process.env.DB_PASSWORD || '',
        ssl: process.env.DB_SSL === 'true',
        poolMax: Number(process.env.DB_POOL_MAX || 10)
    },

    redis: {
        // Same pattern as DATABASE_URL above — a full REDIS_URL (e.g. from a
        // managed Redis/Key-Value add-on) takes priority over discrete fields.
        url: process.env.REDIS_URL || null,
        host: process.env.REDIS_HOST || 'localhost',
        port: Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD || undefined,
        tls: process.env.REDIS_TLS === 'true'
    },

    session: {
        secret: required('SESSION_SECRET', 'dev-insecure-secret-change-me'),
        cookieSecure: process.env.COOKIE_SECURE === 'true'
    },

    security: {
        bcryptCost: Number(process.env.BCRYPT_COST || 12),
        maxLoginAttempts: Number(process.env.MAX_LOGIN_ATTEMPTS || 5),
        loginLockoutMinutes: Number(process.env.LOGIN_LOCKOUT_MINUTES || 15),
        seatHoldSeconds: Number(process.env.SEAT_HOLD_SECONDS || 600)
    },

    logLevel: process.env.LOG_LEVEL || 'info'
};

if (env.isProd && env.session.secret === 'dev-insecure-secret-change-me') {
    throw new Error('SESSION_SECRET must be set to a strong random value in production');
}

module.exports = env;
