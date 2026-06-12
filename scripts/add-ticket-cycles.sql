-- Payment model: ticket_cycles + payments tables.
-- Run this once in Supabase SQL editor.

CREATE TABLE IF NOT EXISTS ticket_cycles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID REFERENCES clients(id) ON DELETE CASCADE,
  sessions_used INT  DEFAULT 0,
  sessions_max  INT  DEFAULT 10,
  started_at    DATE,
  completed_at  DATE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        UUID REFERENCES clients(id) ON DELETE CASCADE,
  ticket_cycle_id  UUID REFERENCES ticket_cycles(id) ON DELETE CASCADE UNIQUE,
  status           TEXT DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid')),
  amount           NUMERIC(8,2),
  paid_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Seed: one completed+paid cycle and one active+unpaid cycle per existing client.
DO $$
DECLARE
  c RECORD;
  cyc_id UUID;
BEGIN
  FOR c IN SELECT id FROM clients LOOP
    -- Completed cycle (paid)
    INSERT INTO ticket_cycles (client_id, sessions_used, sessions_max, started_at, completed_at)
    VALUES (c.id, 10, 10, CURRENT_DATE - INTERVAL '90 days', CURRENT_DATE - INTERVAL '5 days')
    RETURNING id INTO cyc_id;

    INSERT INTO payments (client_id, ticket_cycle_id, status, amount, paid_at)
    VALUES (c.id, cyc_id, 'paid', 450, NOW() - INTERVAL '5 days');

    -- Active cycle (unpaid)
    INSERT INTO ticket_cycles (client_id, sessions_used, sessions_max, started_at)
    VALUES (c.id, 4, 10, CURRENT_DATE - INTERVAL '30 days')
    RETURNING id INTO cyc_id;

    INSERT INTO payments (client_id, ticket_cycle_id, status, amount)
    VALUES (c.id, cyc_id, 'unpaid', 450);
  END LOOP;
END $$;
