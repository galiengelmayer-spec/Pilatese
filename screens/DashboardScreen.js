import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { supabase } from '../lib/supabase';

export default function DashboardScreen() {
  const [unpaid, setUnpaid] = useState([]);
  const [expiring, setExpiring] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);

    const [unpaidRes, packagesRes] = await Promise.all([
      supabase
        .from('attendance')
        .select('client_id, clients(id, name, phone), lesson_date, time_slot')
        .eq('paid', false)
        .eq('status', 'present')
        .order('lesson_date', { ascending: false }),
      supabase
        .from('packages')
        .select('id, total_sessions, used_sessions, client_id, clients(id, name, phone)')
        .order('purchase_date', { ascending: false }),
    ]);

    // Group unpaid by client
    const unpaidMap = {};
    (unpaidRes.data || []).forEach(a => {
      if (!unpaidMap[a.client_id]) {
        unpaidMap[a.client_id] = { client: a.clients, count: 0 };
      }
      unpaidMap[a.client_id].count++;
    });
    setUnpaid(Object.values(unpaidMap));

    // Latest package per client with <= 2 sessions left
    const latestByClient = {};
    (packagesRes.data || []).forEach(p => {
      if (!latestByClient[p.client_id]) latestByClient[p.client_id] = p;
    });
    const expiring = Object.values(latestByClient).filter(
      p => (p.total_sessions - p.used_sessions) <= 2
    );
    setExpiring(expiring);

    setLoading(false);
  }

  function sendReminder(client) {
    Alert.alert(
      'שליחת תזכורת',
      `לשלוח תזכורת תשלום ל${client.name}?`,
      [
        { text: 'ביטול', style: 'cancel' },
        { text: 'שלח/י WhatsApp', onPress: () => Alert.alert('בקרוב', 'אינטגרציית WhatsApp תהיה זמינה בגרסה הבאה') },
      ]
    );
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#6C63FF" />;

  return (
    <View style={styles.container}>
      {/* Unpaid section */}
      <Text style={styles.sectionTitle}>💰 חייבים תשלום</Text>
      {unpaid.length === 0
        ? <Text style={styles.allGood}>הכל מסודר ✓</Text>
        : unpaid.map(item => (
            <View key={item.client.id} style={[styles.card, styles.cardRed]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.clientName}>{item.client.name}</Text>
                <Text style={styles.subText}>{item.count} כניסות לא שולמו</Text>
              </View>
              <TouchableOpacity style={styles.reminderBtn} onPress={() => sendReminder(item.client)}>
                <Text style={styles.reminderText}>תזכורת</Text>
              </TouchableOpacity>
            </View>
          ))
      }

      {/* Expiring packages */}
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
                <TouchableOpacity style={[styles.reminderBtn, styles.reminderBtnOrange]} onPress={() => sendReminder(item.clients)}>
                  <Text style={styles.reminderText}>תזכורת</Text>
                </TouchableOpacity>
              </View>
            );
          })
      }
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
  reminderBtn: {
    backgroundColor: '#F44336', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7, marginLeft: 10,
  },
  reminderBtnOrange: { backgroundColor: '#FF9800' },
  reminderText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
