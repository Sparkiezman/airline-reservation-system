'use strict';
/**
 * Applies schema.sql against the configured database.
 * Usage: npm run migrate
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

    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    try {
        console.log('Applying schema.sql ...');
        await pool.query(schemaSql);
        console.log('Schema applied successfully.');
    } finally {
        await pool.end();
    }
}

main().catch((err) => {
    console.error('Migration failed:', err.message);
    process.exit(1);
});
