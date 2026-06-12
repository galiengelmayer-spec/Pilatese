import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { fetchUnpaidSummary, markAsPaid } from '../lib/payments';

export default function DashboardScreen() {
  const [rows, setRows] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingClientId, setSavingClientId] = useState(null);

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

  async function handleMarkPaid(clientId, paymentIds) {
    setSavingClientId(clientId);
    try {
      await markAsPaid(paymentIds);
      setRows(prev => prev.filter(r => r.client?.id !== clientId));
    } catch (_) {}
    setSavingClientId(null);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#6C63FF" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.sectionTitle}>💰 חייבים תשלום</Text>
      {rows.length === 0
        ? <Text style={styles.allGood}>הכל מסודר ✓</Text>
        : rows.map(item => {
            const isSaving = savingClientId === item.client?.id;
            return (
              <View key={item.client.id} style={[styles.card, styles.cardRed]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName}>{item.client.name}</Text>
                  <Text style={styles.subText}>{item.paymentIds.length} כרטיסיות לתשלום</Text>
                </View>
                <TouchableOpacity
                  style={[styles.markBtn, isSaving && styles.markBtnDisabled]}
                  onPress={() => handleMarkPaid(item.client.id, item.paymentIds)}
                  disabled={!!savingClientId}
                >
                  {isSaving
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.markBtnText}>סמן כשולם</Text>
                  }
                </TouchableOpacity>
              </View>
            );
          })
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
  markBtn: {
    backgroundColor: '#4CAF50', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 9,
    minWidth: 80, alignItems: 'center',
  },
  markBtnDisabled: { opacity: 0.5 },
  markBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
