import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert
} from 'react-native';
import { supabase } from '../lib/supabase';

function AttendanceRow({ booking, onToggle }) {
  const { status, clients } = booking;
  const attended = status === 'attended';
  const missed = status === 'missed';

  return (
    <TouchableOpacity style={styles.clientRow} onPress={() => onToggle(booking)}>
      <View style={[
        styles.indicator,
        attended && styles.indicatorGreen,
        missed && styles.indicatorRed,
      ]} />
      <Text style={styles.clientName}>{clients?.name}</Text>
      <Text style={styles.statusText}>
        {attended ? '✓ הגיע/ה' : missed ? '✗ לא הגיע/ה' : '–'}
      </Text>
    </TouchableOpacity>
  );
}

function ClassCard({ item, onToggle }) {
  const d = new Date(item.datetime);
  const isHistory = d < new Date();
  const dateStr = d.toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  const bookings = item.bookings || [];

  return (
    <View style={[styles.card, isHistory && styles.cardHistory]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTime}>{timeStr}</Text>
        <Text style={styles.cardDate}>{dateStr}</Text>
      </View>
      <Text style={styles.cardType}>{item.type}</Text>

      {bookings.length === 0
        ? <Text style={styles.noClients}>אין לקוחות רשומים</Text>
        : bookings.map(b => (
            <AttendanceRow key={b.id} booking={b} onToggle={onToggle} />
          ))
      }
    </View>
  );
}

export default function TodayScreen() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);
  const currentIndexRef = useRef(0);

  useEffect(() => { fetchClasses(); }, []);

  async function fetchClasses() {
    setLoading(true);
    const { data, error } = await supabase
      .from('classes')
      .select(`id, datetime, type, bookings (id, status, clients (id, name))`)
      .order('datetime', { ascending: true });

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      const list = data || [];
      setClasses(list);
      const now = new Date();
      const idx = list.findIndex(c => new Date(c.datetime) >= now);
      currentIndexRef.current = idx >= 0 ? idx : list.length - 1;
    }
    setLoading(false);
  }

  async function toggleAttendance(booking) {
    const next =
      booking.status === 'booked' ? 'attended' :
      booking.status === 'attended' ? 'missed' : 'booked';

    await supabase.from('bookings').update({ status: next }).eq('id', booking.id);
    setClasses(prev => prev.map(cls => ({
      ...cls,
      bookings: cls.bookings.map(b => b.id === booking.id ? { ...b, status: next } : b)
    })));
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#6C63FF" />;

  if (classes.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>אין שיעורים עדיין</Text>
        <Text style={styles.emptyHint}>הוסיפי שיעורים מלשונית לוח שנה</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={classes}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <ClassCard item={item} onToggle={toggleAttendance} />
        )}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        onLayout={() => {
          if (listRef.current && currentIndexRef.current > 0) {
            listRef.current.scrollToIndex({
              index: currentIndexRef.current,
              animated: false,
              viewPosition: 0.1,
            });
          }
        }}
        onScrollToIndexFailed={info => {
          setTimeout(() => {
            listRef.current?.scrollToIndex({ index: info.index, animated: false });
          }, 300);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0EEF8' },

  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
    borderLeftWidth: 4,
    borderLeftColor: '#6C63FF',
  },
  cardHistory: {
    opacity: 0.55,
    borderLeftColor: '#BDBDBD',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  cardTime: { fontSize: 22, fontWeight: '800', color: '#6C63FF' },
  cardDate: { fontSize: 14, fontWeight: '600', color: '#333' },
  cardType: { fontSize: 12, color: '#999', marginBottom: 10, textAlign: 'right' },

  clientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    gap: 10,
  },
  indicator: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#BDBDBD',
    flexShrink: 0,
  },
  indicatorGreen: { backgroundColor: '#4CAF50' },
  indicatorRed: { backgroundColor: '#F44336' },
  clientName: { flex: 1, fontSize: 15, color: '#222', textAlign: 'right' },
  statusText: { fontSize: 12, color: '#888', minWidth: 70, textAlign: 'left' },

  noClients: { fontSize: 13, color: '#bbb', textAlign: 'center', paddingVertical: 8 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#555' },
  emptyHint: { fontSize: 14, color: '#999', marginTop: 6 },
});
