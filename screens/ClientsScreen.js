import React, { useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, Modal, ScrollView, TouchableWithoutFeedback
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useStudioSchedule, getSlotsForDay } from '../lib/studioSchedule';

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

const EMPTY_FORM = {
  name: '', phone: '', paymentType: 'package',
  selectedDay: null, selectedTime: null, slots: [],
};

export default function ClientsScreen() {
  const { schedule } = useStudioSchedule();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  useEffect(() => { fetchClients(); }, []);

  async function fetchClients() {
    setLoading(true);
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, payment_type, client_slots(id, day_of_week, time_slot), packages(total_sessions, used_sessions)')
      .order('name');
    setClients(data || []);
    setLoading(false);
  }

  function openNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setModalVisible(true);
  }

  function openEdit(client) {
    setEditingId(client.id);
    setForm({
      name: client.name,
      phone: client.phone || '',
      paymentType: client.payment_type || 'package',
      selectedDay: null,
      selectedTime: null,
      slots: (client.client_slots || []).map(s => ({ day: s.day_of_week, time: s.time_slot })),
    });
    setModalVisible(true);
  }

  function set(key, value) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function addSlot() {
    if (form.selectedDay === null || !form.selectedTime) {
      Alert.alert('בחרי יום ושעה');
      return;
    }
    const exists = form.slots.find(s => s.day === form.selectedDay && s.time === form.selectedTime);
    if (!exists) {
      setForm(prev => ({
        ...prev,
        slots: [...prev.slots, { day: prev.selectedDay, time: prev.selectedTime }],
        selectedDay: null,
        selectedTime: null,
      }));
    } else {
      Alert.alert('משבצת זו כבר קיימת');
    }
  }

  function removeSlot(index) {
    setForm(prev => ({ ...prev, slots: prev.slots.filter((_, i) => i !== index) }));
  }

  async function saveClient() {
    if (!form.name.trim()) return Alert.alert('שגיאה', 'חובה להזין שם');

    if (editingId) {
      // Update
      await supabase.from('clients').update({
        name: form.name.trim(), phone: form.phone.trim(), payment_type: form.paymentType,
      }).eq('id', editingId);

      await supabase.from('client_slots').delete().eq('client_id', editingId);
      if (form.slots.length > 0) {
        await supabase.from('client_slots').insert(
          form.slots.map(s => ({ client_id: editingId, day_of_week: s.day, time_slot: s.time }))
        );
      }
    } else {
      // Insert
      const { data, error } = await supabase
        .from('clients')
        .insert({ name: form.name.trim(), phone: form.phone.trim(), payment_type: form.paymentType })
        .select().single();
      if (error) return Alert.alert('שגיאה', error.message);

      if (form.slots.length > 0) {
        await supabase.from('client_slots').insert(
          form.slots.map(s => ({ client_id: data.id, day_of_week: s.day, time_slot: s.time }))
        );
      }
    }

    setModalVisible(false);
    fetchClients();
  }

  function getSessionsLeft(client) {
    if (!client.packages?.length) return null;
    const last = client.packages[client.packages.length - 1];
    return last.total_sessions - last.used_sessions;
  }

  const filtered = clients.filter(c => c.name.toLowerCase().includes(search.toLowerCase()));

  function renderClient({ item }) {
    const left = getSessionsLeft(item);
    const low = left !== null && left <= 2;
    return (
      <TouchableOpacity style={styles.card} onPress={() => openEdit(item)}>
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
      <TouchableOpacity style={styles.fab} onPress={openNew}>
        <Text style={styles.fabText}>+ לקוח חדש</Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide" transparent>
        <TouchableWithoutFeedback onPress={() => setModalVisible(false)}>
          <View style={styles.overlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modal}>
                <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                  <Text style={styles.modalTitle}>{editingId ? 'עריכת לקוח' : 'לקוח חדש'}</Text>

                  <TextInput style={styles.input} placeholder="שם" value={form.name}
                    onChangeText={v => set('name', v)} textAlign="right" />
                  <TextInput style={styles.input} placeholder="טלפון" value={form.phone}
                    onChangeText={v => set('phone', v)} keyboardType="phone-pad" textAlign="right" />

                  <Text style={styles.sectionLabel}>סוג תשלום</Text>
                  <View style={styles.toggle}>
                    {['package', 'per_visit'].map(type => (
                      <TouchableOpacity
                        key={type}
                        style={[styles.toggleBtn, form.paymentType === type && styles.toggleBtnActive]}
                        onPress={() => set('paymentType', type)}
                      >
                        <Text style={[styles.toggleText, form.paymentType === type && styles.toggleTextActive]}>
                          {type === 'package' ? 'כרטיסיה' : 'לפי ביקור'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.sectionLabel}>משבצות שבועיות</Text>
                  {form.slots.length > 0 && (
                    <View style={styles.chipRow}>
                      {form.slots.map((s, i) => (
                        <TouchableOpacity key={i} style={styles.chip} onPress={() => removeSlot(i)}>
                          <Text style={styles.chipText}>{DAYS[s.day]} {s.time} ×</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  <Text style={styles.pickerLabel}>יום</Text>
                  <View style={styles.pillRow}>
                    {DAYS.map((d, i) => (
                      <TouchableOpacity key={i}
                        style={[styles.pill, form.selectedDay === i && styles.pillActive]}
                        onPress={() => set('selectedDay', form.selectedDay === i ? null : i)}
                      >
                        <Text style={[styles.pillText, form.selectedDay === i && styles.pillTextActive]}>{d}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {(() => {
                    const daySlots = form.selectedDay !== null
                      ? getSlotsForDay(schedule, form.selectedDay)
                      : [];
                    const morning = daySlots.filter(s => s.start_time < '12:00');
                    const evening = daySlots.filter(s => s.start_time >= '12:00');
                    return (
                      <>
                        {morning.length > 0 && (
                          <>
                            <Text style={styles.pickerLabel}>☀️ בוקר</Text>
                            <View style={styles.pillRow}>
                              {morning.map(s => (
                                <TouchableOpacity key={s.start_time}
                                  style={[styles.pill, form.selectedTime === s.start_time && styles.pillActive]}
                                  onPress={() => set('selectedTime', form.selectedTime === s.start_time ? null : s.start_time)}
                                >
                                  <Text style={[styles.pillText, form.selectedTime === s.start_time && styles.pillTextActive]}>{s.start_time}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </>
                        )}
                        {evening.length > 0 && (
                          <>
                            <Text style={styles.pickerLabel}>🌙 ערב</Text>
                            <View style={styles.pillRow}>
                              {evening.map(s => (
                                <TouchableOpacity key={s.start_time}
                                  style={[styles.pill, form.selectedTime === s.start_time && styles.pillActive]}
                                  onPress={() => set('selectedTime', form.selectedTime === s.start_time ? null : s.start_time)}
                                >
                                  <Text style={[styles.pillText, form.selectedTime === s.start_time && styles.pillTextActive]}>{s.start_time}</Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          </>
                        )}
                        {form.selectedDay !== null && daySlots.length === 0 && (
                          <Text style={{ color: '#aaa', fontSize: 13, textAlign: 'right', marginVertical: 6 }}>
                            אין שיעורים מוגדרים ליום זה
                          </Text>
                        )}
                        {form.selectedDay === null && (
                          <Text style={{ color: '#aaa', fontSize: 13, textAlign: 'right', marginVertical: 6 }}>
                            בחרי יום כדי לראות שעות זמינות
                          </Text>
                        )}
                      </>
                    );
                  })()}

                  <TouchableOpacity style={styles.addSlotBtn} onPress={addSlot}>
                    <Text style={styles.addSlotText}>+ הוסף משבצת</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.saveBtn} onPress={saveClient}>
                    <Text style={styles.saveBtnText}>שמור</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setModalVisible(false)}>
                    <Text style={styles.cancelText}>ביטול</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', alignItems: 'center' },
  modal: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, width: '100%', maxWidth: 390, maxHeight: '90%',
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 16, color: '#333' },
  input: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10,
    padding: 12, marginBottom: 10, fontSize: 15,
  },
  sectionLabel: { fontSize: 14, fontWeight: '600', color: '#555', marginBottom: 8, marginTop: 4, textAlign: 'right' },
  toggle: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  toggleBtn: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0', alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  toggleText: { fontSize: 14, color: '#666' },
  toggleTextActive: { color: '#fff', fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: { backgroundColor: '#EDE7F6', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  chipText: { fontSize: 13, color: '#6C63FF' },
  pickerLabel: { fontSize: 13, color: '#888', marginBottom: 6, marginTop: 10, textAlign: 'right' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: '#E0E0E0' },
  pillActive: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  pillText: { fontSize: 13, color: '#555' },
  pillTextActive: { color: '#fff', fontWeight: '600' },
  addSlotBtn: { borderWidth: 1.5, borderColor: '#6C63FF', borderRadius: 10, padding: 11, alignItems: 'center', marginTop: 14 },
  addSlotText: { color: '#6C63FF', fontWeight: '600', fontSize: 14 },
  saveBtn: { backgroundColor: '#6C63FF', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 12 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  cancelText: { textAlign: 'center', color: '#999', marginTop: 12, fontSize: 15, paddingBottom: 8 },
});
