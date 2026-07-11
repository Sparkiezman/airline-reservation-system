'use strict';
/**
 * Upserts the global airport dataset (server/db/data/airports.csv — a
 * trimmed, committed extract of OurAirports' large/medium airports with a
 * valid IATA code) into the airports table. Safe to re-run.
 */
const fs = require('fs');
const path = require('path');
const { query } = require('../src/config/db');

function parseCsvLine(line) {
    const fields = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQuotes) {
            if (c === '"') {
                if (line[i + 1] === '"') { field += '"'; i++; }
                else inQuotes = false;
            } else field += c;
        } else if (c === '"') inQuotes = true;
        else if (c === ',') { fields.push(field); field = ''; }
        else field += c;
    }
    fields.push(field);
    return fields;
}

async function importAirports() {
    const csv = fs.readFileSync(path.join(__dirname, 'data', 'airports.csv'), 'utf8');
    const lines = csv.split('\n').filter((l) => l.trim().length);
    const rows = lines.slice(1).map(parseCsvLine);

    const CHUNK_SIZE = 500;
    let imported = 0;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const values = [];
        const placeholders = chunk.map((row, j) => {
            const base = j * 6;
            values.push(row[0], row[1], row[2], row[3], Number(row[4]), Number(row[5]));
            return `($${base + 1},$${base + 2},$${base + 3},$${base + 4},$${base + 5},$${base + 6})`;
        }).join(',');

        await query(
            `INSERT INTO airports (code, name, city, country, latitude_deg, longitude_deg)
             VALUES ${placeholders}
             ON CONFLICT (code) DO UPDATE SET
                name = EXCLUDED.name, city = EXCLUDED.city, country = EXCLUDED.country,
                latitude_deg = EXCLUDED.latitude_deg, longitude_deg = EXCLUDED.longitude_deg`,
            values
        );
        imported += chunk.length;
    }
    return imported;
}

module.exports = { importAirports };
