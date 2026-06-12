import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { fetchUnpaidSummary, fetchClientCycles, markAsPaid } from '../lib/payments';

export default function DashboardScreen() {
  const [rows, setRows] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [loading, setLoading] = useState(true);

  const [popupClientId, setPopupClientId] = useState(null);
  const [popupClient, setPopupClient] = useState(null);
  const [popupCycles, setPopupCycles] = useState([]);
  const [loadingPopup, setLoadingPopup] = useState(false);
  const [savingId, setSavingId] = useState(null);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setLoading(true);
    const [unpaidRows, packagesRes] = await Promise.all([
      fetchUnpaidSummary(),
      supabase
        .from('packages')
        .select('id, total_sessions, used_sessions, client_id, clients(id, name)')
        .order('purchase_date', { ascending: false }),
    ]);
    setRows(unpaidRows);

    const latestByClient = {};
    (packagesRes.data || []).forEach(p => {
      if (!latestByClient[p.client_id]) latestByClient[p.client_id] = p;
    });
    setExpiring(
      Object.values(latestByClient).filter(p => (p.total_sessions - p.used_sessions) <= 2)
    );
    setLoading(false);
  }

  async function openPopup(row) {
    setPopupClient(row.client);
    setPopupClientId(row.client.id);
    setPopupCycles([]);
    setLoadingPopup(true);
    const all = await fetchClientCycles(row.client.id);
    const total = all.length;
    const withNum = all.map((c, i) => ({ ...c, cycleNum: total - i }));
    setPopupCycles(withNum.filter(c => c.payments?.[0]?.status === 'unpaid'));
    setLoadingPopup(false);
  }

  function closePopup() {
    setPopupClientId(null);
    setPopupClient(null);
    setPopupCycles([]);
    setSavingId(null);
  }

  async function handleMarkOne(paymentId) {
    setSavingId(paymentId);
    try {
      await markAsPaid([paymentId]);
      const updated = popupCycles.filter(c => c.payments?.[0]?.id !== paymentId);
      setPopupCycles(updated);
      if (updated.length === 0) {
        setRows(prev => prev.filter(r => r.client?.id !== popupClientId));
        closePopup();
      }
    } catch (_) {}
    setSavingId(null);
  }

  async function handleMarkAll() {
    const allIds = popupCycles.map(c => c.payments?.[0]?.id).filter(Boolean);
    if (!allIds.length) return;
    setSavingId('all');
    try {
      await markAsPaid(allIds);
      setRows(prev => prev.filter(r => r.client?.id !== popupClientId));
      closePopup();
    } catch (_) {}
    setSavingId(null);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#6C63FF" />;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.sectionTitle}>💰 חייבים תשלום</Text>
        {rows.length === 0
          ? <Text style={styles.allGood}>הכל מסודר ✓</Text>
          : rows.map(item => (
              <TouchableOpacity
                key={item.client.id}
                style={[styles.card, styles.cardRed]}
                onPress={() => openPopup(item)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName}>{item.client.name}</Text>
                  <Text style={styles.subText}>{item.paymentIds.length} כרטיסיות לתשלום</Text>
                </View>
                <View style={styles.debtChip}>
                  <Text style={styles.debtChipText}>יתרה לתשלום ›</Text>
                </View>
              </TouchableOpacity>
            ))
        }

        <Text style={[styles.sectionTitle, { marginTop: 20 }]}>🎟️ כרטיסיות על סף סיום</Text>
        {expiring.length === 0
          ? <Text style={styles.allGood}>אין כרטיסיות שמסתיימות ✓</Text>
          : expiring.map(item => {
              const left = item.total_sessions - item.used_sessions;
              return (
                <View key={item.id} style={[styles.card, styles.cardOrange]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.clientName}>{item.clients.name}</Text>
                    <Text style={styles.subText}>
                      {left === 0 ? 'הכרטיסיה נגמרה' : `נותרו ${left} כניסות`}
                    </Text>
                  </View>
                </View>
              );
            })
        }
      </ScrollView>

      {/* Debt detail popup — absolute overlay, stays inside phone frame */}
      {popupClientId && (
        <View style={styles.overlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={closePopup}
            activeOpacity={1}
          />
          <View style={styles.popup}>
            <Text style={styles.popupTitle}>{popupClient?.name}</Text>

            {loadingPopup ? (
              <ActivityIndicator color="#6C63FF" style={{ marginVertical: 24 }} />
            ) : (
              <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
                {popupCycles.map(cycle => {
                  const payment = cycle.payments?.[0];
                  const startStr = cycle.started_at
                    ? new Date(cycle.started_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' })
                    : '';
                  const endStr = cycle.completed_at
                    ? new Date(cycle.completed_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' })
                    : 'פעיל';
                  const isSaving = savingId === payment?.id;
                  return (
                    <View key={cycle.id} style={styles.popupRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.popupCycleTitle}>
                          כרטיסיה {cycle.cycleNum} · {cycle.sessions_used}/{cycle.sessions_max} שיעורים
                        </Text>
                        <Text style={styles.popupCycleRange}>{startStr} – {endStr}</Text>
                        <View style={styles.unpaidBadge}>
                          <Text style={styles.unpaidBadgeText}>יתרה לתשלום</Text>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.markBtn, (isSaving || savingId === 'all') && styles.markBtnDisabled]}
                        onPress={() => handleMarkOne(payment?.id)}
                        disabled={!!savingId}
                      >
                        {isSaving
                          ? <ActivityIndicator color="#fff" size="small" />
                          : <Text style={styles.markBtnText}>שולם</Text>
                        }
                      </TouchableOpacity>
                    </View>
                  );
                })}

                {popupCycles.length > 1 && (
                  <TouchableOpacity
                    style={[styles.markAllBtn, savingId === 'all' && styles.markBtnDisabled]}
                    onPress={handleMarkAll}
                    disabled={!!savingId}
                  >
                    {savingId === 'all'
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={styles.markAllBtnText}>סמן הכל כשולם</Text>
                    }
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.closeBtn} onPress={closePopup}>
              <Text style={styles.closeBtnText}>סגור</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0EEF8', padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#333', marginBottom: 10, textAlign: 'right' },
  allGood: { fontSize: 14, color: '#4CAF50', textAlign: 'right', marginBottom: 8 },
  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 14, marginBottom: 8,
    flexDirection: 'row', alignItems: 'center',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
    borderLeftWidth: 4,
  },
  cardRed: { borderLeftColor: '#F44336' },
  cardOrange: { borderLeftColor: '#FF9800' },
  clientName: { fontSize: 15, fontWeight: '600', color: '#222', textAlign: 'right' },
  subText: { fontSize: 13, color: '#888', marginTop: 2, textAlign: 'right' },
  debtChip: {
    backgroundColor: '#FFEBEE', borderRadius: 8,
    paddingHorizontal: 9, paddingVertical: 5, marginLeft: 8,
  },
  debtChipText: { fontSize: 12, color: '#E53935', fontWeight: '600' },

  // ── Popup ────────────────────────────────────────────────────
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 100, justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  popup: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, paddingBottom: 28,
  },
  popupTitle: {
    fontSize: 20, fontWeight: '700', color: '#222',
    textAlign: 'center', marginBottom: 16,
  },
  popupRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F9F9F9', borderRadius: 12,
    padding: 12, marginBottom: 8, gap: 10,
  },
  popupCycleTitle: { fontSize: 14, fontWeight: '600', color: '#333', textAlign: 'right' },
  popupCycleRange: { fontSize: 12, color: '#999', marginTop: 2, textAlign: 'right' },
  unpaidBadge: {
    alignSelf: 'flex-end',
    backgroundColor: '#FFEBEE', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2, marginTop: 4,
  },
  unpaidBadgeText: { fontSize: 10, color: '#E53935', fontWeight: '600' },
  markBtn: {
    backgroundColor: '#4CAF50', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
    minWidth: 64, alignItems: 'center',
  },
  markBtnDisabled: { opacity: 0.5 },
  markBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  markAllBtn: {
    backgroundColor: '#6C63FF', borderRadius: 12,
    padding: 14, alignItems: 'center', marginTop: 4, marginBottom: 4,
  },
  markAllBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  closeBtn: { padding: 12, alignItems: 'center', marginTop: 4 },
  closeBtnText: { fontSize: 15, color: '#999' },
});
