'use strict';
const { query } = require('../config/db');
const { AppError } = require('../middleware/errorHandler');
const { recordAudit } = require('../utils/audit');
const scheduleGenerator = require('../services/scheduleGenerator');

function toScheduleJson(r) {
    return {
        id: r.id,
        flightNumber: r.flight_number,
        aircraftId: r.aircraft_id,
        aircraftTailNumber: r.tail_number,
        aircraftModel: r.model,
        originCode: r.origin_code,
        destinationCode: r.destination_code,
        departureTimeOfDay: r.departure_time_of_day,
        durationMinutes: r.duration_minutes,
        daysOfWeek: r.days_of_week,
        basePriceEconomyCents: r.base_price_economy_cents,
        basePriceBusinessCents: r.base_price_business_cents,
        basePriceFirstCents: r.base_price_first_cents,
        gate: r.gate,
        terminal: r.terminal,
        status: r.status,
        generatedUntil: r.generated_until
    };
}

async function listSchedules(req, res, next) {
    try {
        const result = await query(
            `SELECT s.*, a.tail_number, a.model
             FROM flight_schedules s
             JOIN aircraft a ON a.id = s.aircraft_id
             ORDER BY s.created_at DESC`
        );
        res.json({ schedules: result.rows.map(toScheduleJson) });
    } catch (err) {
        next(err);
    }
}

async function createSchedule(req, res, next) {
    try {
        const {
            flightNumber, aircraftId, originCode, destinationCode, departureTimeOfDay, durationMinutes,
            daysOfWeek, basePriceEconomyCents, basePriceBusinessCents, basePriceFirstCents, gate, terminal
        } = req.body;

        const existingSchedule = await query('SELECT 1 FROM flight_schedules WHERE flight_number = $1', [flightNumber]);
        if (existingSchedule.rowCount) throw new AppError(409, `A schedule for flight ${flightNumber} already exists`);

        const aircraftResult = await query('SELECT id, status FROM aircraft WHERE id = $1', [aircraftId]);
        if (!aircraftResult.rows[0]) throw new AppError(404, 'Aircraft not found');
        if (aircraftResult.rows[0].status !== 'active') throw new AppError(409, 'Aircraft is not active');

        const [originExists, destExists] = await Promise.all([
            query('SELECT 1 FROM airports WHERE code = $1', [originCode]),
            query('SELECT 1 FROM airports WHERE code = $1', [destinationCode])
        ]);
        if (!originExists.rowCount) throw new AppError(400, 'Unknown origin airport code');
        if (!destExists.rowCount) throw new AppError(400, 'Unknown destination airport code');

        const insertResult = await query(
            `INSERT INTO flight_schedules (flight_number, aircraft_id, origin_code, destination_code, departure_time_of_day,
                                            duration_minutes, days_of_week, base_price_economy_cents, base_price_business_cents,
                                            base_price_first_cents, gate, terminal, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             RETURNING id`,
            [
                flightNumber, aircraftId, originCode, destinationCode, departureTimeOfDay, durationMinutes, daysOfWeek,
                basePriceEconomyCents, basePriceBusinessCents, basePriceFirstCents, gate || null, terminal || null,
                req.currentUser.id
            ]
        );
        const scheduleId = insertResult.rows[0].id;
        const flightsCreated = await scheduleGenerator.generateForScheduleById(scheduleId);

        await recordAudit({
            req, action: 'schedule_created', entityType: 'flight_schedule', entityId: scheduleId,
            details: { flightNumber, flightsCreated }
        });
        res.status(201).json({ scheduleId, flightsCreated });
    } catch (err) {
        next(err);
    }
}

async function updateScheduleStatus(req, res, next) {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const result = await query(
            `UPDATE flight_schedules SET status = $1 WHERE id = $2 RETURNING id, status`,
            [status, id]
        );
        if (!result.rows[0]) throw new AppError(404, 'Schedule not found');

        const flightsCreated = status === 'active' ? await scheduleGenerator.generateForScheduleById(id) : 0;

        await recordAudit({ req, action: 'schedule_status_updated', entityType: 'flight_schedule', entityId: id, details: { status } });
        res.json({ schedule: result.rows[0], flightsCreated });
    } catch (err) {
        next(err);
    }
}

module.exports = { listSchedules, createSchedule, updateScheduleStatus };
