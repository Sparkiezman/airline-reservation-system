'use strict';
const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
    listUsersSchema, updateUserRoleSchema, updateUserStatusSchema, listAuditLogsSchema, updateSettingSchema
} = require('../validators/adminValidators');

router.use(requireAuth, requireRole('admin'));

router.get('/users', validate(listUsersSchema), adminController.listUsers);
router.put('/users/:id/role', validate(updateUserRoleSchema), adminController.updateUserRole);
router.put('/users/:id/status', validate(updateUserStatusSchema), adminController.updateUserStatus);

router.get('/audit-logs', validate(listAuditLogsSchema), adminController.listAuditLogs);

router.get('/settings', adminController.listSettings);
router.put('/settings/:key', validate(updateSettingSchema), adminController.updateSetting);

module.exports = router;
