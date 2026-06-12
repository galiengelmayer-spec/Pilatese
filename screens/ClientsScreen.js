import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

export default function ClientsScreen() {
  const navigation = useNavigation();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Refresh the list every time the screen comes into focus (including after
  // returning from ClientDetailScreen).
  useFocusEffect(
    useCallback(() => { fetchClients(); }, [])
  );

  async function fetchClients() {
    setLoading(true);
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, payment_type, client_slots(id, day_of_week, time_slot), packages(total_sessions, used_sessions)')
      .order('name');
    setClients(data || []);
    setLoading(false);
  }

  function getSessionsLeft(client) {
    if (!client.packages?.length) return null;
    const last = client.packages[client.packages.length - 1];
    return last.total_sessions - last.used_sessions;
  }

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  function renderClient({ item }) {
    const left = getSessionsLeft(item);
    const low = left !== null && left <= 2;
    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => navigation.navigate('ClientDetail', { clientId: item.id })}
      >
        <View style={styles.cardTop}>
          <Text style={styles.clientName}>{item.name}</Text>
          {item.payment_type === 'package' && left !== null && (
            <View style={[styles.badge, low && styles.badgeLow]}>
              <Text style={styles.badgeText}>{left} כניסות</Text>
            </View>
          )}
          {item.payment_type === 'per_visit' && (
            <View style={styles.badgePerVisit}>
              <Text style={styles.badgeText}>לפי ביקור</Text>
            </View>
          )}
        </View>
        {item.phone ? <Text style={styles.phone}>{item.phone}</Text> : null}
        {item.client_slots?.length > 0 && (
          <Text style={styles.slots}>
            {item.client_slots.map(s => `${DAYS[s.day_of_week]} ${s.time_slot}`).join('  ·  ')}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#6C63FF" />;

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search} placeholder="חיפוש לקוח..."
        value={search} onChangeText={setSearch} textAlign="right"
      />
      <FlatList
        data={filtered} keyExtractor={item => item.id}
        renderItem={renderClient} contentContainerStyle={{ paddingBottom: 100 }}
      />
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('ClientDetail')}
      >
        <Text style={styles.fabText}>+ לקוח חדש</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0EEF8', padding: 12 },
  search: {
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 10,
    fontSize: 15, borderWidth: 1, borderColor: '#E0E0E0',
  },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  clientName: { fontSize: 16, fontWeight: '600', color: '#222', flex: 1 },
  phone: { fontSize: 13, color: '#888', marginTop: 2, textAlign: 'right' },
  slots: { fontSize: 12, color: '#6C63FF', marginTop: 4, textAlign: 'right' },
  badge: { backgroundColor: '#E8F5E9', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  badgeLow: { backgroundColor: '#FFEBEE' },
  badgePerVisit: { backgroundColor: '#EDE7F6', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#333' },
  fab: {
    position: 'absolute', bottom: 24, right: 24, backgroundColor: '#6C63FF',
    borderRadius: 30, paddingHorizontal: 20, paddingVertical: 14,
    shadowColor: '#6C63FF', shadowOpacity: 0.4, shadowRadius: 8, elevation: 5,
  },
  fabText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
