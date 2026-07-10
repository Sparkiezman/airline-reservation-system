'use strict';
const { createClient } = require('redis');
const env = require('./env');
const logger = require('../utils/logger');

const redisClient = createClient({
    socket: {
        host: env.redis.host,
        port: env.redis.port,
        tls: env.redis.tls,
        reconnectStrategy: (retries) => Math.min(retries * 100, 3000)
    },
    password: env.redis.password
});

redisClient.on('error', (err) => logger.error('Redis client error', { error: err.message }));
redisClient.on('connect', () => logger.info('Redis connected'));

async function connectRedis() {
    if (!redisClient.isOpen) {
        await redisClient.connect();
    }
    return redisClient;
}

module.exports = { redisClient, connectRedis };
