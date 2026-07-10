'use strict';
const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Synchronizer-token CSRF protection bound to the server-side session.
 * (csurf is deprecated/unmaintained; this reimplements the same pattern.)
 *
 * Flow:
 *   1. attachCsrfToken ensures every session has a random token.
 *   2. Client fetches it via GET /api/auth/csrf-token and sends it back
 *      on every mutating request in the X-CSRF-Token header.
 *   3. verifyCsrfToken does a timing-safe compare against the session copy.
 *
 * Because the token lives in the session (server-side), an attacker who
 * cannot read the session cookie (httpOnly) or the token response cannot
 * forge a valid header value cross-site.
 */
function attachCsrfToken(req, res, next) {
    if (!req.session) return next();
    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }
    next();
}

function verifyCsrfToken(req, res, next) {
    if (SAFE_METHODS.has(req.method)) return next();

    const sessionToken = req.session && req.session.csrfToken;
    const headerToken = req.get('X-CSRF-Token');

    if (!sessionToken || !headerToken) {
        return res.status(403).json({ error: 'CSRF token missing' });
    }

    const a = Buffer.from(sessionToken);
    const b = Buffer.from(headerToken);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }

    next();
}

module.exports = { attachCsrfToken, verifyCsrfToken };
