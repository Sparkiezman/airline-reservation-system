'use strict';
/**
 * Loads sample data in three steps, safe to re-run:
 *   1. seed.sql — users, airports, aircraft, and flight_schedules (all
 *      idempotent via ON CONFLICT DO NOTHING)
 *   2. Generate real flight/seat instances from those schedules for the
 *      next 90 days (same generator the running server uses)
 *   3. seed-demo-booking.sql — the one pre-booked demo seat, which needs
 *      an actual flight_seats row to already exist, hence the ordering
 *
 * Usage: npm run seed
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool, query } = require('../src/config/db');
const scheduleGenerator = require('../src/services/scheduleGenerator');

async function main() {
    console.log('Applying seed.sql ...');
    await query(fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8'));
    console.log('Seed data applied successfully.');

    console.log('Generating flight instances from schedules ...');
    const created = await scheduleGenerator.generateAllActiveSchedules();
    console.log(`Generated ${created} flight instance(s).`);

    console.log('Applying seed-demo-booking.sql ...');
    await query(fs.readFileSync(path.join(__dirname, 'seed-demo-booking.sql'), 'utf8'));
    console.log('Demo booking applied successfully.');
}

main()
    .catch((err) => {
        console.error('Seeding failed:', err.message);
        process.exitCode = 1;
    })
    .finally(() => pool.end());
