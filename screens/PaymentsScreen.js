import React, { useCallback, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchUnpaidSummary, markAsPaid } from '../lib/payments';

export default function PaymentsScreen() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  useFocusEffect(useCallback(() => {
    load();
  }, []));

  async function load() {
    setLoading(true);
    try {
      const data = await fetchUnpaidSummary();
      setRows(data);
    } catch (_) {}
    setLoading(false);
  }

  async function handleMarkPaid(clientId, paymentIds) {
    setSavingId(clientId);
    try {
      await markAsPaid(paymentIds);
      setRows(prev => prev.filter(r => r.client?.id !== clientId));
    } catch (_) {}
    setSavingId(null);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#6C63FF" />;

  if (rows.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>✓</Text>
        <Text style={styles.emptyTitle}>הכל מסודר</Text>
        <Text style={styles.emptyHint}>אין יתרות פתוחות</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F0EEF8' }}>
      <FlatList
        data={rows}
        keyExtractor={item => item.client?.id || Math.random().toString()}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        renderItem={({ item }) => {
          const { client, paymentIds } = item;
          const cid = client?.id;
          const isMarking = savingId === cid;
          return (
            <View style={styles.card}>
              <View style={styles.cardBody}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.clientName}>{client?.name}</Text>
                  <View style={styles.badgeRow}>
                    <View style={styles.debtBadge}>
                      <Text style={styles.debtBadgeText}>יתרה לתשלום</Text>
                    </View>
                    <Text style={styles.cycleCount}>
                      {paymentIds.length} כרטיסיות
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={[styles.payBtn, isMarking && styles.payBtnDisabled]}
                  onPress={() => handleMarkPaid(cid, paymentIds)}
                  disabled={isMarking}
                >
                  {isMarking
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.payBtnText}>שולם</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  emptyContainer: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  emptyIcon: { fontSize: 48, color: '#4CAF50' },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#333' },
  emptyHint: { fontSize: 14, color: '#999' },

  card: {
    backgroundColor: '#fff', borderRadius: 16, marginBottom: 8,
    borderLeftWidth: 4, borderLeftColor: '#E53935',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
    overflow: 'hidden',
  },
  cardBody: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 12,
  },
  clientName: {
    fontSize: 16, fontWeight: '600', color: '#333', textAlign: 'right', marginBottom: 4,
  },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'flex-end' },
  debtBadge: {
    backgroundColor: '#FFEBEE', borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  debtBadgeText: { fontSize: 11, color: '#E53935', fontWeight: '600' },
  cycleCount: { fontSize: 12, color: '#999' },

  payBtn: {
    backgroundColor: '#4CAF50', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    minWidth: 72, alignItems: 'center',
  },
  payBtnDisabled: { opacity: 0.6 },
  payBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
