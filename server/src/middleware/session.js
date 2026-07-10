'use strict';
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { redisClient } = require('../config/redis');
const env = require('../config/env');

/**
 * Sessions are stored server-side in Redis (not JWT-in-localStorage) so they
 * can be revoked instantly (logout, admin force-logout, password change).
 * Cookie is httpOnly + sameSite=lax to mitigate XSS token theft and CSRF;
 * CSRF tokens (see middleware/csrf.js) provide defense-in-depth for state changes.
 */
const sessionMiddleware = session({
    store: new RedisStore({ client: redisClient, prefix: 'sess:' }),
    name: 'airline.sid',
    secret: env.session.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        httpOnly: true,
        secure: env.session.cookieSecure,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 2 // 2 hours
    }
});

module.exports = sessionMiddleware;
