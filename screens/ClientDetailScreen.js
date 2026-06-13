import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { useStudioSchedule, getSlotsForDay } from '../lib/studioSchedule';
import { useClientPayments } from '../lib/payments';
import SlidePanel from '../components/SlidePanel';

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

function getAbsenceDates(slots, weeks = 6) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const seen = new Set();
  const result = [];
  for (const slot of slots) {
    const d = new Date(today);
    const diff = (slot.day - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff); // advance to nearest occurrence of slot.day
    for (let i = 0; i < weeks; i++) {
      const ds = d.toISOString().split('T')[0];
      if (!seen.has(ds)) { seen.add(ds); result.push(ds); }
      d.setDate(d.getDate() + 7);
    }
  }
  return result.sort();
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
  const { cycles, loadingCycles, handleMarkPaid, handleStartNewCycle } = useClientPayments(clientId);

  const [form, setFormState] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(!!clientId);
  const [creating, setCreating] = useState(false);

  // Absence modal
  const [absenceModal, setAbsenceModal] = useState(false);
  const [absenceFrom, setAbsenceFrom] = useState(null);
  const [absenceTo, setAbsenceTo] = useState(null);
  const [savingAbsence, setSavingAbsence] = useState(false);

  // Cycle expansion + per-cycle attendance
  const [expandedCycleId, setExpandedCycleId] = useState(null);
  const [cycleAttendance, setCycleAttendance] = useState({});
  const [loadingCycleAtt, setLoadingCycleAtt] = useState(null);

  const autosaveTimerRef = useRef(null);

  useEffect(() => {
    if (clientId) loadClient();
    return () => clearTimeout(autosaveTimerRef.current);
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

  // ── Auto-save helpers ─────────────────────────────────────────────────────

  function setField(key, value) {
    setFormState(prev => ({ ...prev, [key]: value }));
    if (!clientId) return;
    const dbMap = { paymentType: 'payment_type', name: 'name', phone: 'phone' };
    const dbKey = dbMap[key];
    if (!dbKey) return;
    if (key === 'name' || key === 'phone') {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = setTimeout(() => {
        supabase.from('clients').update({ [dbKey]: value.trim() }).eq('id', clientId).then(() => {});
      }, 700);
    } else {
      supabase.from('clients').update({ [dbKey]: value }).eq('id', clientId).then(() => {});
    }
  }

  async function saveSlots(slotList) {
    if (!clientId) return;
    await supabase.from('client_slots').delete().eq('client_id', clientId);
    if (slotList.length > 0) {
      await supabase.from('client_slots').insert(
        slotList.map(s => ({ client_id: clientId, day_of_week: s.day, time_slot: s.time }))
      );
    }
  }

  function addSlot() {
    if (form.selectedDay === null || !form.selectedTime) {
      Alert.alert('בחרי יום ושעה');
      return;
    }
    const exists = form.slots.find(s => s.day === form.selectedDay && s.time === form.selectedTime);
    if (exists) { Alert.alert('משבצת זו כבר קיימת'); return; }
    const newSlots = [...form.slots, { day: form.selectedDay, time: form.selectedTime }];
    setFormState(prev => ({ ...prev, slots: newSlots, selectedDay: null, selectedTime: null }));
    saveSlots(newSlots);
  }

  function removeSlot(index) {
    const newSlots = form.slots.filter((_, i) => i !== index);
    setFormState(prev => ({ ...prev, slots: newSlots }));
    saveSlots(newSlots);
  }

  // ── Create new client (only for new clients, no clientId) ─────────────────

  async function createClient() {
    if (!form.name.trim()) return Alert.alert('שגיאה', 'חובה להזין שם');
    setCreating(true);
    try {
      const { data, error } = await supabase
        .from('clients')
        .insert({
          name: form.name.trim(), phone: form.phone.trim(),
          payment_type: form.paymentType,
        })
        .select().single();
      if (error) throw error;
      if (form.slots.length > 0) {
        await supabase.from('client_slots').insert(
          form.slots.map(s => ({ client_id: data.id, day_of_week: s.day, time_slot: s.time }))
        );
      }
      navigation.goBack();
    } catch (e) {
      Alert.alert('שגיאה', e.message || 'לא ניתן ליצור לקוח');
    } finally {
      setCreating(false);
    }
  }

  // ── Absence range ─────────────────────────────────────────────────────────

  async function saveAbsenceRange() {
    if (!absenceFrom || !absenceTo || !clientId) return;
    setSavingAbsence(true);
    try {
      const from = new Date(absenceFrom + 'T00:00:00');
      const to = new Date(absenceTo + 'T23:59:59');
      const records = [];
      for (const slot of form.slots) {
        const d = new Date(from);
        while (d.getDay() !== slot.day) d.setDate(d.getDate() + 1);
        while (d <= to) {
          records.push({ lesson_date: d.toISOString().split('T')[0], time_slot: slot.time, client_id: clientId, status: 'planned_absent', paid: false });
          d.setDate(d.getDate() + 7);
        }
      }
      if (records.length === 0) { Alert.alert('', 'לא נמצאו שיעורים בטווח זה'); return; }
      await supabase.from('attendance').upsert(records, { onConflict: 'lesson_date,time_slot,client_id' });
      const subRecords = records.map(r => ({ lesson_date: r.lesson_date, time_slot: r.time_slot, absent_client_id: clientId, substitute_client_id: null }));
      await supabase.from('substitutions').upsert(subRecords, { onConflict: 'lesson_date,time_slot,absent_client_id' });
      Alert.alert('בוצע', `${records.length} שיעורים סומנו כהיעדרות מתוכננת`);
      setAbsenceModal(false); setAbsenceFrom(null); setAbsenceTo(null);
    } catch (e) {
      Alert.alert('שגיאה', e.message || 'לא ניתן לשמור');
    } finally {
      setSavingAbsence(false);
    }
  }

  // ── Cycle expansion (show individual lesson dates) ────────────────────────

  async function toggleCycleExpand(cycle) {
    if (expandedCycleId === cycle.id) { setExpandedCycleId(null); return; }
    setExpandedCycleId(cycle.id);
    if (cycleAttendance[cycle.id]) return;
    setLoadingCycleAtt(cycle.id);
    const startDate = cycle.started_at || '2000-01-01';
    const endDate = cycle.completed_at || new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('attendance')
      .select('lesson_date, time_slot, status')
      .eq('client_id', clientId)
      .in('status', ['present', 'replaced_out'])
      .gte('lesson_date', startDate)
      .lte('lesson_date', endDate)
      .order('lesson_date', { ascending: false });
    setCycleAttendance(prev => ({ ...prev, [cycle.id]: data || [] }));
    setLoadingCycleAtt(null);
  }

  // ─────────────────────────────────────────────────────────────────────────

  const title = clientId ? 'כרטיס לקוח' : 'לקוח חדש';

  if (loading) {
    return (
      <View style={{ flex: 1 }}>
        <SlidePanel title={title}>
          <ActivityIndicator color="#6C63FF" style={{ marginTop: 40 }} />
        </SlidePanel>
      </View>
    );
  }

  const daySlots = form.selectedDay !== null ? getSlotsForDay(schedule, form.selectedDay) : [];
  const morning = daySlots.filter(s => s.start_time < '12:00');
  const evening = daySlots.filter(s => s.start_time >= '12:00');
  const absenceDates = getAbsenceDates(form.slots);

  return (
    <View style={{ flex: 1 }}>
      <SlidePanel title={title}>

        {/* ── Basic fields ── */}
        <TextInput
          style={styles.input} placeholder="שם" value={form.name}
          onChangeText={v => setField('name', v)} textAlign="right"
        />
        <TextInput
          style={styles.input} placeholder="טלפון" value={form.phone}
          onChangeText={v => setField('phone', v)} keyboardType="phone-pad" textAlign="right"
        />

        {/* ── Payment type ── */}
        <Text style={styles.sectionLabel}>סוג תשלום</Text>
        <View style={styles.toggle}>
          {['package', 'per_visit'].map(type => (
            <TouchableOpacity
              key={type}
              style={[styles.toggleBtn, form.paymentType === type && styles.toggleBtnActive]}
              onPress={() => setField('paymentType', type)}
            >
              <Text style={[styles.toggleText, form.paymentType === type && styles.toggleTextActive]}>
                {type === 'package' ? 'כרטיסיה' : 'לפי ביקור'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Slots ── */}
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
              onPress={() => setFormState(prev => ({ ...prev, selectedDay: prev.selectedDay === i ? null : i }))}
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
                  onPress={() => setFormState(prev => ({ ...prev, selectedTime: prev.selectedTime === s.start_time ? null : s.start_time }))}
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
                  onPress={() => setFormState(prev => ({ ...prev, selectedTime: prev.selectedTime === s.start_time ? null : s.start_time }))}
                >
                  <Text style={[styles.pillText, form.selectedTime === s.start_time && styles.pillTextActive]}>{s.start_time}</Text>
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

        {/* New client create button */}
        {!clientId && (
          <TouchableOpacity
            style={[styles.createBtn, creating && styles.btnDisabled]}
            onPress={createClient}
            disabled={creating}
          >
            {creating ? <ActivityIndicator color="#fff" /> : <Text style={styles.createBtnText}>צור לקוח</Text>}
          </TouchableOpacity>
        )}

        {/* ── Absence ── */}
        {clientId && form.slots.length > 0 && (
          <>
            <View style={styles.sectionDivider} />
            <Text style={styles.sectionLabel}>היעדרות מתוכננת</Text>
            <TouchableOpacity style={styles.absenceBtn} onPress={() => setAbsenceModal(true)}>
              <Text style={styles.absenceBtnText}>הוסף העדרות</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── Cycle history ── */}
        {clientId && (
          <>
            <View style={styles.sectionDivider} />
            {!loadingCycles && cycles.some(c => c.payments?.[0]?.status === 'unpaid') && (
              <View style={styles.debtBanner}>
                <Text style={styles.debtBannerText}>יש יתרה לתשלום</Text>
              </View>
            )}
            <View style={styles.cycleHeader}>
              <Text style={styles.sectionLabel}>מחזורים</Text>
              <TouchableOpacity
                style={styles.newCycleBtn}
                onPress={() => {
                  Alert.alert('התחל מחזור חדש', 'הפגישה הבאה תיספר כ-1 מחדש. להמשיך?', [
                    { text: 'ביטול', style: 'cancel' },
                    { text: 'התחל', onPress: handleStartNewCycle },
                  ]);
                }}
              >
                <Text style={styles.newCycleBtnText}>+ מחזור חדש</Text>
              </TouchableOpacity>
            </View>
            {loadingCycles ? (
              <ActivityIndicator color="#6C63FF" style={{ marginVertical: 12 }} />
            ) : cycles.length === 0 ? (
              <Text style={styles.pickerHint}>אין פעילות עדיין</Text>
            ) : (
              cycles.map((cycle, idx) => {
                const payment = cycle.payments?.[0];
                const isPaid = payment?.status === 'paid';
                const isActive = !cycle.completed_at;
                const cycleNum = cycles.length - idx;
                const startStr = cycle.started_at
                  ? new Date(cycle.started_at + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' })
                  : '';
                const endStr = cycle.completed_at
                  ? new Date(cycle.completed_at + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' })
                  : null;
                const isExpanded = expandedCycleId === cycle.id;
                const lessons = cycleAttendance[cycle.id] || [];

                return (
                  <View key={cycle.id} style={[styles.cycleCard, isActive && styles.cycleCardActive]}>
                    {/* Cycle header row */}
                    <TouchableOpacity style={styles.cycleRow} onPress={() => toggleCycleExpand(cycle)}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cycleTitle}>
                          {isActive
                            ? `מחזור פעיל: ${cycle.sessions_used} / ${cycle.sessions_max}`
                            : `מחזור ${cycleNum} · ${cycle.sessions_used}/${cycle.sessions_max} שיעורים`}
                        </Text>
                        {startStr ? (
                          <Text style={styles.cycleRange}>{startStr}{endStr ? ` – ${endStr}` : ''}</Text>
                        ) : null}
                      </View>
                      <View style={styles.cycleRight}>
                        {isPaid ? (
                          <Text style={styles.paidLabel}>שולם ✓</Text>
                        ) : payment ? (
                          <View style={styles.unpaidBadge}>
                            <Text style={styles.unpaidBadgeText}>לא שולם</Text>
                          </View>
                        ) : null}
                        <Text style={styles.chevron}>{isExpanded ? '▲' : '▼'}</Text>
                      </View>
                    </TouchableOpacity>

                    {/* Payment action */}
                    {!isPaid && payment && (
                      <TouchableOpacity style={styles.markPaidBtn} onPress={() => handleMarkPaid(payment.id)}>
                        <Text style={styles.markPaidBtnText}>סמן כשולם</Text>
                      </TouchableOpacity>
                    )}

                    {/* Expanded lesson list */}
                    {isExpanded && (
                      <View style={styles.lessonList}>
                        {loadingCycleAtt === cycle.id ? (
                          <ActivityIndicator color="#6C63FF" size="small" style={{ marginVertical: 8 }} />
                        ) : lessons.length === 0 ? (
                          <Text style={styles.noLessonsText}>אין שיעורים להצגה</Text>
                        ) : (
                          lessons.map((l, li) => (
                            <View key={`${l.lesson_date}_${l.time_slot}`} style={styles.lessonItem}>
                              <Text style={styles.lessonNum}>שיעור {lessons.length - li}</Text>
                              <Text style={styles.lessonDate}>
                                {new Date(l.lesson_date + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: '2-digit' })}
                              </Text>
                              <Text style={[styles.lessonStatus, isPaid ? styles.paidText : styles.unpaidText]}>
                                {isPaid ? '✓ שולם' : '○ ממתין'}
                              </Text>
                            </View>
                          ))
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}
      </SlidePanel>

      {/* ── Absence modal ── */}
      {absenceModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>הוסף העדרות</Text>
            <Text style={styles.modalLabel}>מתאריך</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
              <View style={styles.pillRow}>
                {absenceDates.map(d => {
                  const label = new Date(d + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
                  const active = absenceFrom === d;
                  return (
                    <TouchableOpacity key={d} style={[styles.pill, active && styles.pillActive]}
                      onPress={() => { setAbsenceFrom(d); if (absenceTo && d > absenceTo) setAbsenceTo(null); }}
                    >
                      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
            {absenceFrom && (
              <>
                <Text style={styles.modalLabel}>עד תאריך</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                  <View style={styles.pillRow}>
                    {absenceDates.filter(d => d >= absenceFrom).map(d => {
                      const label = new Date(d + 'T12:00').toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
                      const active = absenceTo === d;
                      return (
                        <TouchableOpacity key={d} style={[styles.pill, active && styles.pillActive]} onPress={() => setAbsenceTo(d)}>
                          <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </ScrollView>
              </>
            )}
            <TouchableOpacity
              style={[styles.confirmBtn, (!absenceFrom || !absenceTo || savingAbsence) && styles.btnDisabled, { marginTop: 16 }]}
              onPress={saveAbsenceRange}
              disabled={!absenceFrom || !absenceTo || savingAbsence}
            >
              {savingAbsence ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmBtnText}>אישור</Text>}
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelModalBtn}
              onPress={() => { setAbsenceModal(false); setAbsenceFrom(null); setAbsenceTo(null); }}
            >
              <Text style={styles.cancelModalText}>ביטול</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10,
    padding: 12, marginBottom: 10, fontSize: 15, backgroundColor: '#fff',
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
  pickerHint: { color: '#aaa', fontSize: 13, textAlign: 'right', marginVertical: 6 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  pill: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: '#E0E0E0' },
  pillActive: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  pillText: { fontSize: 13, color: '#555' },
  pillTextActive: { color: '#fff', fontWeight: '600' },
  addSlotBtn: { borderWidth: 1.5, borderColor: '#6C63FF', borderRadius: 10, padding: 11, alignItems: 'center', marginTop: 14 },
  addSlotText: { color: '#6C63FF', fontWeight: '600', fontSize: 14 },
  createBtn: { backgroundColor: '#6C63FF', borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 16 },
  createBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnDisabled: { opacity: 0.6 },
  sectionDivider: { height: 1, backgroundColor: '#E8E4F8', marginVertical: 20 },
  absenceBtn: { backgroundColor: '#FF9800', borderRadius: 12, padding: 13, alignItems: 'center', marginTop: 4 },
  absenceBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  debtBanner: { backgroundColor: '#FFEBEE', borderRadius: 10, padding: 10, alignItems: 'center', marginBottom: 8 },
  debtBannerText: { color: '#E53935', fontWeight: '700', fontSize: 14 },
  cycleHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  newCycleBtn: { borderWidth: 1, borderColor: '#6C63FF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  newCycleBtnText: { color: '#6C63FF', fontSize: 13, fontWeight: '600' },
  cycleCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 8,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, overflow: 'hidden',
  },
  cycleCardActive: { borderLeftWidth: 3, borderLeftColor: '#6C63FF' },
  cycleRow: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  cycleTitle: { fontSize: 14, fontWeight: '600', color: '#333', textAlign: 'right' },
  cycleRange: { fontSize: 12, color: '#999', marginTop: 2, textAlign: 'right' },
  cycleRight: { alignItems: 'flex-end', gap: 4 },
  chevron: { fontSize: 11, color: '#BDBDBD' },
  paidLabel: { fontSize: 12, color: '#4CAF50', fontWeight: '600' },
  unpaidBadge: { backgroundColor: '#FFEBEE', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  unpaidBadgeText: { fontSize: 10, color: '#E53935', fontWeight: '600' },
  markPaidBtn: { backgroundColor: '#4CAF50', marginHorizontal: 12, marginBottom: 10, borderRadius: 8, padding: 8, alignItems: 'center' },
  markPaidBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  lessonList: { borderTopWidth: 1, borderTopColor: '#F0F0F0', paddingHorizontal: 12, paddingBottom: 10 },
  lessonItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F8F8F8' },
  lessonNum: { fontSize: 12, color: '#999', width: 52, textAlign: 'right' },
  lessonDate: { flex: 1, fontSize: 13, color: '#444', textAlign: 'right' },
  lessonStatus: { fontSize: 12, fontWeight: '600' },
  paidText: { color: '#4CAF50' },
  unpaidText: { color: '#E53935' },
  noLessonsText: { color: '#aaa', fontSize: 13, textAlign: 'center', paddingVertical: 8 },

  // Absence modal
  modalOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', zIndex: 200 },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 14, color: '#333' },
  modalLabel: { fontSize: 13, color: '#888', marginBottom: 6, textAlign: 'right' },
  confirmBtn: { backgroundColor: '#6C63FF', borderRadius: 12, padding: 14, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  cancelModalBtn: { marginTop: 10, padding: 14, alignItems: 'center' },
  cancelModalText: { fontSize: 15, color: '#999' },
});
