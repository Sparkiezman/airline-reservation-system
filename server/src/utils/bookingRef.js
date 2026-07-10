'use strict';
const crypto = require('crypto');
const { query } = require('../config/db');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I ambiguity

function randomCode(length = 6) {
    let code = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
        code += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return code;
}

async function generateBookingRef() {
    for (let attempt = 0; attempt < 10; attempt++) {
        const ref = randomCode(6);
        const existing = await query('SELECT 1 FROM bookings WHERE booking_ref = $1', [ref]);
        if (existing.rowCount === 0) return ref;
    }
    throw new Error('Could not generate a unique booking reference');
}

function generateTransactionRef() {
    return `TXN-${Date.now()}-${randomCode(8)}`;
}

module.exports = { generateBookingRef, generateTransactionRef };
