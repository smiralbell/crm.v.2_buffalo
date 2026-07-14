-- Reservas Cal.com recibidas por webhook (Marketing → Web)
-- Ejecutar en PostgreSQL antes de configurar el webhook en Cal.com.

CREATE TABLE IF NOT EXISTS cal_bookings (
  id                SERIAL PRIMARY KEY,
  uid               TEXT NOT NULL UNIQUE,
  trigger_event     TEXT,
  title             TEXT,
  status            TEXT NOT NULL DEFAULT 'accepted'
                    CHECK (status IN ('accepted', 'pending', 'cancelled', 'rejected')),
  start_time        TIMESTAMPTZ,
  end_time          TIMESTAMPTZ,
  duration_minutes  INTEGER,
  attendee_name     TEXT,
  attendee_email    TEXT,
  location          TEXT,
  event_type_slug   TEXT,
  event_type_id     INTEGER,
  payload           JSONB NOT NULL,
  booked_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cal_bookings_booked_at
  ON cal_bookings (booked_at DESC);

CREATE INDEX IF NOT EXISTS idx_cal_bookings_start_time
  ON cal_bookings (start_time);

CREATE INDEX IF NOT EXISTS idx_cal_bookings_status
  ON cal_bookings (status);

COMMENT ON TABLE cal_bookings IS
  'Reservas Cal.com vía POST /api/webhooks/calcom (BOOKING_CREATED, etc.)';
