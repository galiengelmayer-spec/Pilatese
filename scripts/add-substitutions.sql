-- Part 4: Attendance model migration
-- Run this once in the Supabase SQL Editor.

-- Step 1: Remove duplicate attendance rows (keep the one with the largest id)
WITH dups AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY lesson_date::text, time_slot::text, client_id
           ORDER BY id DESC
         ) AS rn
  FROM attendance
)
DELETE FROM attendance WHERE id IN (SELECT id FROM dups WHERE rn > 1);

-- Step 2: Unique constraint so pre-seeding is safe under concurrent opens
ALTER TABLE attendance
  ADD CONSTRAINT IF NOT EXISTS attendance_unique_session
  UNIQUE (lesson_date, time_slot, client_id);

-- Step 3: Substitution links (absent regular → their replacement client)
CREATE TABLE IF NOT EXISTS substitutions (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_date          DATE        NOT NULL,
  time_slot            TEXT        NOT NULL,
  absent_client_id     UUID        NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  substitute_client_id UUID        REFERENCES clients(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lesson_date, time_slot, absent_client_id)
);
