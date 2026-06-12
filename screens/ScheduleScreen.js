import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, TextInput
} from 'react-native';
import { supabase } from '../lib/supabase';

export default function ScheduleScreen() {
  const [classes, setClasses] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [newType, setNewType] = useState('מזרן');
  const [selectedClients, setSelectedClients] = useState([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    const [classesRes, clientsRes] = await Promise.all([
      supabase.from('classes')
        .select(`id, datetime, type, bookings (id, status, clients (name))`)
        .gte('datetime', new Date().toISOString())
        .order('datetime'),
      supabase.from('clients').select('id, name').order('name')
    ]);

    if (!classesRes.error) setClasses(classesRes.data);
    if (!clientsRes.error) setClients(clientsRes.data);
    setLoading(false);
  }

  async function addClass() {
    if (!newDate || !newTime) return Alert.alert('שגיאה', 'נדרש תאריך ושעה');
    const datetime = `${newDate}T${newTime}:00`;

    const { data, error } = await supabase
      .from('classes')
      .insert({ datetime, type: newType })
      .select().single();

    if (error) return Alert.alert('שגיאה', error.message);

    if (selectedClients.length > 0) {
      await supabase.from('bookings').insert(
        selectedClients.map(clientId => ({ class_id: data.id, client_id: clientId, status: 'booked' }))
      );
    }

    setModalVisible(false);
    setNewDate(''); setNewTime(''); setNewType('מזרן'); setSelectedClients([]);
    fetchData();
  }

  function toggleClient(id) {
    setSelectedClients(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  }

  function formatDateTime(dt) {
    const d = new Date(dt);
    return d.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'numeric' })
      + ' | ' + d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
  }

  function renderClass({ item }) {
    const attendees = item.bookings?.map(b => b.clients?.name).filter(Boolean);
    return (
      <View style={styles.card}>
        <Text style={styles.datetime}>{formatDateTime(item.datetime)}</Text>
        <Text style={styles.type}>{item.type}</Text>
        {attendees?.length > 0 && (
          <Text style={styles.attendees}>{attendees.join(', ')}</Text>
        )}
      </View>
    );
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#6C63FF" />;

  return (
    <View style={styles.container}>
      <FlatList
        data={classes}
        keyExtractor={item => item.id}
        renderItem={renderClass}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={<Text style={styles.empty}>אין שיעורים מתוכננים</Text>}
      />

      <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
        <Text style={styles.fabText}>+ שיעור חדש</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>שיעור חדש</Text>
            <TextInput style={styles.input} placeholder="תאריך (YYYY-MM-DD)"
              value={newDate} onChangeText={setNewDate} textAlign="right" />
            <TextInput style={styles.input} placeholder="שעה (HH:MM)"
              value={newTime} onChangeText={setNewTime} textAlign="right" />
            <TextInput style={styles.input} placeholder="סוג (מזרן / מכשירים)"
              value={newType} onChangeText={setNewType} textAlign="right" />

            <Text style={styles.sectionTitle}>בחרי לקוחות:</Text>
            {clients.map(c => (
              <TouchableOpacity key={c.id} style={styles.clientRow} onPress={() => toggleClient(c.id)}>
                <Text style={styles.clientName}>{c.name}</Text>
                <Text>{selectedClients.includes(c.id) ? '✓' : '○'}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.saveBtn} onPress={addClass}>
              <Text style={styles.saveBtnText}>שמור</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.cancelText}>ביטול</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F7FF', padding: 16 },
  card: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1
  },
  datetime: { fontSize: 15, fontWeight: '600', color: '#333', textAlign: 'right' },
  type: { fontSize: 13, color: '#6C63FF', textAlign: 'right', marginTop: 2 },
  attendees: { fontSize: 13, color: '#666', textAlign: 'right', marginTop: 4 },
  empty: { textAlign: 'center', color: '#999', marginTop: 60, fontSize: 16 },
  fab: {
    position: 'absolute', bottom: 24, right: 24,
    backgroundColor: '#6C63FF', borderRadius: 30,
    paddingHorizontal: 20, paddingVertical: 14,
    shadowColor: '#6C63FF', shadowOpacity: 0.4, shadowRadius: 8, elevation: 5
  },
  fabText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', alignItems: 'center' },
  modal: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, maxHeight: '85%', width: '100%', maxWidth: 390
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 16, color: '#333' },
  input: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10,
    padding: 12, marginBottom: 10, fontSize: 15
  },
  sectionTitle: { fontSize: 15, fontWeight: '600', textAlign: 'right', marginVertical: 8, color: '#333' },
  clientRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0'
  },
  clientName: { fontSize: 15, color: '#333' },
  saveBtn: { backgroundColor: '#6C63FF', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 12 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  cancelText: { textAlign: 'center', color: '#999', marginTop: 12, fontSize: 15 }
});
