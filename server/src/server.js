'use strict';
const env = require('./config/env');
const logger = require('./utils/logger');
const { connectRedis } = require('./config/redis');
const { pool } = require('./config/db');
const app = require('./app');

async function start() {
    await connectRedis();
    await pool.query('SELECT 1'); // fail fast if Postgres is unreachable

    const server = app.listen(env.PORT, () => {
        logger.info(`Airline Reservation API listening on port ${env.PORT} (${env.NODE_ENV})`);
    });

    const shutdown = (signal) => {
        logger.info(`Received ${signal}, shutting down gracefully`);
        server.close(async () => {
            await pool.end();
            process.exit(0);
        });
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((err) => {
    logger.error('Failed to start server', { error: err.message, stack: err.stack });
    process.exit(1);
});
