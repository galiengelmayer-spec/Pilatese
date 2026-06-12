-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- Creates the studio_schedule table and seeds default time slots

CREATE TABLE IF NOT EXISTS studio_schedule (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 5),
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(day_of_week, start_time)
);

-- Seed with the current default schedule (all 6 days, 7 slots each)
INSERT INTO studio_schedule (day_of_week, start_time, end_time)
SELECT d, start_t, end_t
FROM generate_series(0, 5) AS d,
  (VALUES
    ('07:30', '08:30'),
    ('08:30', '09:30'),
    ('09:30', '10:30'),
    ('17:00', '18:00'),
    ('18:00', '19:00'),
    ('19:00', '20:00'),
    ('20:00', '21:00')
  ) AS t(start_t, end_t)
ON CONFLICT DO NOTHING;
