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

// db.js configures node-postgres to return DATE columns as raw 'YYYY-MM-DD'
// strings (not a locale-midnight Date), so schedule.generated_until always
// parses to clean UTC midnight here regardless of server timezone.
function toUtcMidnight(dateStr) {
    return new Date(`${dateStr}T00:00:00.000Z`);
}

/**
 * Generates any missing flight instances for one schedule, from the day
 * after its `generated_until` (or today, whichever is later) through
 * today + GENERATION_WINDOW_DAYS, on the schedule's operating weekdays.
 * Must be called with a row already locked (FOR UPDATE) by the caller.
 */
async function generateForSchedule(client, schedule, minUntilDate) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    let windowEnd = addDays(today, GENERATION_WINDOW_DAYS);
    if (minUntilDate && minUntilDate > windowEnd) windowEnd = minUntilDate;

    let cursor = schedule.generated_until ? addDays(toUtcMidnight(schedule.generated_until), 1) : today;
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

async function generateForScheduleById(scheduleId, untilDateStr) {
    const minUntilDate = untilDateStr ? new Date(`${untilDateStr}T00:00:00.000Z`) : undefined;
    return withTransaction(async (client) => {
        const result = await client.query('SELECT * FROM flight_schedules WHERE id = $1 FOR UPDATE', [scheduleId]);
        const schedule = result.rows[0];
        if (!schedule || schedule.status !== 'active') return 0;
        return generateForSchedule(client, schedule, minUntilDate);
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

// Average cruise speed (km/h) used only to estimate a plausible duration for
// auto-generated routes; includes an implicit allowance for climb/descent.
const AVG_SPEED_KMH = 800;
const TAXI_OVERHEAD_MINUTES = 30;

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function hourFromRoute(originCode, destinationCode) {
    const s = originCode + destinationCode;
    let sum = 0;
    for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
    return 6 + (sum % 14); // spread departures between 06:00 and 19:00
}

/**
 * Ensures at least one bookable flight exists between two known airports on
 * (or before) neededDateStr. Reuses an existing active schedule for the
 * route if one exists; otherwise derives a plausible daily schedule from
 * the great-circle distance between the airports and creates it, tagged
 * is_auto_generated so staff can tell it apart from curated routes.
 * Returns the schedule id, or null if either airport is unknown/missing
 * coordinates (nothing gets silently invented for bad input).
 */
async function ensureRouteAvailable(originCode, destinationCode, neededDateStr) {
    if (originCode === destinationCode) return null;

    const existing = await query(
        `SELECT id FROM flight_schedules WHERE origin_code = $1 AND destination_code = $2 AND status = 'active' LIMIT 1`,
        [originCode, destinationCode]
    );
    if (existing.rows[0]) {
        await generateForScheduleById(existing.rows[0].id, neededDateStr);
        return existing.rows[0].id;
    }

    const airportsResult = await query(
        `SELECT code, latitude_deg, longitude_deg FROM airports WHERE code IN ($1, $2)`,
        [originCode, destinationCode]
    );
    const origin = airportsResult.rows.find((r) => r.code === originCode);
    const destination = airportsResult.rows.find((r) => r.code === destinationCode);
    if (!origin || !destination || origin.latitude_deg == null || destination.latitude_deg == null) return null;

    const distanceKm = haversineKm(origin.latitude_deg, origin.longitude_deg, destination.latitude_deg, destination.longitude_deg);
    const durationMinutes = Math.min(1439, Math.max(40, Math.round((distanceKm / AVG_SPEED_KMH) * 60) + TAXI_OVERHEAD_MINUTES));
    const economyCents = Math.min(250000, Math.max(3500, Math.round(3500 + distanceKm * 8)));
    const businessCents = Math.round(economyCents * 2.6);
    const firstCents = Math.round(economyCents * 4.4);
    const hour = hourFromRoute(originCode, destinationCode);

    const aircraftResult = await query(`SELECT id FROM aircraft WHERE status = 'active' ORDER BY random() LIMIT 1`);
    if (!aircraftResult.rows[0]) return null;

    let flightNumber = `AG${originCode}${destinationCode}`;
    for (let attempt = 0; attempt < 5; attempt++) {
        const taken = await query('SELECT 1 FROM flight_schedules WHERE flight_number = $1', [flightNumber]);
        if (!taken.rowCount) break;
        flightNumber = `AG${originCode}${destinationCode}${Math.floor(Math.random() * 90 + 10)}`;
    }

    const insertResult = await query(
        `INSERT INTO flight_schedules (flight_number, aircraft_id, origin_code, destination_code, departure_time_of_day,
                                        duration_minutes, days_of_week, base_price_economy_cents, base_price_business_cents,
                                        base_price_first_cents, is_auto_generated)
         VALUES ($1,$2,$3,$4,$5,$6,ARRAY[0,1,2,3,4,5,6]::smallint[],$7,$8,$9,TRUE)
         RETURNING id`,
        [
            flightNumber, aircraftResult.rows[0].id, originCode, destinationCode,
            `${String(hour).padStart(2, '0')}:00`, durationMinutes, economyCents, businessCents, firstCents
        ]
    );
    const scheduleId = insertResult.rows[0].id;
    await generateForScheduleById(scheduleId, neededDateStr);
    return scheduleId;
}

module.exports = { generateForScheduleById, generateAllActiveSchedules, ensureRouteAvailable, GENERATION_WINDOW_DAYS };
