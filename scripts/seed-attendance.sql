-- Mock attendance for the past 30 days.
-- Run AFTER add-substitutions.sql (needs the UNIQUE constraint).
-- Distribution: ~70 % present (green), ~20 % absent (red), ~10 % planned_absent (grey).
-- Skips Saturday (dow = 6) and skips rows that already exist.

INSERT INTO attendance (lesson_date, time_slot, client_id, status, paid)
SELECT
  d::DATE                                             AS lesson_date,
  cs.time_slot                                        AS time_slot,
  cs.client_id                                        AS client_id,
  CASE
    WHEN rv.r < 0.70 THEN 'present'
    WHEN rv.r < 0.90 THEN 'absent'
    ELSE                   'planned_absent'
  END                                                 AS status,
  FALSE                                               AS paid
FROM generate_series(
       CURRENT_DATE - INTERVAL '30 days',
       CURRENT_DATE - INTERVAL '1 day',
       '1 day'
     ) AS d
JOIN  client_slots cs
      ON  cs.day_of_week = EXTRACT(DOW FROM d::DATE)::INT
CROSS JOIN LATERAL (SELECT random() AS r) AS rv
WHERE EXTRACT(DOW FROM d::DATE) != 6          -- skip Saturday
ON CONFLICT (lesson_date, time_slot, client_id) DO NOTHING;
