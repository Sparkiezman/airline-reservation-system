'use strict';
const env = require('./config/env');
const logger = require('./utils/logger');
const { connectRedis } = require('./config/redis');
const { pool } = require('./config/db');
const scheduleGenerator = require('./services/scheduleGenerator');
const app = require('./app');

const SCHEDULE_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

function runScheduleGeneration(label) {
    scheduleGenerator.generateAllActiveSchedules()
        .then((count) => logger.info(`${label}: generated ${count} flight instance(s) from active schedules`))
        .catch((err) => logger.error(`${label} failed`, { error: err.message }));
}

async function start() {
    await connectRedis();
    await pool.query('SELECT 1'); // fail fast if Postgres is unreachable

    // Keeps the rolling window of generated flight instances topped up —
    // once at boot (covers deploys/restarts), then once a day thereafter.
    // A failure here must never block the server from starting.
    runScheduleGeneration('Boot-time schedule generation');
    setInterval(() => runScheduleGeneration('Daily schedule generation'), SCHEDULE_REFRESH_INTERVAL_MS);

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
