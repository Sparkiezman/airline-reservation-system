'use strict';
const { query } = require('../config/db');
const logger = require('./logger');

/**
 * Records a security-relevant event to the audit_logs table.
 * Call this for: auth events, booking/payment mutations, and any
 * staff/admin action that changes flights, users, roles, or settings.
 */
async function recordAudit({ req, userId, actorEmail, action, entityType, entityId, details }) {
    try {
        const ip = req?.ip || null;
        const userAgent = req?.get ? req.get('User-Agent') : null;
        await query(
            `INSERT INTO audit_logs (user_id, actor_email, action, entity_type, entity_id, ip_address, user_agent, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                userId ?? req?.currentUser?.id ?? null,
                actorEmail ?? req?.currentUser?.email ?? null,
                action,
                entityType ?? null,
                entityId != null ? String(entityId) : null,
                ip,
                userAgent ?? null,
                details ? JSON.stringify(details) : null
            ]
        );
    } catch (err) {
        // Audit logging must never break the primary request flow.
        logger.error('Failed to write audit log', { error: err.message, action });
    }
}

module.exports = { recordAudit };
