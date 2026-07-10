'use strict';
const { generateTransactionRef } = require('../utils/bookingRef');

/**
 * Simulated payment gateway — no real money moves and no real card data is
 * stored or transmitted anywhere. Only the last 4 digits + brand guess are
 * ever persisted, mirroring PCI-DSS "reduce cardholder data scope" practice.
 *
 * Well-known Luhn-valid test numbers are honored so QA/pentest teams get
 * deterministic outcomes:
 *   4000000000000002-style (ends 0002) -> declined
 *   everything else that passes Luhn   -> approved
 */
function luhnCheck(cardNumber) {
    const digits = cardNumber.replace(/\D/g, '');
    let sum = 0;
    let shouldDouble = false;
    for (let i = digits.length - 1; i >= 0; i--) {
        let digit = parseInt(digits[i], 10);
        if (shouldDouble) {
            digit *= 2;
            if (digit > 9) digit -= 9;
        }
        sum += digit;
        shouldDouble = !shouldDouble;
    }
    return digits.length >= 12 && digits.length <= 19 && sum % 10 === 0;
}

function detectBrand(cardNumber) {
    const digits = cardNumber.replace(/\D/g, '');
    if (/^4/.test(digits)) return 'visa';
    if (/^5[1-5]/.test(digits)) return 'mastercard';
    if (/^3[47]/.test(digits)) return 'amex';
    if (/^6(?:011|5)/.test(digits)) return 'discover';
    return 'card';
}

function isExpired(expMonth, expYear) {
    const now = new Date();
    const expiry = new Date(expYear, expMonth, 1); // first day of month after expiry month
    return expiry <= new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Processes a simulated charge. Returns { approved, reason?, brand, last4, transactionRef }.
 * Throws only on programmer error (bad input types) — declines are a normal
 * return value, not an exception, so callers persist a 'failed' payment row.
 */
function processPayment({ cardNumber, expMonth, expYear, cvc }) {
    const digits = String(cardNumber).replace(/\D/g, '');
    const brand = detectBrand(digits);
    const last4 = digits.slice(-4);
    const transactionRef = generateTransactionRef();

    if (!luhnCheck(digits)) {
        return { approved: false, reason: 'Card number failed validation', brand, last4, transactionRef };
    }
    if (!/^\d{3,4}$/.test(String(cvc))) {
        return { approved: false, reason: 'Invalid security code', brand, last4, transactionRef };
    }
    if (isExpired(Number(expMonth), Number(expYear))) {
        return { approved: false, reason: 'Card has expired', brand, last4, transactionRef };
    }
    if (digits.endsWith('0002')) {
        return { approved: false, reason: 'Card declined by issuer', brand, last4, transactionRef };
    }

    return { approved: true, brand, last4, transactionRef };
}

module.exports = { processPayment, luhnCheck };
