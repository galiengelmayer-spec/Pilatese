import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { fetchUnpaidSummary, fetchClientCycles, markAsPaid } from '../lib/payments';
import SlidePanel from '../components/SlidePanel';

export default function DebtDrillDownScreen() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedClientId, setExpandedClientId] = useState(null);
  const [cycleDetails, setCycleDetails] = useState({}); // clientId → [{cycle, lessons[]}]
  const [loadingDetail, setLoadingDetail] = useState(null); // clientId
  const [savingId, setSavingId] = useState(null); // paymentId or clientId

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const data = await fetchUnpaidSummary();
    setRows(data);
    setLoading(false);
  }

  async function toggleExpand(item) {
    const cid = item.client.id;
    if (expandedClientId === cid) { setExpandedClientId(null); return; }
    setExpandedClientId(cid);
    if (cycleDetails[cid]) return;
    setLoadingDetail(cid);
    try {
      const cycles = await fetchClientCycles(cid);
      const unpaidCycles = cycles.filter(c => c.payments?.[0]?.status === 'unpaid');
      const today = new Date().toISOString().split('T')[0];
      const detailed = await Promise.all(unpaidCycles.map(async cycle => {
        const startDate = cycle.started_at || '2000-01-01';
        const endDate = cycle.completed_at || today;
        const { data } = await supabase
          .from('attendance')
          .select('lesson_date, time_slot, status')
          .eq('client_id', cid)
          .in('status', ['present', 'replaced_out'])
          .gte('lesson_date', startDate)
          .lte('lesson_date', endDate)
          .order('lesson_date', { ascending: false });
        return { ...cycle, lessons: data || [] };
      }));
      setCycleDetails(prev => ({ ...prev, [cid]: detailed }));
    } catch (_) {}
    setLoadingDetail(null);
  }

  async function handleMarkCyclePaid(paymentId, clientId) {
    setSavingId(paymentId);
    try {
      await markAsPaid([paymentId]);
      // Remove cycle from detail
      setCycleDetails(prev => ({
        ...prev,
        [clientId]: (prev[clientId] || []).filter(c => c.payments?.[0]?.id !== paymentId),
      }));
      // Check if client has remaining unpaid cycles — if not, remove from list
      const remaining = (cycleDetails[clientId] || []).filter(c => c.payments?.[0]?.id !== paymentId);
      if (remaining.length === 0) {
        setRows(prev => prev.filter(r => r.client.id !== clientId));
        setExpandedClientId(null);
      }
    } catch (_) {}
    setSavingId(null);
  }

  async function handleMarkAllPaid(clientId, paymentIds) {
    setSavingId(`all-${clientId}`);
    try {
      await markAsPaid(paymentIds);
      setRows(prev => prev.filter(r => r.client.id !== clientId));
      if (expandedClientId === clientId) setExpandedClientId(null);
    } catch (_) {}
    setSavingId(null);
  }

  return (
    <View style={{ flex: 1 }}>
      <SlidePanel title="חובות לתשלום">
        {loading ? (
          <ActivityIndicator color="#6C63FF" style={{ marginTop: 40 }} />
        ) : rows.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>✓</Text>
            <Text style={styles.emptyText}>הכל מסודר</Text>
          </View>
        ) : (
          rows.map(item => {
            const cid = item.client.id;
            const isExpanded = expandedClientId === cid;
            const details = cycleDetails[cid] || [];
            const isLoadingDetail = loadingDetail === cid;
            const isSavingAll = savingId === `all-${cid}`;

            return (
              <View key={cid} style={styles.clientCard}>
                {/* Client header */}
                <TouchableOpacity style={styles.clientHeader} onPress={() => toggleExpand(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.clientName}>{item.client.name}</Text>
                    <Text style={styles.clientSub}>
                      {item.sessionsTotal > 0 ? `${item.sessionsTotal} שיעורים לתשלום` : `${item.paymentIds.length} מחזור לתשלום`}
                    </Text>
                  </View>
                  <View style={styles.headerRight}>
                    <TouchableOpacity
                      style={[styles.payAllBtn, isSavingAll && styles.btnDisabled]}
                      onPress={() => handleMarkAllPaid(cid, item.paymentIds)}
                      disabled={!!savingId}
                    >
                      {isSavingAll
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={styles.payAllBtnText}>סמן הכל כשולם</Text>
                      }
                    </TouchableOpacity>
                    <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
                  </View>
                </TouchableOpacity>

                {/* Expanded detail */}
                {isExpanded && (
                  <View style={styles.detailPanel}>
                    {isLoadingDetail ? (
                      <ActivityIndicator color="#6C63FF" size="small" style={{ marginVertical: 12 }} />
                    ) : details.length === 0 ? (
                      <Text style={styles.noDetailText}>אין נתונים</Text>
                    ) : (
                      details.map((cycle, ci) => {
                        const payment = cycle.payments?.[0];
                        const cycleNum = ci + 1;
                        const startStr = cycle.started_at
                          ? new Date(cycle.started_at + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' })
                          : '';
                        const endStr = cycle.completed_at
                          ? new Date(cycle.completed_at + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' })
                          : 'פעיל';
                        const isSavingCycle = savingId === payment?.id;

                        return (
                          <View key={cycle.id} style={styles.cycleSection}>
                            <View style={styles.cycleSectionHeader}>
                              <Text style={styles.cycleSectionTitle}>
                                מחזור {cycleNum} · {cycle.sessions_used}/{cycle.sessions_max}
                              </Text>
                              <Text style={styles.cycleSectionDates}>{startStr} – {endStr}</Text>
                            </View>

                            {/* Lesson dates */}
                            {cycle.lessons.map((l, li) => (
                              <View key={`${l.lesson_date}_${li}`} style={styles.lessonItem}>
                                <Text style={styles.lessonNum}>שיעור {cycle.lessons.length - li}</Text>
                                <Text style={styles.lessonDate}>
                                  {new Date(l.lesson_date + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' })}
                                </Text>
                                <Text style={styles.unpaidMark}>○ לא שולם</Text>
                              </View>
                            ))}

                            {/* Mark cycle as paid */}
                            {payment && (
                              <TouchableOpacity
                                style={[styles.payCycleBtn, isSavingCycle && styles.btnDisabled]}
                                onPress={() => handleMarkCyclePaid(payment.id, cid)}
                                disabled={!!savingId}
                              >
                                {isSavingCycle
                                  ? <ActivityIndicator color="#fff" size="small" />
                                  : <Text style={styles.payCycleBtnText}>סמן מחזור זה כשולם</Text>
                                }
                              </TouchableOpacity>
                            )}
                          </View>
                        );
                      })
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </SlidePanel>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, color: '#4CAF50', marginBottom: 12 },
  emptyText: { fontSize: 18, color: '#4CAF50', fontWeight: '600' },

  clientCard: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
    overflow: 'hidden', borderLeftWidth: 4, borderLeftColor: '#F44336',
  },
  clientHeader: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 8 },
  clientName: { fontSize: 16, fontWeight: '700', color: '#222', textAlign: 'right' },
  clientSub: { fontSize: 13, color: '#E53935', marginTop: 2, textAlign: 'right' },
  headerRight: { alignItems: 'flex-end', gap: 6 },
  payAllBtn: {
    backgroundColor: '#4CAF50', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, minWidth: 90, alignItems: 'center',
  },
  payAllBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  chevron: { fontSize: 11, color: '#BDBDBD' },
  btnDisabled: { opacity: 0.5 },

  detailPanel: {
    borderTopWidth: 1, borderTopColor: '#F5F5F5',
    backgroundColor: '#FAFAFA', padding: 14,
  },
  cycleSection: { marginBottom: 12 },
  cycleSectionHeader: { marginBottom: 8 },
  cycleSectionTitle: { fontSize: 13, fontWeight: '700', color: '#333', textAlign: 'right' },
  cycleSectionDates: { fontSize: 11, color: '#999', textAlign: 'right', marginTop: 1 },

  lessonItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
  },
  lessonNum: { width: 55, fontSize: 12, color: '#999', textAlign: 'right' },
  lessonDate: { flex: 1, fontSize: 13, color: '#444', textAlign: 'right' },
  unpaidMark: { fontSize: 12, color: '#E53935', fontWeight: '600' },

  payCycleBtn: {
    backgroundColor: '#4CAF50', borderRadius: 8, padding: 9,
    alignItems: 'center', marginTop: 10,
  },
  payCycleBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  noDetailText: { color: '#aaa', fontSize: 13, textAlign: 'center', padding: 12 },
});
