-- Run once in the Supabase SQL Editor
ALTER TABLE clients ADD COLUMN IF NOT EXISTS gender TEXT DEFAULT 'female' CHECK (gender IN ('male', 'female'));
UPDATE clients SET gender = 'female' WHERE gender IS NULL;
