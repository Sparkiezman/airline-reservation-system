'use strict';
/**
 * Loads seed.sql sample data. Safe to re-run (uses ON CONFLICT DO NOTHING).
 * Usage: npm run seed
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function main() {
    const pool = new Pool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
    });

    const seedSql = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
    try {
        console.log('Applying seed.sql ...');
        await pool.query(seedSql);
        console.log('Seed data applied successfully.');
    } finally {
        await pool.end();
    }
}

main().catch((err) => {
    console.error('Seeding failed:', err.message);
    process.exit(1);
});
