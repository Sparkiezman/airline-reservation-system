'use strict';
const winston = require('winston');
const env = require('../config/env');

const logger = winston.createLogger({
    level: env.logLevel,
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'airline-reservation-api' },
    transports: [
        new winston.transports.Console({
            format: env.isProd
                ? winston.format.json()
                : winston.format.combine(winston.format.colorize(), winston.format.simple())
        }),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

module.exports = logger;
