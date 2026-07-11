'use strict';
const { query, withTransaction } = require('../config/db');
const seatGenerator = require('./seatGenerator');

// How far ahead real flight instances are kept generated. Re-running
// generation (on boot, daily, and whenever a schedule is created/resumed)
// only ever adds days — it never removes or edits already-generated flights.
const GENERATION_WINDOW_DAYS = 90;

function addDays(date, days) {
    const d = new Date(date);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

function toDateOnly(date) {
    return date.toISOString().slice(0, 10);
}

/**
 * Generates any missing flight instances for one schedule, from the day
 * after its `generated_until` (or today, whichever is later) through
 * today + GENERATION_WINDOW_DAYS, on the schedule's operating weekdays.
 * Must be called with a row already locked (FOR UPDATE) by the caller.
 */
async function generateForSchedule(client, schedule) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const windowEnd = addDays(today, GENERATION_WINDOW_DAYS);

    let cursor = schedule.generated_until ? addDays(new Date(schedule.generated_until), 1) : today;
    if (cursor < today) cursor = today;

    const [hours, minutes] = schedule.departure_time_of_day.split(':').map(Number);
    const aircraftResult = await client.query('SELECT seat_layout FROM aircraft WHERE id = $1', [schedule.aircraft_id]);
    const seatLayout = aircraftResult.rows[0] && aircraftResult.rows[0].seat_layout;

    let created = 0;
    while (cursor <= windowEnd) {
        if (schedule.days_of_week.includes(cursor.getUTCDay())) {
            const departureTime = new Date(cursor);
            departureTime.setUTCHours(hours, minutes, 0, 0);
            const arrivalTime = new Date(departureTime.getTime() + schedule.duration_minutes * 60000);

            const existing = await client.query(
                'SELECT 1 FROM flights WHERE schedule_id = $1 AND departure_time = $2',
                [schedule.id, departureTime.toISOString()]
            );

            if (existing.rowCount === 0 && seatLayout) {
                const insertResult = await client.query(
                    `INSERT INTO flights (flight_number, aircraft_id, origin_code, destination_code, departure_time,
                                           arrival_time, base_price_economy_cents, base_price_business_cents,
                                           base_price_first_cents, gate, terminal, status, schedule_id, created_by)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'scheduled',$12,$13)
                     RETURNING id`,
                    [
                        schedule.flight_number, schedule.aircraft_id, schedule.origin_code, schedule.destination_code,
                        departureTime.toISOString(), arrivalTime.toISOString(), schedule.base_price_economy_cents,
                        schedule.base_price_business_cents, schedule.base_price_first_cents,
                        schedule.gate, schedule.terminal, schedule.id, schedule.created_by
                    ]
                );
                await seatGenerator.insertSeatsForFlight(client, insertResult.rows[0].id, seatLayout, {
                    economy: schedule.base_price_economy_cents,
                    business: schedule.base_price_business_cents,
                    first: schedule.base_price_first_cents
                });
                created += 1;
            }
        }
        cursor = addDays(cursor, 1);
    }

    await client.query('UPDATE flight_schedules SET generated_until = $1 WHERE id = $2', [toDateOnly(windowEnd), schedule.id]);
    return created;
}

async function generateForScheduleById(scheduleId) {
    return withTransaction(async (client) => {
        const result = await client.query('SELECT * FROM flight_schedules WHERE id = $1 FOR UPDATE', [scheduleId]);
        const schedule = result.rows[0];
        if (!schedule || schedule.status !== 'active') return 0;
        return generateForSchedule(client, schedule);
    });
}

/** Runs generation for every active schedule, each in its own short transaction. */
async function generateAllActiveSchedules() {
    const schedules = await query(`SELECT id FROM flight_schedules WHERE status = 'active'`);
    let totalCreated = 0;
    for (const row of schedules.rows) {
        totalCreated += await generateForScheduleById(row.id);
    }
    return totalCreated;
}

module.exports = { generateForScheduleById, generateAllActiveSchedules, GENERATION_WINDOW_DAYS };
