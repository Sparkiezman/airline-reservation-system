-- Pre-books seat B4 on a FA802 (TPA -> COS) departure 3 days out, for the
-- demo customer — matching the reference UI mockups (seat B4, Economy,
-- $120). Run by db/run-seed.js AFTER flight instances have been generated
-- from flight_schedules, since it needs an actual flight_seats row to exist.
DO $$
DECLARE
    v_flight_id BIGINT;
    v_seat_id BIGINT;
    v_user_id BIGINT;
    v_booking_id BIGINT;
BEGIN
    SELECT id INTO v_flight_id FROM flights
        WHERE flight_number = 'FA802' AND departure_time::date = (CURRENT_DATE + INTERVAL '3 day')::date
        LIMIT 1;
    SELECT id INTO v_seat_id FROM flight_seats WHERE flight_id = v_flight_id AND seat_number = 'B4';
    SELECT id INTO v_user_id FROM users WHERE email = 'customer@airline.test';

    IF v_flight_id IS NOT NULL AND v_seat_id IS NOT NULL AND v_user_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM bookings WHERE booking_ref = 'DEMO001') THEN
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
