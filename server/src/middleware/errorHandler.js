'use strict';
const logger = require('../utils/logger');
const env = require('../config/env');

class AppError extends Error {
    constructor(statusCode, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
    }
}

function notFoundHandler(req, res) {
    res.status(404).json({ error: 'Not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || 500;

    logger.error(err.message, {
        statusCode,
        path: req.path,
        method: req.method,
        userId: req.currentUser?.id,
        stack: err.stack
    });

    // Never leak stack traces or raw DB errors to the client.
    const body = { error: statusCode === 500 ? 'Internal server error' : err.message };
    if (err.details) body.details = err.details;
    if (!env.isProd && statusCode === 500) body.debug = err.message;

    res.status(statusCode).json(body);
}

module.exports = { AppError, notFoundHandler, errorHandler };
