import { useState, useEffect } from 'react';
import { supabase } from './supabase';

// ─── Shared DB writes ────────────────────────────────────────────────────────

/** Mark an array of payment IDs as paid — single point of truth for all entry points. */
export async function markAsPaid(paymentIds) {
  if (!paymentIds?.length) return;
  const { error } = await supabase
    .from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .in('id', paymentIds);
  if (error) throw error;
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

/** All ticket cycles + their payment record for a single client, newest first. */
export async function fetchClientCycles(clientId) {
  const { data, error } = await supabase
    .from('ticket_cycles')
    .select('id, sessions_used, sessions_max, started_at, completed_at, created_at, payments(id, status, paid_at, amount)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Clients who have at least one unpaid payment, sorted by name. */
export async function fetchUnpaidSummary() {
  const { data, error } = await supabase
    .from('payments')
    .select('id, client_id, ticket_cycle_id, clients(id, name)')
    .eq('status', 'unpaid');
  if (error) throw error;

  const map = {};
  (data || []).forEach(p => {
    const cid = p.client_id;
    if (!cid) return;
    if (!map[cid]) map[cid] = { client: p.clients, paymentIds: [] };
    map[cid].paymentIds.push(p.id);
  });

  return Object.values(map).sort((a, b) =>
    (a.client?.name || '').localeCompare(b.client?.name || '', 'he')
  );
}

/** Set of client IDs that have at least one unpaid payment — for badge rendering. */
export async function fetchUnpaidClientIds() {
  const { data } = await supabase
    .from('payments')
    .select('client_id')
    .eq('status', 'unpaid');
  return new Set((data || []).map(p => p.client_id));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Per-client hook used by ClientDetailScreen.
 * Returns cycles with embedded payment records plus an optimistic markAsPaid handler.
 */
export function useClientPayments(clientId) {
  const [cycles, setCycles] = useState([]);
  const [loadingCycles, setLoadingCycles] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    setLoadingCycles(true);
    fetchClientCycles(clientId)
      .then(setCycles)
      .catch(() => {})
      .finally(() => setLoadingCycles(false));
  }, [clientId]);

  async function handleMarkPaid(paymentId) {
    await markAsPaid([paymentId]);
    // Optimistic local update — no reload needed
    const now = new Date().toISOString();
    setCycles(prev =>
      prev.map(c => {
        const p = c.payments?.[0];
        if (!p || p.id !== paymentId) return c;
        return { ...c, payments: [{ ...p, status: 'paid', paid_at: now }] };
      })
    );
  }

  return { cycles, loadingCycles, handleMarkPaid };
}
