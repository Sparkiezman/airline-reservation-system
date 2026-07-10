'use strict';
const { z } = require('zod');

const userIdParamSchema = z.object({
    params: z.object({ id: z.coerce.number().int().positive() })
});

const updateUserRoleSchema = z.object({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({ role: z.enum(['customer', 'staff', 'admin']) })
});

const updateUserStatusSchema = z.object({
    params: z.object({ id: z.coerce.number().int().positive() }),
    body: z.object({ isActive: z.boolean() })
});

const listUsersSchema = z.object({
    query: z.object({
        search: z.string().trim().max(255).optional().or(z.literal('')),
        role: z.enum(['customer', 'staff', 'admin']).optional(),
        page: z.coerce.number().int().min(1).optional().default(1),
        pageSize: z.coerce.number().int().min(1).max(100).optional().default(20)
    })
});

const listAuditLogsSchema = z.object({
    query: z.object({
        action: z.string().trim().max(100).optional().or(z.literal('')),
        userId: z.coerce.number().int().positive().optional(),
        page: z.coerce.number().int().min(1).optional().default(1),
        pageSize: z.coerce.number().int().min(1).max(200).optional().default(50)
    })
});

const updateSettingSchema = z.object({
    params: z.object({ key: z.string().trim().min(1).max(100) }),
    body: z.object({ value: z.any() })
});

module.exports = {
    userIdParamSchema,
    updateUserRoleSchema,
    updateUserStatusSchema,
    listUsersSchema,
    listAuditLogsSchema,
    updateSettingSchema
};
