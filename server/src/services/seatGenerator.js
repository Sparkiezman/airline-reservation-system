'use strict';

const PRICE_KEY_BY_CLASS = {
    first: 'first',
    business: 'business',
    economy: 'economy'
};

/**
 * Builds the flight_seats rows for a newly created flight from its
 * aircraft's seat_layout JSON (see schema.sql for the shape).
 * `prices` maps class name -> price in cents, e.g. { economy, business, first }.
 */
function buildSeatRows(seatLayout, prices) {
    const rows = [];
    const { rows: rowCount, cols, sections } = seatLayout;

    for (let rowNum = 1; rowNum <= rowCount; rowNum++) {
        const section = sections.find((s) => rowNum >= s.rowStart && rowNum <= s.rowEnd);
        if (!section) continue;
        for (const col of cols) {
            const priceKey = PRICE_KEY_BY_CLASS[section.class] || 'economy';
            rows.push({
                seatNumber: `${col}${rowNum}`,
                class: section.class,
                priceCents: prices[priceKey]
            });
        }
    }
    return rows;
}

async function insertSeatsForFlight(client, flightId, seatLayout, prices) {
    const seatRows = buildSeatRows(seatLayout, prices);
    for (const seat of seatRows) {
        await client.query(
            `INSERT INTO flight_seats (flight_id, seat_number, class, price_cents, status)
             VALUES ($1, $2, $3, $4, 'available')`,
            [flightId, seat.seatNumber, seat.class, seat.priceCents]
        );
    }
    return seatRows.length;
}

module.exports = { buildSeatRows, insertSeatsForFlight };
