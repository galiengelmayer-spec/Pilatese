import { useState, useEffect } from 'react';
import { supabase } from './supabase';

// ─── Shared DB writes ────────────────────────────────────────────────────────

export async function markAsPaid(paymentIds) {
  if (!paymentIds?.length) return;
  const { error } = await supabase
    .from('payments')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .in('id', paymentIds);
  if (error) throw error;
}

export async function startNewCycle(clientId) {
  const today = new Date().toISOString().split('T')[0];
  // Complete any active cycle
  await supabase
    .from('ticket_cycles')
    .update({ completed_at: today })
    .eq('client_id', clientId)
    .is('completed_at', null);
  // Create new cycle
  const { data: newCycle, error } = await supabase
    .from('ticket_cycles')
    .insert({ client_id: clientId, sessions_used: 0, sessions_max: 10, started_at: today })
    .select()
    .single();
  if (error) throw error;
  // Create payment record
  await supabase.from('payments').insert({
    client_id: clientId, ticket_cycle_id: newCycle.id, status: 'unpaid',
  });
  return newCycle;
}

// ─── Data fetchers ────────────────────────────────────────────────────────────

export async function fetchClientCycles(clientId) {
  const { data, error } = await supabase
    .from('ticket_cycles')
    .select('id, sessions_used, sessions_max, started_at, completed_at, created_at, payments(id, status, paid_at, amount)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// Returns [{client, paymentIds[], sessionsTotal}] sorted by name
export async function fetchUnpaidSummary() {
  const { data, error } = await supabase
    .from('payments')
    .select('id, client_id, ticket_cycle_id, clients(id, name), ticket_cycles(sessions_used)')
    .eq('status', 'unpaid');
  if (error) throw error;

  const map = {};
  (data || []).forEach(p => {
    const cid = p.client_id;
    if (!cid) return;
    if (!map[cid]) map[cid] = { client: p.clients, paymentIds: [], sessionsTotal: 0 };
    map[cid].paymentIds.push(p.id);
    map[cid].sessionsTotal += p.ticket_cycles?.sessions_used || 0;
  });

  return Object.values(map).sort((a, b) =>
    (a.client?.name || '').localeCompare(b.client?.name || '', 'he')
  );
}

export async function fetchAbsentThisWeek() {
  const today = new Date();
  const dow = today.getDay();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - dow);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const { data } = await supabase
    .from('attendance')
    .select('client_id')
    .eq('status', 'absent')
    .gte('lesson_date', weekStart.toISOString().split('T')[0])
    .lte('lesson_date', weekEnd.toISOString().split('T')[0]);

  return new Set((data || []).map(a => a.client_id)).size;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useClientPayments(clientId) {
  const [cycles, setCycles] = useState([]);
  const [loadingCycles, setLoadingCycles] = useState(false);

  async function reloadCycles() {
    if (!clientId) return;
    setLoadingCycles(true);
    try { setCycles(await fetchClientCycles(clientId)); } catch (_) {}
    setLoadingCycles(false);
  }

  useEffect(() => { if (clientId) reloadCycles(); }, [clientId]);

  async function handleMarkPaid(paymentId) {
    await markAsPaid([paymentId]);
    const now = new Date().toISOString();
    setCycles(prev =>
      prev.map(c => {
        const p = c.payments?.[0];
        if (!p || p.id !== paymentId) return c;
        return { ...c, payments: [{ ...p, status: 'paid', paid_at: now }] };
      })
    );
  }

  async function handleStartNewCycle() {
    await startNewCycle(clientId);
    await reloadCycles();
  }

  return { cycles, loadingCycles, handleMarkPaid, handleStartNewCycle, reloadCycles };
}
