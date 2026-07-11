-- Sample data for local development / demo / pentest exercise.
-- Seed passwords (CHANGE THESE before any non-local exposure):
--   admin@airline.test    / Admin#12345
--   staff@airline.test    / Staff#12345
--   customer@airline.test / Customer#12345

BEGIN;

-- ---------- Users ----------
INSERT INTO users (first_name, last_name, email, password_hash, role, phone, is_active)
VALUES
    ('Ada', 'Admin', 'admin@airline.test',
     '$2b$12$yXAo7t4yBIdR5.zJ/Dhv3O4Xe1Cdtz60WJ91ZFpNS3lm3EquOWFmq', 'admin', '+1-555-0100', TRUE),
    ('Sam', 'Staffer', 'staff@airline.test',
     '$2b$12$aDdk3qe.eovin0Uf1hnAwODs9jaqQ1vuRRn2kq8UZCyKgNOBkgFY.', 'staff', '+1-555-0101', TRUE),
    ('Justin', 'Comstock', 'customer@airline.test',
     '$2b$12$6hlIaCdcY2ljRovN8bBiY.zZF4EwVsnd5n5DOLcoMk9oWHeQrkyG2', 'customer', '+1-555-0102', TRUE)
ON CONFLICT (email) DO NOTHING;

-- ---------- Airports ----------
-- The full global airport list is loaded separately by db/import-airports.js
-- (run before this file, see db/run-seed.js) from a committed OurAirports
-- extract, so every airport referenced below already exists by this point.

-- ---------- Aircraft ----------
-- Row 1 is carved out as First Class on the two larger aircraft (row 4,
-- seat B4, stays inside the economy range on N802FA — matching the
-- reference UI's "seat B4 / Economy / $120" demo booking).
INSERT INTO aircraft (tail_number, model, manufacturer, total_seats, seat_layout, status) VALUES
    ('N802FA', 'A320', 'Airbus', 144,
     '{"rows":24,"cols":["A","B","C","D","E","F"],"sections":[{"class":"first","rowStart":1,"rowEnd":1},{"class":"business","rowStart":2,"rowEnd":3},{"class":"economy","rowStart":4,"rowEnd":24}]}',
     'active'),
    ('N118FA', 'B737-800', 'Boeing', 162,
     '{"rows":27,"cols":["A","B","C","D","E","F"],"sections":[{"class":"first","rowStart":1,"rowEnd":1},{"class":"business","rowStart":2,"rowEnd":3},{"class":"economy","rowStart":4,"rowEnd":27}]}',
     'active'),
    ('N305FA', 'E175', 'Embraer', 76,
     '{"rows":19,"cols":["A","B","C","D"],"sections":[{"class":"business","rowStart":1,"rowEnd":2},{"class":"economy","rowStart":3,"rowEnd":19}]}',
     'active')
ON CONFLICT (tail_number) DO NOTHING;

-- ---------- Flight Schedules ----------
-- Recurring routes, not one-off flights: db/run-seed.js generates real
-- `flights` + `flight_seats` rows from these for a rolling 90-day window
-- right after this file runs (see services/scheduleGenerator.js), so any
-- date in that window is genuinely searchable — not just one fixed date.
INSERT INTO flight_schedules (flight_number, aircraft_id, origin_code, destination_code, departure_time_of_day,
                               duration_minutes, days_of_week, base_price_economy_cents, base_price_business_cents,
                               base_price_first_cents, gate, terminal, created_by)
SELECT 'FA802', a.id, 'TPA', 'COS', '06:00', 180, ARRAY[0,1,2,3,4,5,6]::smallint[],
       12000, 34000, 60000, 'C12', '3',
       (SELECT id FROM users WHERE email = 'staff@airline.test')
FROM aircraft a WHERE a.tail_number = 'N802FA'
ON CONFLICT (flight_number) DO NOTHING;

INSERT INTO flight_schedules (flight_number, aircraft_id, origin_code, destination_code, departure_time_of_day,
                               duration_minutes, days_of_week, base_price_economy_cents, base_price_business_cents,
                               base_price_first_cents, gate, terminal, created_by)
SELECT 'FA118', a.id, 'COS', 'TPA', '14:30', 195, ARRAY[0,1,2,3,4,5,6]::smallint[],
       13500, 36000, 65000, 'B4', '2',
       (SELECT id FROM users WHERE email = 'staff@airline.test')
FROM aircraft a WHERE a.tail_number = 'N118FA'
ON CONFLICT (flight_number) DO NOTHING;

INSERT INTO flight_schedules (flight_number, aircraft_id, origin_code, destination_code, departure_time_of_day,
                               duration_minutes, days_of_week, base_price_economy_cents, base_price_business_cents,
                               base_price_first_cents, gate, terminal, created_by)
SELECT 'FA245', a.id, 'JFK', 'LAX', '08:15', 200, ARRAY[0,1,2,3,4,5,6]::smallint[],
       21000, 52000, 90000, 'A22', '4',
       (SELECT id FROM users WHERE email = 'staff@airline.test')
FROM aircraft a WHERE a.tail_number = 'N118FA'
ON CONFLICT (flight_number) DO NOTHING;

INSERT INTO flight_schedules (flight_number, aircraft_id, origin_code, destination_code, departure_time_of_day,
                               duration_minutes, days_of_week, base_price_economy_cents, base_price_business_cents,
                               base_price_first_cents, gate, terminal, created_by)
SELECT 'FA309', a.id, 'ATL', 'MIA', '10:00', 105, ARRAY[0,1,2,3,4,5,6]::smallint[],
       9800, 24000, 0, 'D5', '1',
       (SELECT id FROM users WHERE email = 'staff@airline.test')
FROM aircraft a WHERE a.tail_number = 'N305FA'
ON CONFLICT (flight_number) DO NOTHING;

INSERT INTO flight_schedules (flight_number, aircraft_id, origin_code, destination_code, departure_time_of_day,
                               duration_minutes, days_of_week, base_price_economy_cents, base_price_business_cents,
                               base_price_first_cents, gate, terminal, created_by)
SELECT 'FA412', a.id, 'ORD', 'DEN', '18:20', 105, ARRAY[0,1,2,3,4,5,6]::smallint[],
       15500, 38000, 70000, 'E9', '2',
       (SELECT id FROM users WHERE email = 'staff@airline.test')
FROM aircraft a WHERE a.tail_number = 'N118FA'
ON CONFLICT (flight_number) DO NOTHING;

-- ---------- System settings ----------
INSERT INTO system_settings (key, value) VALUES
    ('booking.seat_hold_seconds', '600'),
    ('booking.max_passengers_per_booking', '6'),
    ('site.maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;

COMMIT;
