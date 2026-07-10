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
INSERT INTO airports (code, name, city, country) VALUES
    ('TPA', 'Tampa International Airport', 'Tampa', 'USA'),
    ('COS', 'Colorado Springs Airport', 'Colorado Springs', 'USA'),
    ('JFK', 'John F. Kennedy International Airport', 'New York', 'USA'),
    ('LAX', 'Los Angeles International Airport', 'Los Angeles', 'USA'),
    ('ORD', 'O''Hare International Airport', 'Chicago', 'USA'),
    ('ATL', 'Hartsfield-Jackson Atlanta International Airport', 'Atlanta', 'USA'),
    ('MIA', 'Miami International Airport', 'Miami', 'USA'),
    ('DEN', 'Denver International Airport', 'Denver', 'USA')
ON CONFLICT (code) DO NOTHING;

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

-- ---------- Flights ----------
-- FA802 TPA -> COS matches the reference UI mockups (seat B4, $120 economy).
INSERT INTO flights (flight_number, aircraft_id, origin_code, destination_code, departure_time, arrival_time,
                      base_price_economy_cents, base_price_business_cents, base_price_first_cents, gate, terminal, status, created_by)
SELECT 'FA802', a.id, 'TPA', 'COS',
       (CURRENT_DATE + INTERVAL '3 day' + TIME '06:00'),
       (CURRENT_DATE + INTERVAL '3 day' + TIME '09:00'),
       12000, 34000, 60000, 'C12', '3', 'scheduled',
       (SELECT id FROM users WHERE email = 'staff@airline.test')
FROM aircraft a WHERE a.tail_number = 'N802FA';

INSERT INTO flights (flight_number, aircraft_id, origin_code, destination_code, departure_time, arrival_time,
                      base_price_economy_cents, base_price_business_cents, base_price_first_cents, gate, terminal, status, created_by)
SELECT 'FA118', a.id, 'COS', 'TPA',
       (CURRENT_DATE + INTERVAL '10 day' + TIME '14:30'),
       (CURRENT_DATE + INTERVAL '10 day' + TIME '17:45'),
       13500, 36000, 65000, 'B4', '2', 'scheduled',
       (SELECT id FROM users WHERE email = 'staff@airline.test')
FROM aircraft a WHERE a.tail_number = 'N118FA';

INSERT INTO flights (flight_number, aircraft_id, origin_code, destination_code, departure_time, arrival_time,
                      base_price_economy_cents, base_price_business_cents, base_price_first_cents, gate, terminal, status, created_by)
SELECT 'FA245', a.id, 'JFK', 'LAX',
       (CURRENT_DATE + INTERVAL '5 day' + TIME '08:15'),
       (CURRENT_DATE + INTERVAL '5 day' + TIME '11:35'),
       21000, 52000, 90000, 'A22', '4', 'scheduled',
       (SELECT id FROM users WHERE email = 'staff@airline.test')
FROM aircraft a WHERE a.tail_number = 'N118FA';

INSERT INTO flights (flight_number, aircraft_id, origin_code, destination_code, departure_time, arrival_time,
                      base_price_economy_cents, base_price_business_cents, base_price_first_cents, gate, terminal, status, created_by)
SELECT 'FA309', a.id, 'ATL', 'MIA',
       (CURRENT_DATE + INTERVAL '4 day' + TIME '10:00'),
       (CURRENT_DATE + INTERVAL '4 day' + TIME '11:45'),
       9800, 24000, 0, 'D5', '1', 'scheduled',
       (SELECT id FROM users WHERE email = 'staff@airline.test')
FROM aircraft a WHERE a.tail_number = 'N305FA';

INSERT INTO flights (flight_number, aircraft_id, origin_code, destination_code, departure_time, arrival_time,
                      base_price_economy_cents, base_price_business_cents, base_price_first_cents, gate, terminal, status, created_by)
SELECT 'FA412', a.id, 'ORD', 'DEN',
       (CURRENT_DATE + INTERVAL '6 day' + TIME '18:20'),
       (CURRENT_DATE + INTERVAL '6 day' + TIME '20:05'),
       15500, 38000, 70000, 'E9', '2', 'scheduled',
       (SELECT id FROM users WHERE email = 'staff@airline.test')
FROM aircraft a WHERE a.tail_number = 'N118FA';

-- ---------- Generate flight_seats for every flight from its aircraft seat_layout ----------
INSERT INTO flight_seats (flight_id, seat_number, class, price_cents, status)
SELECT f.id,
       (c.col || r.row_num) AS seat_number,
       CASE WHEN r.row_num BETWEEN (sec->>'rowStart')::int AND (sec->>'rowEnd')::int
            THEN sec->>'class' END AS class,
       CASE (sec->>'class')
            WHEN 'first' THEN f.base_price_first_cents
            WHEN 'business' THEN f.base_price_business_cents
            ELSE f.base_price_economy_cents END AS price_cents,
       'available'
FROM flights f
JOIN aircraft a ON a.id = f.aircraft_id
CROSS JOIN LATERAL generate_series(1, (a.seat_layout->>'rows')::int) AS r(row_num)
CROSS JOIN LATERAL jsonb_array_elements_text(a.seat_layout->'cols') AS c(col)
CROSS JOIN LATERAL jsonb_array_elements(a.seat_layout->'sections') AS sec
WHERE r.row_num BETWEEN (sec->>'rowStart')::int AND (sec->>'rowEnd')::int
ON CONFLICT (flight_id, seat_number) DO NOTHING;

-- ---------- Pre-book seat B4 on FA802 for the demo customer, matching the reference UI ----------
DO $$
DECLARE
    v_flight_id BIGINT;
    v_seat_id BIGINT;
    v_user_id BIGINT;
    v_booking_id BIGINT;
BEGIN
    SELECT id INTO v_flight_id FROM flights WHERE flight_number = 'FA802' LIMIT 1;
    SELECT id INTO v_seat_id FROM flight_seats WHERE flight_id = v_flight_id AND seat_number = 'B4';
    SELECT id INTO v_user_id FROM users WHERE email = 'customer@airline.test';

    IF v_flight_id IS NOT NULL AND v_seat_id IS NOT NULL AND v_user_id IS NOT NULL THEN
        INSERT INTO bookings (booking_ref, user_id, flight_id, status, total_price_cents)
        VALUES ('DEMO001', v_user_id, v_flight_id, 'confirmed', 12000)
        RETURNING id INTO v_booking_id;

        INSERT INTO booking_items (booking_id, seat_id, passenger_first_name, passenger_last_name, class, price_cents, status)
        VALUES (v_booking_id, v_seat_id, 'Justin', 'Comstock', 'economy', 12000, 'booked');

        UPDATE flight_seats SET status = 'booked' WHERE id = v_seat_id;

        INSERT INTO payments (booking_id, amount_cents, method, card_last4, card_brand, status, transaction_ref)
        VALUES (v_booking_id, 12000, 'card', '4242', 'visa', 'succeeded', 'DEMO-TXN-0001');
    END IF;
END $$;

-- ---------- System settings ----------
INSERT INTO system_settings (key, value) VALUES
    ('booking.seat_hold_seconds', '600'),
    ('booking.max_passengers_per_booking', '6'),
    ('site.maintenance_mode', 'false')
ON CONFLICT (key) DO NOTHING;

COMMIT;
