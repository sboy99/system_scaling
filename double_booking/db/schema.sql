CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE bookings (
  id          BIGSERIAL PRIMARY KEY,
  room_id     INT         NOT NULL,
  user_id     INT         NOT NULL,
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  CHECK (end_time > start_time),
  EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(start_time, end_time, '[)') WITH &&
  )
);
