'use strict';
const { query } = require('../config/db');

/**
 * Verifies the session is authenticated AND re-checks the user's current
 * status in the database on every request. This means a deactivated /
 * deleted / role-changed account is locked out immediately instead of
 * waiting for session expiry — important for the admin "disable user" and
 * "change role" features to take effect right away.
 */
async function requireAuth(req, res, next) {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const result = await query(
            'SELECT id, first_name, last_name, email, role, is_active FROM users WHERE id = $1',
            [req.session.user.id]
        );
        const user = result.rows[0];

        if (!user || !user.is_active) {
            req.session.destroy(() => {});
            return res.status(401).json({ error: 'Session no longer valid' });
        }

        // Keep session in sync in case role changed since login.
        req.session.user.role = user.role;
        req.currentUser = {
            id: user.id,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email,
            role: user.role
        };
        next();
    } catch (err) {
        next(err);
    }
}

function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.currentUser) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!allowedRoles.includes(req.currentUser.role)) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }
        next();
    };
}

module.exports = { requireAuth, requireRole };
