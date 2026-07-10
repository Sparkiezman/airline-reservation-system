-- Airline Reservation System — PostgreSQL schema
-- Design notes:
--   * All primary keys are BIGSERIAL; booking_ref is the human-facing identifier.
--   * Authorization (not ID obscurity) is what prevents IDOR — every route checks ownership/role.
--   * Money stored as INTEGER cents to avoid floating point rounding issues.

BEGIN;

CREATE TABLE IF NOT EXISTS users (
    id                      BIGSERIAL PRIMARY KEY,
    first_name              VARCHAR(100) NOT NULL,
    last_name               VARCHAR(100) NOT NULL,
    email                   VARCHAR(255) NOT NULL UNIQUE,
    password_hash           VARCHAR(255) NOT NULL,
    role                    VARCHAR(20)  NOT NULL DEFAULT 'customer'
                                CHECK (role IN ('customer', 'staff', 'admin')),
    phone                   VARCHAR(30),
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    failed_login_attempts   INTEGER NOT NULL DEFAULT 0,
    locked_until            TIMESTAMPTZ,
    must_change_password    BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at           TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id          BIGSERIAL PRIMARY KEY,
    user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens (user_id);

CREATE TABLE IF NOT EXISTS airports (
    code        CHAR(3) PRIMARY KEY,
    name        VARCHAR(150) NOT NULL,
    city        VARCHAR(100) NOT NULL,
    country     VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS aircraft (
    id              BIGSERIAL PRIMARY KEY,
    tail_number     VARCHAR(20) NOT NULL UNIQUE,
    model           VARCHAR(100) NOT NULL,
    manufacturer    VARCHAR(100),
    total_seats     INTEGER NOT NULL CHECK (total_seats > 0),
    seat_layout     JSONB NOT NULL,
    -- seat_layout example:
    -- {"rows": 30, "cols": ["A","B","C","D","E","F"],
    --   "sections": [{"class":"business","rowStart":1,"rowEnd":4},
    --                {"class":"economy","rowStart":5,"rowEnd":30}]}
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'maintenance', 'retired')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS flights (
    id                      BIGSERIAL PRIMARY KEY,
    flight_number           VARCHAR(10) NOT NULL,
    aircraft_id             BIGINT NOT NULL REFERENCES aircraft(id),
    origin_code             CHAR(3) NOT NULL REFERENCES airports(code),
    destination_code        CHAR(3) NOT NULL REFERENCES airports(code),
    departure_time          TIMESTAMPTZ NOT NULL,
    arrival_time            TIMESTAMPTZ NOT NULL,
    base_price_economy_cents  INTEGER NOT NULL CHECK (base_price_economy_cents >= 0),
    base_price_business_cents INTEGER NOT NULL CHECK (base_price_business_cents >= 0),
    base_price_first_cents  INTEGER NOT NULL DEFAULT 0 CHECK (base_price_first_cents >= 0),
    gate                    VARCHAR(10),
    terminal                VARCHAR(10),
    status                  VARCHAR(20) NOT NULL DEFAULT 'scheduled'
                                CHECK (status IN ('scheduled','boarding','departed','arrived','cancelled','delayed')),
    created_by              BIGINT REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_route_diff CHECK (origin_code <> destination_code),
    CONSTRAINT chk_times CHECK (arrival_time > departure_time)
);
CREATE INDEX IF NOT EXISTS idx_flights_route_date ON flights (origin_code, destination_code, departure_time);
CREATE INDEX IF NOT EXISTS idx_flights_status ON flights (status);

CREATE TABLE IF NOT EXISTS flight_seats (
    id              BIGSERIAL PRIMARY KEY,
    flight_id       BIGINT NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
    seat_number     VARCHAR(6) NOT NULL,
    class           VARCHAR(20) NOT NULL CHECK (class IN ('economy', 'business', 'first')),
    price_cents     INTEGER NOT NULL CHECK (price_cents >= 0),
    status          VARCHAR(20) NOT NULL DEFAULT 'available'
                        CHECK (status IN ('available', 'booked', 'blocked')),
    UNIQUE (flight_id, seat_number)
);
CREATE INDEX IF NOT EXISTS idx_flight_seats_flight ON flight_seats (flight_id, status);

CREATE TABLE IF NOT EXISTS bookings (
    id              BIGSERIAL PRIMARY KEY,
    booking_ref     VARCHAR(8) NOT NULL UNIQUE,
    user_id         BIGINT NOT NULL REFERENCES users(id),
    flight_id       BIGINT NOT NULL REFERENCES flights(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending_payment'
                        CHECK (status IN ('pending_payment','confirmed','cancelled','checked_in','completed')),
    total_price_cents INTEGER NOT NULL CHECK (total_price_cents >= 0),
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings (user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_flight ON bookings (flight_id);

CREATE TABLE IF NOT EXISTS booking_items (
    id                      BIGSERIAL PRIMARY KEY,
    booking_id              BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    seat_id                 BIGINT NOT NULL REFERENCES flight_seats(id),
    passenger_first_name    VARCHAR(100) NOT NULL,
    passenger_last_name     VARCHAR(100) NOT NULL,
    passenger_dob           DATE,
    class                   VARCHAR(20) NOT NULL CHECK (class IN ('economy', 'business', 'first')),
    price_cents             INTEGER NOT NULL CHECK (price_cents >= 0),
    status                  VARCHAR(20) NOT NULL DEFAULT 'booked'
                                CHECK (status IN ('booked', 'cancelled', 'checked_in')),
    UNIQUE (seat_id)
);
CREATE INDEX IF NOT EXISTS idx_booking_items_booking ON booking_items (booking_id);

CREATE TABLE IF NOT EXISTS payments (
    id              BIGSERIAL PRIMARY KEY,
    booking_id      BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    amount_cents    INTEGER NOT NULL CHECK (amount_cents >= 0),
    currency        CHAR(3) NOT NULL DEFAULT 'USD',
    method          VARCHAR(20) NOT NULL DEFAULT 'card',
    card_last4      CHAR(4),
    card_brand      VARCHAR(20),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','succeeded','failed','refunded')),
    transaction_ref VARCHAR(40) NOT NULL UNIQUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments (booking_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT REFERENCES users(id) ON DELETE SET NULL,
    actor_email     VARCHAR(255),
    action          VARCHAR(100) NOT NULL,
    entity_type     VARCHAR(50),
    entity_id       VARCHAR(50),
    ip_address      VARCHAR(45),
    user_agent      TEXT,
    details         JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs (action);

CREATE TABLE IF NOT EXISTS system_settings (
    key         VARCHAR(100) PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_by  BIGINT REFERENCES users(id),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Keep updated_at columns fresh automatically
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_aircraft_updated_at ON aircraft;
CREATE TRIGGER trg_aircraft_updated_at BEFORE UPDATE ON aircraft
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_flights_updated_at ON flights;
CREATE TRIGGER trg_flights_updated_at BEFORE UPDATE ON flights
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_bookings_updated_at ON bookings;
CREATE TRIGGER trg_bookings_updated_at BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;
