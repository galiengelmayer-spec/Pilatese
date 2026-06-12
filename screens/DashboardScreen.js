import React, { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { fetchUnpaidSummary, fetchAbsentThisWeek } from '../lib/payments';

export default function DashboardScreen() {
  const [absentCount, setAbsentCount] = useState(0);
  const [unpaidCount, setUnpaidCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    setLoading(true);
    const [unpaidRows, absent] = await Promise.all([
      fetchUnpaidSummary(),
      fetchAbsentThisWeek(),
    ]);
    setUnpaidCount(unpaidRows.length);
    setAbsentCount(absent);
    setLoading(false);
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#6C63FF" />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.pageTitle}>סיכום שבועי</Text>

      <View style={styles.statsRow}>
        {/* Absent this week */}
        <View style={[styles.statCard, styles.statCardBlue]}>
          <Text style={styles.statNumber}>{absentCount}</Text>
          <Text style={styles.statLabel}>נעדרו השבוע</Text>
        </View>

        {/* Unpaid — tappable to drill-down */}
        <TouchableOpacity
          style={[styles.statCard, unpaidCount > 0 ? styles.statCardRed : styles.statCardGreen]}
          onPress={() => navigation.navigate('DebtDrillDown')}
          activeOpacity={0.7}
        >
          <Text style={styles.statNumber}>{unpaidCount}</Text>
          <Text style={styles.statLabel}>חייבים תשלום</Text>
          {unpaidCount > 0 && <Text style={styles.tapHint}>לחצי לפרטים ›</Text>}
        </TouchableOpacity>
      </View>

      {unpaidCount === 0 && absentCount === 0 && (
        <Text style={styles.allGood}>הכל מסודר ✓</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0EEF8', padding: 16 },
  pageTitle: { fontSize: 18, fontWeight: '700', color: '#333', textAlign: 'right', marginBottom: 16 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  statCard: {
    flex: 1, borderRadius: 20, padding: 20, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 8, elevation: 3, minHeight: 120,
  },
  statCardBlue:  { backgroundColor: '#EDE7F6', borderWidth: 2, borderColor: '#6C63FF' },
  statCardRed:   { backgroundColor: '#FFEBEE', borderWidth: 2, borderColor: '#F44336' },
  statCardGreen: { backgroundColor: '#E8F5E9', borderWidth: 2, borderColor: '#4CAF50' },
  statNumber: { fontSize: 48, fontWeight: '900', color: '#333', lineHeight: 52 },
  statLabel: { fontSize: 13, color: '#666', marginTop: 4, textAlign: 'center' },
  tapHint: { fontSize: 11, color: '#F44336', marginTop: 6 },
  allGood: { fontSize: 16, color: '#4CAF50', textAlign: 'center', marginTop: 24, fontWeight: '600' },
});
