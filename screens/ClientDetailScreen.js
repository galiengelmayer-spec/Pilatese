import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useStudioSchedule, getSlotsForDay } from '../lib/studioSchedule';
import SlidePanel from '../components/SlidePanel';

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

function getUpcomingDates(dayOfWeek, count = 5) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(today);
  d.setDate(d.getDate() + ((dayOfWeek - d.getDay() + 7) % 7));
  const dates = [];
  for (let i = 0; i < count; i++) {
    dates.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return dates;
}

const EMPTY_FORM = {
  name: '', phone: '', paymentType: 'package',
  selectedDay: null, selectedTime: null, slots: [],
};

export default function ClientDetailScreen() {
  const { params } = useRoute();
  const navigation = useNavigation();
  const clientId = params?.clientId ?? null;

  const { schedule } = useStudioSchedule();
  const [form, setFormState] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(!!clientId);
  const [saving, setSaving] = useState(false);
  const [absenceSlotIdx, setAbsenceSlotIdx] = useState(null);
  const [absenceDate, setAbsenceDate] = useState(null);
  const [savingAbsence, setSavingAbsence] = useState(false);

  useEffect(() => {
    if (clientId) loadClient();
  }, []);

  async function loadClient() {
    const { data } = await supabase
      .from('clients')
      .select('id, name, phone, payment_type, client_slots(id, day_of_week, time_slot)')
      .eq('id', clientId)
      .single();
    if (data) {
      setFormState({
        name: data.name,
        phone: data.phone || '',
        paymentType: data.payment_type || 'package',
        selectedDay: null,
        selectedTime: null,
        slots: (data.client_slots || []).map(s => ({ day: s.day_of_week, time: s.time_slot })),
      });
    }
    setLoading(false);
  }

  function set(key, value) {
    setFormState(prev => ({ ...prev, [key]: value }));
  }

  function addSlot() {
    if (form.selectedDay === null || !form.selectedTime) {
      Alert.alert('בחרי יום ושעה');
      return;
    }
    const exists = form.slots.find(s => s.day === form.selectedDay && s.time === form.selectedTime);
    if (!exists) {
      setFormState(prev => ({
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
    setFormState(prev => ({ ...prev, slots: prev.slots.filter((_, i) => i !== index) }));
  }

  async function saveClient() {
    if (!form.name.trim()) return Alert.alert('שגיאה', 'חובה להזין שם');
    setSaving(true);
    try {
      if (clientId) {
        await supabase.from('clients').update({
          name: form.name.trim(), phone: form.phone.trim(), payment_type: form.paymentType,
        }).eq('id', clientId);
        await supabase.from('client_slots').delete().eq('client_id', clientId);
        if (form.slots.length > 0) {
          await supabase.from('client_slots').insert(
            form.slots.map(s => ({ client_id: clientId, day_of_week: s.day, time_slot: s.time }))
          );
        }
      } else {
        const { data, error } = await supabase
          .from('clients')
          .insert({ name: form.name.trim(), phone: form.phone.trim(), payment_type: form.paymentType })
          .select().single();
        if (error) throw error;
        if (form.slots.length > 0) {
          await supabase.from('client_slots').insert(
            form.slots.map(s => ({ client_id: data.id, day_of_week: s.day, time_slot: s.time }))
          );
        }
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('שגיאה', e.message || 'לא ניתן לשמור');
    } finally {
      setSaving(false);
    }
  }

  async function saveAbsence() {
    const absenceSlot = absenceSlotIdx !== null ? form.slots[absenceSlotIdx] : null;
    if (!absenceSlot || !absenceDate) {
      Alert.alert('בחרי שיעור ותאריך');
      return;
    }
    setSavingAbsence(true);
    try {
      const { error: attErr } = await supabase.from('attendance').insert({
        lesson_date: absenceDate, time_slot: absenceSlot.time,
        client_id: clientId, status: 'planned_absent', paid: false,
      });
      if (attErr && attErr.code !== '23505') throw attErr;

      const { error: subErr } = await supabase.from('substitutions').insert({
        lesson_date: absenceDate, time_slot: absenceSlot.time,
        absent_client_id: clientId, substitute_client_id: null,
      });
      if (subErr && subErr.code !== '23505') throw subErr;

      Alert.alert('בוצע', 'ההיעדרות נרשמה');
      setAbsenceSlotIdx(null);
      setAbsenceDate(null);
    } catch (e) {
      Alert.alert('שגיאה', e.message || 'לא ניתן לשמור');
    } finally {
      setSavingAbsence(false);
    }
  }

  const title = clientId ? 'עריכת לקוח' : 'לקוח חדש';

  if (loading) {
    return (
      <SlidePanel title={title}>
        <ActivityIndicator color="#6C63FF" style={{ marginTop: 40 }} />
      </SlidePanel>
    );
  }

  const daySlots = form.selectedDay !== null ? getSlotsForDay(schedule, form.selectedDay) : [];
  const morning = daySlots.filter(s => s.start_time < '12:00');
  const evening = daySlots.filter(s => s.start_time >= '12:00');

  return (
    <SlidePanel title={title}>
      <TextInput
        style={styles.input} placeholder="שם" value={form.name}
        onChangeText={v => set('name', v)} textAlign="right"
      />
      <TextInput
        style={styles.input} placeholder="טלפון" value={form.phone}
        onChangeText={v => set('phone', v)} keyboardType="phone-pad" textAlign="right"
      />

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

      {morning.length > 0 && (
        <>
          <Text style={styles.pickerLabel}>☀️ בוקר</Text>
          <View style={styles.pillRow}>
            {morning.map(s => (
              <TouchableOpacity key={s.start_time}
                style={[styles.pill, form.selectedTime === s.start_time && styles.pillActive]}
                onPress={() => set('selectedTime', form.selectedTime === s.start_time ? null : s.start_time)}
              >
                <Text style={[styles.pillText, form.selectedTime === s.start_time && styles.pillTextActive]}>
                  {s.start_time}
                </Text>
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
                <Text style={[styles.pillText, form.selectedTime === s.start_time && styles.pillTextActive]}>
                  {s.start_time}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}
      {form.selectedDay !== null && daySlots.length === 0 && (
        <Text style={styles.pickerHint}>אין שיעורים מוגדרים ליום זה</Text>
      )}
      {form.selectedDay === null && (
        <Text style={styles.pickerHint}>בחרי יום כדי לראות שעות זמינות</Text>
      )}

      <TouchableOpacity style={styles.addSlotBtn} onPress={addSlot}>
        <Text style={styles.addSlotText}>+ הוסף משבצת</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
        onPress={saveClient}
        disabled={saving}
      >
        {saving
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.saveBtnText}>שמור</Text>
        }
      </TouchableOpacity>

      {clientId && (
        <>
          <View style={styles.sectionDivider} />
          <Text style={styles.sectionLabel}>היעדרות מתוכננת</Text>
          {form.slots.length === 0 ? (
            <Text style={styles.pickerHint}>הוסיפי משבצות ושמרי כדי לרשום היעדרות</Text>
          ) : (
            <>
              <Text style={styles.pickerLabel}>שיעור</Text>
              <View style={styles.pillRow}>
                {form.slots.map((s, i) => (
                  <TouchableOpacity key={i}
                    style={[styles.pill, absenceSlotIdx === i && styles.pillActive]}
                    onPress={() => {
                      setAbsenceSlotIdx(absenceSlotIdx === i ? null : i);
                      setAbsenceDate(null);
                    }}
                  >
                    <Text style={[styles.pillText, absenceSlotIdx === i && styles.pillTextActive]}>
                      {DAYS[s.day]} {s.time}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {absenceSlotIdx !== null && (
                <>
                  <Text style={styles.pickerLabel}>תאריך</Text>
                  <View style={styles.pillRow}>
                    {getUpcomingDates(form.slots[absenceSlotIdx].day).map(d => {
                      const ds = d.toISOString().split('T')[0];
                      const label = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
                      return (
                        <TouchableOpacity key={ds}
                          style={[styles.pill, absenceDate === ds && styles.pillActive]}
                          onPress={() => setAbsenceDate(absenceDate === ds ? null : ds)}
                        >
                          <Text style={[styles.pillText, absenceDate === ds && styles.pillTextActive]}>
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              <TouchableOpacity
                style={[styles.absenceBtn, (absenceSlotIdx === null || !absenceDate || savingAbsence) && styles.saveBtnDisabled]}
                onPress={saveAbsence}
                disabled={absenceSlotIdx === null || !absenceDate || savingAbsence}
              >
                {savingAbsence
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>רשום היעדרות</Text>
                }
              </TouchableOpacity>
            </>
          )}
        </>
      )}
    </SlidePanel>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10,
    padding: 12, marginBottom: 10, fontSize: 15, backgroundColor: '#fff',
  },
  sectionLabel: {
    fontSize: 14, fontWeight: '600', color: '#555',
    marginBottom: 8, marginTop: 4, textAlign: 'right',
  },
  toggle: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  toggleBtn: {
    flex: 1, padding: 10, borderRadius: 10,
    borderWidth: 1, borderColor: '#E0E0E0', alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  toggleText: { fontSize: 14, color: '#666' },
  toggleTextActive: { color: '#fff', fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  chip: { backgroundColor: '#EDE7F6', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  chipText: { fontSize: 13, color: '#6C63FF' },
  pickerLabel: { fontSize: 13, color: '#888', marginBottom: 6, marginTop: 10, textAlign: 'right' },
  pickerHint: { color: '#aaa', fontSize: 13, textAlign: 'right', marginVertical: 6 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  pill: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
    backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: '#E0E0E0',
  },
  pillActive: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  pillText: { fontSize: 13, color: '#555' },
  pillTextActive: { color: '#fff', fontWeight: '600' },
  addSlotBtn: {
    borderWidth: 1.5, borderColor: '#6C63FF', borderRadius: 10,
    padding: 11, alignItems: 'center', marginTop: 14,
  },
  addSlotText: { color: '#6C63FF', fontWeight: '600', fontSize: 14 },
  saveBtn: {
    backgroundColor: '#6C63FF', borderRadius: 12,
    padding: 15, alignItems: 'center', marginTop: 16,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  sectionDivider: { height: 1, backgroundColor: '#E8E4F8', marginVertical: 20 },
  absenceBtn: {
    backgroundColor: '#FF9800', borderRadius: 12,
    padding: 13, alignItems: 'center', marginTop: 12,
  },
});
