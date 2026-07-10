'use strict';
const { redisClient } = require('../config/redis');
const env = require('../config/env');

const lockKey = (flightSeatId) => `seatlock:${flightSeatId}`;

/**
 * Temporarily holds a seat for a user while they complete checkout.
 * Backed by Redis SET NX + TTL so the hold auto-expires without any
 * cleanup job, and is visible instantly across all app instances.
 */
async function holdSeat(flightSeatId, userId) {
    const key = lockKey(flightSeatId);
    const ttl = env.security.seatHoldSeconds;
    const result = await redisClient.set(key, String(userId), { NX: true, EX: ttl });
    if (result === null) {
        const owner = await redisClient.get(key);
        return { acquired: false, heldByAnother: owner !== String(userId) };
    }
    return { acquired: true, heldByAnother: false, expiresInSeconds: ttl };
}

async function getHoldOwner(flightSeatId) {
    return redisClient.get(lockKey(flightSeatId));
}

async function isHeldByOther(flightSeatId, userId) {
    const owner = await getHoldOwner(flightSeatId);
    return Boolean(owner) && owner !== String(userId);
}

async function releaseSeat(flightSeatId, userId) {
    const key = lockKey(flightSeatId);
    const owner = await redisClient.get(key);
    if (owner === String(userId)) {
        await redisClient.del(key);
        return true;
    }
    return false;
}

async function releaseSeatsForce(flightSeatIds) {
    if (!flightSeatIds.length) return;
    await redisClient.del(flightSeatIds.map(lockKey));
}

module.exports = { holdSeat, getHoldOwner, isHeldByOther, releaseSeat, releaseSeatsForce };
