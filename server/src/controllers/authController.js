'use strict';
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { query } = require('../config/db');
const { recordAudit } = require('../utils/audit');
const { AppError } = require('../middleware/errorHandler');
const env = require('../config/env');

const SAFE_USER_FIELDS = 'id, first_name, last_name, email, role, phone, must_change_password, created_at, last_login_at';

function toSafeUser(row) {
    return {
        id: row.id,
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        role: row.role,
        phone: row.phone,
        mustChangePassword: row.must_change_password,
        createdAt: row.created_at,
        lastLoginAt: row.last_login_at
    };
}

// Constant-ish hash used to keep timing similar when the email doesn't exist,
// so login responses don't leak which emails are registered.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeOgxOWzTNoVzKfEkHFN6qLpZ/YfSJqE7O';

async function register(req, res, next) {
    try {
        const { firstName, lastName, email, password, phone } = req.body;

        const existing = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
        if (existing.rowCount > 0) {
            // Generic message — do not reveal whether the account exists.
            return res.status(409).json({ error: 'Unable to create account with the provided details' });
        }

        const passwordHash = await bcrypt.hash(password, env.security.bcryptCost);
        const result = await query(
            `INSERT INTO users (first_name, last_name, email, password_hash, role, phone)
             VALUES ($1, $2, $3, $4, 'customer', $5)
             RETURNING ${SAFE_USER_FIELDS}`,
            [firstName, lastName, email, passwordHash, phone || null]
        );

        const user = result.rows[0];
        await recordAudit({ req, userId: user.id, actorEmail: user.email, action: 'user_registered', entityType: 'user', entityId: user.id });

        req.session.regenerate((err) => {
            if (err) return next(err);
            req.session.user = { id: user.id, email: user.email, role: user.role };
            res.status(201).json({ user: toSafeUser(user) });
        });
    } catch (err) {
        next(err);
    }
}

async function login(req, res, next) {
    try {
        const { email, password } = req.body;
        const result = await query(
            `SELECT id, first_name, last_name, email, password_hash, role, phone, is_active,
                    failed_login_attempts, locked_until, must_change_password
             FROM users WHERE LOWER(email) = LOWER($1)`,
            [email]
        );
        const user = result.rows[0];

        if (!user) {
            await bcrypt.compare(password, DUMMY_HASH); // timing-safe non-existent-user path
            await recordAudit({ req, action: 'login_failed', details: { email, reason: 'no_such_user' } });
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            await recordAudit({ req, userId: user.id, actorEmail: user.email, action: 'login_blocked_locked' });
            return res.status(423).json({ error: 'Account temporarily locked due to failed login attempts. Try again later.' });
        }

        if (!user.is_active) {
            await recordAudit({ req, userId: user.id, actorEmail: user.email, action: 'login_blocked_inactive' });
            return res.status(403).json({ error: 'Account is disabled. Contact an administrator.' });
        }

        const passwordMatches = await bcrypt.compare(password, user.password_hash);

        if (!passwordMatches) {
            const attempts = user.failed_login_attempts + 1;
            const shouldLock = attempts >= env.security.maxLoginAttempts;
            await query(
                `UPDATE users SET failed_login_attempts = $1,
                        locked_until = $2
                 WHERE id = $3`,
                [
                    shouldLock ? 0 : attempts,
                    shouldLock ? new Date(Date.now() + env.security.loginLockoutMinutes * 60 * 1000) : null,
                    user.id
                ]
            );
            await recordAudit({ req, userId: user.id, actorEmail: user.email, action: shouldLock ? 'account_locked' : 'login_failed' });
            if (shouldLock) {
                return res.status(423).json({ error: 'Too many failed attempts. Account locked temporarily.' });
            }
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        await query(
            `UPDATE users SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now() WHERE id = $1`,
            [user.id]
        );
        await recordAudit({ req, userId: user.id, actorEmail: user.email, action: 'login_success' });

        // Regenerate session on privilege change to prevent session fixation.
        req.session.regenerate((err) => {
            if (err) return next(err);
            req.session.user = { id: user.id, email: user.email, role: user.role };
            res.json({
                user: toSafeUser({ ...user, must_change_password: user.must_change_password })
            });
        });
    } catch (err) {
        next(err);
    }
}

function logout(req, res, next) {
    const userId = req.session?.user?.id;
    req.session.destroy((err) => {
        if (err) return next(err);
        res.clearCookie('airline.sid');
        recordAudit({ req, userId, action: 'logout' });
        res.json({ success: true });
    });
}

async function me(req, res, next) {
    try {
        const result = await query(`SELECT ${SAFE_USER_FIELDS} FROM users WHERE id = $1`, [req.currentUser.id]);
        if (!result.rows[0]) throw new AppError(404, 'User not found');
        res.json({ user: toSafeUser(result.rows[0]) });
    } catch (err) {
        next(err);
    }
}

async function updateProfile(req, res, next) {
    try {
        const { firstName, lastName, phone } = req.body;
        const result = await query(
            `UPDATE users SET first_name = $1, last_name = $2, phone = $3 WHERE id = $4
             RETURNING ${SAFE_USER_FIELDS}`,
            [firstName, lastName, phone || null, req.currentUser.id]
        );
        await recordAudit({ req, action: 'profile_updated', entityType: 'user', entityId: req.currentUser.id });
        res.json({ user: toSafeUser(result.rows[0]) });
    } catch (err) {
        next(err);
    }
}

async function changePassword(req, res, next) {
    try {
        const { currentPassword, newPassword } = req.body;
        const result = await query('SELECT password_hash FROM users WHERE id = $1', [req.currentUser.id]);
        const user = result.rows[0];
        if (!user) throw new AppError(404, 'User not found');

        const matches = await bcrypt.compare(currentPassword, user.password_hash);
        if (!matches) {
            return res.status(401).json({ error: 'Current password is incorrect' });
        }

        const newHash = await bcrypt.hash(newPassword, env.security.bcryptCost);
        await query('UPDATE users SET password_hash = $1, must_change_password = FALSE WHERE id = $2', [newHash, req.currentUser.id]);
        await recordAudit({ req, action: 'password_changed', entityType: 'user', entityId: req.currentUser.id });
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

async function forgotPassword(req, res, next) {
    try {
        const { email } = req.body;
        const result = await query('SELECT id, email FROM users WHERE LOWER(email) = LOWER($1) AND is_active = TRUE', [email]);
        const user = result.rows[0];

        // Always respond the same way to avoid user-enumeration via response
        // differences/timing on this endpoint.
        const genericResponse = { message: 'If an account exists for that email, a reset link has been generated.' };

        if (!user) {
            return res.json(genericResponse);
        }

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

        await query(
            'INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
            [user.id, tokenHash, expiresAt]
        );
        await recordAudit({ req, userId: user.id, actorEmail: user.email, action: 'password_reset_requested' });

        // No email service is wired up for this exercise — expose the token
        // only outside production so the reset flow remains testable.
        if (!env.isProd) {
            genericResponse.devResetToken = rawToken;
        }
        res.json(genericResponse);
    } catch (err) {
        next(err);
    }
}

async function resetPassword(req, res, next) {
    try {
        const { token, newPassword } = req.body;
        const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

        const result = await query(
            `SELECT id, user_id, expires_at, used_at FROM password_reset_tokens
             WHERE token_hash = $1 ORDER BY id DESC LIMIT 1`,
            [tokenHash]
        );
        const record = result.rows[0];

        if (!record || record.used_at || new Date(record.expires_at) < new Date()) {
            return res.status(400).json({ error: 'Invalid or expired reset token' });
        }

        const newHash = await bcrypt.hash(newPassword, env.security.bcryptCost);
        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, record.user_id]);
        await query('UPDATE password_reset_tokens SET used_at = now() WHERE id = $1', [record.id]);
        await recordAudit({ req, userId: record.user_id, action: 'password_reset_completed' });

        res.json({ success: true });
    } catch (err) {
        next(err);
    }
}

function csrfToken(req, res) {
    res.json({ csrfToken: req.session.csrfToken });
}

module.exports = {
    register, login, logout, me, updateProfile, changePassword,
    forgotPassword, resetPassword, csrfToken, toSafeUser
};
