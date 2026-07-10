'use strict';
const { query } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');

async function listUsers(req, res, next) {
    try {
        const { search, role, page, pageSize } = req.query;
        const conditions = [];
        const values = [];
        let idx = 1;

        if (search) {
            conditions.push(`(LOWER(email) LIKE $${idx} OR LOWER(first_name) LIKE $${idx} OR LOWER(last_name) LIKE $${idx})`);
            values.push(`%${search.toLowerCase()}%`);
            idx++;
        }
        if (role) {
            conditions.push(`role = $${idx}`);
            values.push(role);
            idx++;
        }
        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await query(`SELECT COUNT(*) FROM users ${whereClause}`, values);
        const total = Number(countResult.rows[0].count);

        values.push(pageSize, (page - 1) * pageSize);
        const result = await query(
            `SELECT id, first_name, last_name, email, role, phone, is_active, must_change_password,
                    created_at, last_login_at, locked_until
             FROM users ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${idx} OFFSET $${idx + 1}`,
            values
        );

        res.json({
            users: result.rows.map((u) => ({
                id: u.id,
                firstName: u.first_name,
                lastName: u.last_name,
                email: u.email,
                role: u.role,
                phone: u.phone,
                isActive: u.is_active,
                mustChangePassword: u.must_change_password,
                createdAt: u.created_at,
                lastLoginAt: u.last_login_at,
                lockedUntil: u.locked_until
            })),
            pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
        });
    } catch (err) {
        next(err);
    }
}

async function updateUserRole(req, res, next) {
    try {
        const { id } = req.params;
        const { role } = req.body;

        if (Number(id) === req.currentUser.id) {
            throw new AppError(400, 'You cannot change your own role');
        }

        const result = await query(
            'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, email, role',
            [role, id]
        );
        if (!result.rows[0]) throw new AppError(404, 'User not found');

        await recordAudit({ req, action: 'user_role_changed', entityType: 'user', entityId: id, details: { newRole: role } });
        res.json({ user: result.rows[0] });
    } catch (err) {
        next(err);
    }
}

async function updateUserStatus(req, res, next) {
    try {
        const { id } = req.params;
        const { isActive } = req.body;

        if (Number(id) === req.currentUser.id) {
            throw new AppError(400, 'You cannot change your own account status');
        }

        const result = await query(
            'UPDATE users SET is_active = $1 WHERE id = $2 RETURNING id, email, is_active',
            [isActive, id]
        );
        if (!result.rows[0]) throw new AppError(404, 'User not found');

        await recordAudit({ req, action: isActive ? 'user_activated' : 'user_deactivated', entityType: 'user', entityId: id });
        res.json({ user: result.rows[0] });
    } catch (err) {
        next(err);
    }
}

async function listAuditLogs(req, res, next) {
    try {
        const { action, userId, page, pageSize } = req.query;
        const conditions = [];
        const values = [];
        let idx = 1;

        if (action) {
            conditions.push(`action = $${idx}`);
            values.push(action);
            idx++;
        }
        if (userId) {
            conditions.push(`user_id = $${idx}`);
            values.push(userId);
            idx++;
        }
        const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await query(`SELECT COUNT(*) FROM audit_logs ${whereClause}`, values);
        const total = Number(countResult.rows[0].count);

        values.push(pageSize, (page - 1) * pageSize);
        const result = await query(
            `SELECT id, user_id, actor_email, action, entity_type, entity_id, ip_address, user_agent, details, created_at
             FROM audit_logs ${whereClause}
             ORDER BY created_at DESC
             LIMIT $${idx} OFFSET $${idx + 1}`,
            values
        );

        res.json({
            logs: result.rows,
            pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
        });
    } catch (err) {
        next(err);
    }
}

async function listSettings(req, res, next) {
    try {
        const result = await query('SELECT key, value, updated_at FROM system_settings ORDER BY key');
        res.json({ settings: result.rows });
    } catch (err) {
        next(err);
    }
}

async function updateSetting(req, res, next) {
    try {
        const { key } = req.params;
        const { value } = req.body;

        const result = await query(
            `INSERT INTO system_settings (key, value, updated_by, updated_at)
             VALUES ($1, $2, $3, now())
             ON CONFLICT (key) DO UPDATE SET value = $2, updated_by = $3, updated_at = now()
             RETURNING key, value, updated_at`,
            [key, JSON.stringify(value), req.currentUser.id]
        );

        await recordAudit({ req, action: 'setting_updated', entityType: 'system_setting', entityId: key, details: { value } });
        res.json({ setting: result.rows[0] });
    } catch (err) {
        next(err);
    }
}

module.exports = { listUsers, updateUserRole, updateUserStatus, listAuditLogs, listSettings, updateSetting };
