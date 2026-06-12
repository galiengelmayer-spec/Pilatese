import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Alert, TextInput, ActivityIndicator, TouchableWithoutFeedback,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { fetchSchedule, FALLBACK_SCHEDULE } from '../lib/studioSchedule';

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי'];

// ─── Mock data for 200 clients ─────────────────────────────────────────────
const FEMALE = ['שירה','נועה','מיכל','דנה','ליאת','אביגיל','רחל','שרה','לאה','מרים','תמר','רות','יעל','ורד','ספיר','מאיה','כרמל','לילך','שקד','מור','רותם','עדן','אפרת','ענת','אורית','דפנה','רונית','יפית','גאולה','חגית','פנינה','ציפורה','גלית','אילנה','נילי','ליאור','עינת','נגה','מוריה','הדר','שני','קרן','טלי','אורה','שושנה','רינת','ברכה','נעמה','אמירה','הילה'];
const MALE = ['יוסי','דוד','משה','אמיר','גיל','רון','אלון','עמית','נדב','ירון','שי','בועז','נועם','מתן','ניר','הראל','תום','דור','אבי','עמי','זיו','גבי','כפיר','עוז','אור','בר','לי','עידו','idan','נחי'];
const LAST = ['כהן','לוי','מזרחי','פרץ','ביטון','אבוטבול','שאבי','דהן','פרידמן','גולדברג','שפירו','רוזנברג','גרינברג','ברגר','שוורץ','כץ','הורוביץ','ויס','שטרן','ברוך','אדלר','פלד','גבאי','חיים','נחמני','רבינוביץ','ששון','עזרא','אסולין','חדד','אוחיון','זכריה','מרציאנו','אלמוג','שלוש','עמר','צרפתי','אלבז','בוחבוט','חמו'];
const PREFIXES = ['050','052','053','054','055','057','058'];

function generateMockClients(count = 200) {
  const firstNames = [...FEMALE, ...MALE];
  const clients = [];
  for (let i = 0; i < count; i++) {
    const first = firstNames[(i * 7 + 3) % firstNames.length];
    const last = LAST[(i * 11 + 5) % LAST.length];
    const prefix = PREFIXES[i % PREFIXES.length];
    const num = String(2000000 + i * 137).padStart(7, '0');
    const phone = `${prefix}-${num}`;
    const paymentType = i % 3 === 0 ? 'per_visit' : 'package';
    clients.push({ name: `${first} ${last}`, phone, payment_type: paymentType });
  }
  return clients;
}
// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_SLOT_FORM = { day: 0, startTime: '', endTime: '' };

export default function SettingsScreen() {
  const [schedule, setSchedule] = useState([]);
  const [loadingSchedule, setLoadingSchedule] = useState(true);
  const [slotModal, setSlotModal] = useState(false);
  const [editingSlot, setEditingSlot] = useState(null); // null = new, object = edit
  const [slotForm, setSlotForm] = useState(EMPTY_SLOT_FORM);
  const [savingSlot, setSavingSlot] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => { loadSchedule(); }, []);

  async function loadSchedule() {
    setLoadingSchedule(true);
    const data = await fetchSchedule();
    // Only show real DB rows (not fallback defaults) in the management list
    const isFallback = data === FALLBACK_SCHEDULE || data[0]?.id?.startsWith('default-');
    setSchedule(isFallback ? [] : data);
    setLoadingSchedule(false);
  }

  // ── Schedule CRUD ──────────────────────────────────────────────────────────

  function openNewSlot() {
    setEditingSlot(null);
    setSlotForm(EMPTY_SLOT_FORM);
    setSlotModal(true);
  }

  function openEditSlot(slot) {
    setEditingSlot(slot);
    setSlotForm({ day: slot.day_of_week, startTime: slot.start_time, endTime: slot.end_time });
    setSlotModal(true);
  }

  async function saveSlot() {
    const { day, startTime, endTime } = slotForm;
    if (!startTime.match(/^\d{2}:\d{2}$/) || !endTime.match(/^\d{2}:\d{2}$/)) {
      Alert.alert('שגיאה', 'פורמט שעה: HH:MM (לדוגמה 07:30)');
      return;
    }
    setSavingSlot(true);
    try {
      if (editingSlot) {
        const { error } = await supabase
          .from('studio_schedule')
          .update({ day_of_week: day, start_time: startTime, end_time: endTime })
          .eq('id', editingSlot.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('studio_schedule')
          .insert({ day_of_week: day, start_time: startTime, end_time: endTime });
        if (error) throw error;
      }
      setSlotModal(false);
      loadSchedule();
    } catch (e) {
      Alert.alert('שגיאה', e.message || 'לא ניתן לשמור');
    } finally {
      setSavingSlot(false);
    }
  }

  async function deleteSlot(slot) {
    Alert.alert(
      'מחיקת שיעור',
      `למחוק יום ${DAYS[slot.day_of_week]} ${slot.start_time}–${slot.end_time}?`,
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק', style: 'destructive',
          onPress: async () => {
            await supabase.from('studio_schedule').delete().eq('id', slot.id);
            loadSchedule();
          },
        },
      ]
    );
  }

  // ── Demo data ──────────────────────────────────────────────────────────────

  async function loadDemoData() {
    Alert.alert(
      'טעינת נתוני דמו',
      'יוטענו 200 לקוחות לדוגמה. לקוחות קיימים לא יימחקו. להמשיך?',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'טען', onPress: async () => {
            setLoadingDemo(true);
            try {
              const clients = generateMockClients(200);
              // Insert in batches of 50 to avoid payload limits
              for (let i = 0; i < clients.length; i += 50) {
                const batch = clients.slice(i, i + 50);
                const { error } = await supabase.from('clients').insert(batch);
                if (error) throw error;
              }
              Alert.alert('בוצע', '200 לקוחות נטענו בהצלחה');
            } catch (e) {
              Alert.alert('שגיאה', e.message || 'לא ניתן לטעון נתונים');
            } finally {
              setLoadingDemo(false);
            }
          },
        },
      ]
    );
  }

  // ── Reset all data ─────────────────────────────────────────────────────────

  function confirmReset() {
    Alert.alert(
      '⚠️ אפס את כל הנתונים',
      'פעולה זו תמחק לצמיתות את כל הלקוחות, הנוכחות, הכרטיסיות וההגדרות. לא ניתן לבטל.',
      [
        { text: 'ביטול', style: 'cancel' },
        {
          text: 'מחק הכל', style: 'destructive',
          onPress: confirmResetSecond,
        },
      ]
    );
  }

  function confirmResetSecond() {
    Alert.alert(
      'אישור סופי',
      'בטוחה לחלוטין? כל הנתונים יאבדו ללא אפשרות שחזור.',
      [
        { text: 'ביטול', style: 'cancel' },
        { text: 'כן, מחקי הכל', style: 'destructive', onPress: resetAllData },
      ]
    );
  }

  async function resetAllData() {
    setResetting(true);
    try {
      await supabase.from('attendance').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('packages').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('client_slots').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('clients').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('studio_schedule').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      setSchedule([]);
      Alert.alert('בוצע', 'כל הנתונים נמחקו');
    } catch (e) {
      Alert.alert('שגיאה', e.message || 'לא ניתן לאפס נתונים');
    } finally {
      setResetting(false);
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  const grouped = DAYS.map((dayName, dayIndex) => ({
    dayName,
    dayIndex,
    slots: schedule.filter(s => s.day_of_week === dayIndex).sort((a, b) => a.start_time.localeCompare(b.start_time)),
  })).filter(g => g.slots.length > 0);

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 60 }}>

      {/* ── Section: Studio schedule ── */}
      <Text style={styles.sectionTitle}>לוח זמנים של הסטודיו</Text>
      <Text style={styles.sectionHint}>הגדירי את ימי ושעות השיעורים הקבועים</Text>

      {loadingSchedule ? (
        <ActivityIndicator color="#6C63FF" style={{ marginVertical: 20 }} />
      ) : (
        <>
          {grouped.length === 0 ? (
            <Text style={styles.emptyHint}>אין שיעורים מוגדרים עדיין — מוצגים ברירות מחדל</Text>
          ) : (
            grouped.map(({ dayName, dayIndex, slots }) => (
              <View key={dayIndex} style={styles.dayGroup}>
                <Text style={styles.dayLabel}>יום {dayName}</Text>
                {slots.map(slot => (
                  <View key={slot.id} style={styles.slotRow}>
                    <Text style={styles.slotTime}>{slot.start_time} – {slot.end_time}</Text>
                    <View style={styles.slotActions}>
                      <TouchableOpacity style={styles.editBtn} onPress={() => openEditSlot(slot)}>
                        <Text style={styles.editBtnText}>עריכה</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteSlot(slot)}>
                        <Text style={styles.deleteBtnText}>מחק</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ))
          )}

          <TouchableOpacity style={styles.addBtn} onPress={openNewSlot}>
            <Text style={styles.addBtnText}>+ הוסף שיעור</Text>
          </TouchableOpacity>
        </>
      )}

      {/* ── Section: Demo data ── */}
      <Text style={[styles.sectionTitle, { marginTop: 32 }]}>נתוני פיתוח</Text>
      <Text style={styles.sectionHint}>טען לקוחות לדוגמה לבדיקת המערכת</Text>
      <TouchableOpacity
        style={[styles.demoBtn, loadingDemo && styles.btnDisabled]}
        onPress={loadDemoData}
        disabled={loadingDemo}
      >
        {loadingDemo
          ? <ActivityIndicator color="#6C63FF" />
          : <Text style={styles.demoBtnText}>טען 200 לקוחות לדמו</Text>
        }
      </TouchableOpacity>

      {/* ── Section: Danger zone ── */}
      <Text style={[styles.sectionTitle, styles.dangerTitle, { marginTop: 32 }]}>אזור סכנה</Text>
      <Text style={styles.sectionHint}>פעולות בלתי הפיכות — השתמשי בזהירות</Text>
      <TouchableOpacity
        style={[styles.resetBtn, resetting && styles.btnDisabled]}
        onPress={confirmReset}
        disabled={resetting}
      >
        {resetting
          ? <ActivityIndicator color="#fff" />
          : <Text style={styles.resetBtnText}>אפס את כל הנתונים</Text>
        }
      </TouchableOpacity>

    </ScrollView>

    {slotModal && (
      <TouchableWithoutFeedback onPress={() => setSlotModal(false)}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>{editingSlot ? 'עריכת שיעור' : 'הוספת שיעור'}</Text>

              <Text style={styles.fieldLabel}>יום</Text>
              <View style={styles.pillRow}>
                {DAYS.map((d, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.pill, slotForm.day === i && styles.pillActive]}
                    onPress={() => setSlotForm(f => ({ ...f, day: i }))}
                  >
                    <Text style={[styles.pillText, slotForm.day === i && styles.pillTextActive]}>{d}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.fieldLabel}>שעת התחלה (HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={slotForm.startTime}
                onChangeText={v => setSlotForm(f => ({ ...f, startTime: v }))}
                placeholder="07:30"
                textAlign="center"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />

              <Text style={styles.fieldLabel}>שעת סיום (HH:MM)</Text>
              <TextInput
                style={styles.input}
                value={slotForm.endTime}
                onChangeText={v => setSlotForm(f => ({ ...f, endTime: v }))}
                placeholder="08:30"
                textAlign="center"
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />

              <TouchableOpacity
                style={[styles.saveBtn, savingSlot && styles.btnDisabled]}
                onPress={saveSlot}
                disabled={savingSlot}
              >
                {savingSlot
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.saveBtnText}>שמור</Text>
                }
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setSlotModal(false)}>
                <Text style={styles.cancelText}>ביטול</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0EEF8', padding: 16 },

  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#333', marginBottom: 4, textAlign: 'right' },
  dangerTitle: { color: '#D32F2F' },
  sectionHint: { fontSize: 13, color: '#888', marginBottom: 12, textAlign: 'right' },
  emptyHint: { fontSize: 13, color: '#aaa', marginBottom: 12, textAlign: 'right', fontStyle: 'italic' },

  dayGroup: { marginBottom: 12 },
  dayLabel: { fontSize: 14, fontWeight: '600', color: '#6C63FF', marginBottom: 6, textAlign: 'right' },
  slotRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 4,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  slotTime: { fontSize: 15, fontWeight: '600', color: '#333' },
  slotActions: { flexDirection: 'row', gap: 8 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#6C63FF' },
  editBtnText: { fontSize: 13, color: '#6C63FF', fontWeight: '600' },
  deleteBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#F44336' },
  deleteBtnText: { fontSize: 13, color: '#F44336', fontWeight: '600' },

  addBtn: {
    borderWidth: 1.5, borderColor: '#6C63FF', borderRadius: 10, borderStyle: 'dashed',
    padding: 12, alignItems: 'center', marginTop: 4,
  },
  addBtnText: { color: '#6C63FF', fontWeight: '600', fontSize: 14 },

  demoBtn: {
    backgroundColor: '#EDE7F6', borderRadius: 12, padding: 15, alignItems: 'center',
    borderWidth: 1, borderColor: '#6C63FF',
  },
  demoBtnText: { color: '#6C63FF', fontWeight: '700', fontSize: 15 },

  resetBtn: {
    backgroundColor: '#D32F2F', borderRadius: 12, padding: 15, alignItems: 'center',
  },
  resetBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  btnDisabled: { opacity: 0.5 },

  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end', zIndex: 100 },
  modal: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 24, maxHeight: '85%',
  },
  modalTitle: { fontSize: 19, fontWeight: 'bold', textAlign: 'center', marginBottom: 16, color: '#333' },
  fieldLabel: { fontSize: 13, color: '#666', marginBottom: 6, marginTop: 8, textAlign: 'right' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  pill: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, backgroundColor: '#F0F0F0', borderWidth: 1, borderColor: '#E0E0E0' },
  pillActive: { backgroundColor: '#6C63FF', borderColor: '#6C63FF' },
  pillText: { fontSize: 13, color: '#555' },
  pillTextActive: { color: '#fff', fontWeight: '600' },
  input: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10,
    padding: 12, fontSize: 16, marginBottom: 4,
  },
  saveBtn: { backgroundColor: '#6C63FF', borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 16 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  cancelText: { textAlign: 'center', color: '#999', marginTop: 12, fontSize: 15, paddingBottom: 4 },
});
