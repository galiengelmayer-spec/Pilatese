import React, { useEffect, useRef, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { supabase } from '../lib/supabase';

const TIME_SLOTS = ['07:30', '08:30', '09:30', '17:00', '18:00', '19:00', '20:00'];
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function getIcon(att, isFuture) {
  if (isFuture) return { icon: '○', color: '#BDBDBD' };
  if (!att) return { icon: '?', color: '#FFB300' };
  if (att.status === 'present') return { icon: '✓', color: '#4CAF50' };
  if (att.status === 'absent') return { icon: '✗', color: '#F44336' };
  if (att.status === 'replacement') return { icon: '⇄', color: '#FF9800' };
  return { icon: '○', color: '#BDBDBD' };
}

function LessonCard({ lesson, onToggle }) {
  const { date, dayOfWeek, timeSlot, isFuture, regularClients, attendance } = lesson;
  const dateObj = new Date(date + 'T12:00:00');
  const dateLabel = dateObj.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  const todayStr = toDateStr(new Date());
  const isToday = date === todayStr;

  const attMap = {};
  attendance.forEach(a => { attMap[a.client_id] = a; });

  const regularIds = new Set(regularClients.map(cs => cs.client_id));
  const replacements = attendance.filter(a => !regularIds.has(a.client_id));

  return (
    <View style={[styles.card, isFuture && styles.cardFuture, isToday && styles.cardToday]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.timeText, isFuture && styles.dimText]}>{timeSlot}</Text>
        <Text style={[styles.dateText, isFuture && styles.dimText]}>
          {isToday ? 'היום' : `יום ${DAY_NAMES[dayOfWeek]}`}{'  '}{dateLabel}
        </Text>
      </View>

      {regularClients.map(cs => {
        const att = attMap[cs.client_id];
        const { icon, color } = getIcon(att, isFuture);
        return (
          <TouchableOpacity
            key={cs.client_id}
            style={styles.clientRow}
            onPress={() => !isFuture && onToggle(lesson, cs.client_id, att)}
          >
            <Text style={[styles.icon, { color }]}>{icon}</Text>
            <Text style={[styles.clientName, att?.status === 'absent' && styles.strikethrough]}>
              {cs.clients?.name}
            </Text>
            {att?.paid && <Text style={styles.paidBadge}>₪</Text>}
          </TouchableOpacity>
        );
      })}

      {replacements.map(a => (
        <View key={a.client_id} style={[styles.clientRow, styles.replacementRow]}>
          <Text style={[styles.icon, { color: '#FF9800' }]}>⇄</Text>
          <Text style={styles.clientName}>{a.clients?.name}</Text>
          {a.paid && <Text style={styles.paidBadge}>₪</Text>}
        </View>
      ))}
    </View>
  );
}

export default function LessonsScreen() {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const listRef = useRef(null);
  const todayIndexRef = useRef(0);

  useEffect(() => { fetchData(); }, []);

  async function fetchData() {
    setLoading(true);
    const today = new Date();
    const from = new Date(today); from.setDate(today.getDate() - 30);
    const to = new Date(today); to.setDate(today.getDate() + 14);

    const [slotsRes, attRes] = await Promise.all([
      supabase.from('client_slots').select('client_id, day_of_week, time_slot, clients(id, name)'),
      supabase.from('attendance')
        .select('id, lesson_date, time_slot, client_id, status, paid, clients(id, name)')
        .gte('lesson_date', toDateStr(from))
        .lte('lesson_date', toDateStr(to)),
    ]);

    const slots = slotsRes.data || [];
    const att = attRes.data || [];

    const attMap = {};
    att.forEach(a => {
      const key = `${a.lesson_date}_${a.time_slot}`;
      if (!attMap[key]) attMap[key] = [];
      attMap[key].push(a);
    });

    const now = new Date();
    const todayStr = toDateStr(today);
    const generated = [];

    for (let i = -30; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = toDateStr(d);
      const dow = d.getDay();
      if (dow === 6) continue;

      for (const ts of TIME_SLOTS) {
        const regular = slots.filter(s => s.day_of_week === dow && s.time_slot === ts);
        const key = `${dateStr}_${ts}`;
        const lessonAtt = attMap[key] || [];
        const regularIds = new Set(regular.map(s => s.client_id));
        const hasReplacements = lessonAtt.some(a => !regularIds.has(a.client_id));

        if (regular.length === 0 && !hasReplacements) continue;

        const [h, m] = ts.split(':').map(Number);
        const lessonDt = new Date(d); lessonDt.setHours(h, m, 0, 0);

        generated.push({
          id: key,
          date: dateStr,
          dayOfWeek: dow,
          timeSlot: ts,
          isFuture: lessonDt > now,
          regularClients: regular,
          attendance: lessonAtt,
        });
      }
    }

    setLessons(generated);
    const idx = generated.findIndex(l => l.date >= todayStr);
    todayIndexRef.current = Math.max(0, idx);
    setLoading(false);
  }

  async function handleToggle(lesson, clientId, existing) {
    const { date, timeSlot } = lesson;

    if (!existing) {
      await supabase.from('attendance').insert({
        lesson_date: date, time_slot: timeSlot, client_id: clientId, status: 'present', paid: false,
      });
    } else if (existing.status === 'present') {
      await supabase.from('attendance').update({ status: 'absent' }).eq('id', existing.id);
    } else {
      await supabase.from('attendance').delete().eq('id', existing.id);
    }

    setLessons(prev => prev.map(l => {
      if (l.id !== lesson.id) return l;
      const clientInfo = l.regularClients.find(rc => rc.client_id === clientId)?.clients;
      let newAtt = l.attendance.filter(a => a.client_id !== clientId);
      if (!existing) {
        newAtt = [...newAtt, { client_id: clientId, status: 'present', paid: false, clients: clientInfo }];
      } else if (existing.status === 'present') {
        newAtt = [...newAtt, { ...existing, status: 'absent' }];
      }
      return { ...l, attendance: newAtt };
    }));
  }

  if (loading) return <ActivityIndicator style={{ flex: 1 }} size="large" color="#6C63FF" />;

  if (lessons.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>אין שיעורים</Text>
        <Text style={styles.emptyHint}>הוסיפי לקוחות ושבצי אותם לשיעורים</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F0EEF8' }}>
      <FlatList
        ref={listRef}
        data={lessons}
        keyExtractor={item => item.id}
        renderItem={({ item }) => <LessonCard lesson={item} onToggle={handleToggle} />}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        onLayout={() => {
          if (todayIndexRef.current > 0) {
            listRef.current?.scrollToIndex({ index: todayIndexRef.current, animated: false, viewPosition: 0 });
          }
        }}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => listRef.current?.scrollToIndex({ index, animated: false }), 300);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff', borderRadius: 16, padding: 14, marginBottom: 10,
    borderLeftWidth: 4, borderLeftColor: '#6C63FF',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  cardFuture: { borderLeftColor: '#BDBDBD', backgroundColor: '#FAFAFA' },
  cardToday: { borderLeftColor: '#FF9800', borderLeftWidth: 5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  timeText: { fontSize: 20, fontWeight: '800', color: '#6C63FF' },
  dateText: { fontSize: 13, color: '#666', alignSelf: 'center' },
  dimText: { color: '#BDBDBD' },
  clientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, gap: 8 },
  replacementRow: { borderTopWidth: 1, borderTopColor: '#FFF3E0', marginTop: 4, paddingTop: 8 },
  icon: { fontSize: 15, width: 22, textAlign: 'center' },
  clientName: { flex: 1, fontSize: 14, color: '#333' },
  strikethrough: { textDecorationLine: 'line-through', color: '#aaa' },
  paidBadge: { fontSize: 12, color: '#4CAF50', fontWeight: 'bold' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#555' },
  emptyHint: { fontSize: 14, color: '#999', marginTop: 6 },
});
