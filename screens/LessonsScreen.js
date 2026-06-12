import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator, LayoutAnimation, Platform, UIManager
} from 'react-native';
import { supabase } from '../lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const TIME_SLOTS = ['07:30', '08:30', '09:30', '17:00', '18:00', '19:00', '20:00'];
const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MAX_BEDS = 6;

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function LessonRow({ lesson, expanded, onToggle, onToggleAttendance }) {
  const { date, dayOfWeek, timeSlot, isFuture, regularClients, attendance } = lesson;

  const dateObj = new Date(date + 'T12:00:00');
  const dateLabel = dateObj.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  const todayStr = toDateStr(new Date());
  const isToday = date === todayStr;

  const attMap = {};
  attendance.forEach(a => { attMap[a.client_id] = a; });

  const regularIds = new Set(regularClients.map(cs => cs.client_id));
  const replacements = attendance.filter(a => !regularIds.has(a.client_id));

  const presentCount = attendance.filter(a => a.status === 'present' || a.status === 'replacement').length;
  const filledBeds = regularClients.length + replacements.length;
  const emptyBeds = Math.max(0, MAX_BEDS - filledBeds);

  // Progress bar
  function renderBeds() {
    const beds = [];
    regularClients.forEach(cs => {
      const att = attMap[cs.client_id];
      let color = '#BDBDBD';
      if (!isFuture) {
        if (!att) color = '#FFB300';
        else if (att.status === 'present') color = '#4CAF50';
        else if (att.status === 'absent') color = '#F44336';
      }
      beds.push(color);
    });
    replacements.forEach(() => beds.push('#FF9800'));
    for (let i = 0; i < emptyBeds; i++) beds.push('#E8E8E8');
    return beds.slice(0, MAX_BEDS);
  }

  const beds = renderBeds();

  return (
    <View style={[styles.card, isToday && styles.cardToday, expanded && styles.cardExpanded]}>
      {/* Summary row — always visible */}
      <TouchableOpacity style={styles.summary} onPress={onToggle} activeOpacity={0.7}>
        <View style={styles.summaryLeft}>
          <Text style={[styles.timeText, isFuture && styles.dimText]}>{timeSlot}</Text>
          <View style={styles.bedRow}>
            {beds.map((c, i) => <View key={i} style={[styles.bed, { backgroundColor: c }]} />)}
          </View>
        </View>
        <View style={styles.summaryRight}>
          <Text style={[styles.dateText, isFuture && styles.dimText]}>
            {isToday ? 'היום' : `יום ${DAY_NAMES[dayOfWeek]}`} {dateLabel}
          </Text>
          {!isFuture && (
            <Text style={styles.countText}>{presentCount}/{MAX_BEDS} הגיעו</Text>
          )}
        </View>
        <Text style={styles.chevron}>{expanded ? '▲' : '▼'}</Text>
      </TouchableOpacity>

      {/* Expanded detail */}
      {expanded && (
        <View style={styles.detail}>
          <View style={styles.divider} />

          {regularClients.map(cs => {
            const att = attMap[cs.client_id];
            const name = cs.clients?.name;
            let icon = '○', iconColor = '#BDBDBD', nameStyle = {};

            if (!isFuture) {
              if (!att) { icon = '?'; iconColor = '#FFB300'; }
              else if (att.status === 'present') { icon = '✓'; iconColor = '#4CAF50'; }
              else if (att.status === 'absent') { icon = '✗'; iconColor = '#F44336'; nameStyle = styles.strikethrough; }
            }

            return (
              <TouchableOpacity
                key={cs.client_id}
                style={styles.clientRow}
                onPress={() => !isFuture && onToggleAttendance(lesson, cs.client_id, att)}
              >
                <Text style={[styles.rowIcon, { color: iconColor }]}>{icon}</Text>
                <Text style={[styles.clientName, nameStyle]}>{name}</Text>
                {att?.paid && <Text style={styles.paidBadge}>₪</Text>}
              </TouchableOpacity>
            );
          })}

          {replacements.map(a => {
            const original = regularClients.find(cs => {
              const origAtt = attMap[cs.client_id];
              return origAtt?.status === 'absent';
            });
            return (
              <View key={a.client_id} style={[styles.clientRow, styles.replacementRow]}>
                <Text style={[styles.rowIcon, { color: '#FF9800' }]}>⇄</Text>
                <Text style={styles.clientName}>
                  {original?.clients?.name
                    ? `${original.clients.name} → ${a.clients?.name}`
                    : a.clients?.name}
                </Text>
                {a.paid && <Text style={styles.paidBadge}>₪</Text>}
              </View>
            );
          })}

          {Array.from({ length: emptyBeds }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.clientRow}>
              <Text style={[styles.rowIcon, { color: '#E0E0E0' }]}>○</Text>
              <Text style={styles.emptySlot}>פנוי</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export default function LessonsScreen() {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
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

  function toggleExpand(id) {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpandedId(prev => prev === id ? null : id);
  }

  async function handleToggleAttendance(lesson, clientId, existing) {
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
        renderItem={({ item }) => (
          <LessonRow
            lesson={item}
            expanded={expandedId === item.id}
            onToggle={() => toggleExpand(item.id)}
            onToggleAttendance={handleToggleAttendance}
          />
        )}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        onLayout={() => {
          if (todayIndexRef.current > 0) {
            listRef.current?.scrollToIndex({
              index: todayIndexRef.current, animated: false, viewPosition: 0,
            });
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
    backgroundColor: '#fff', borderRadius: 16, marginBottom: 8,
    borderLeftWidth: 4, borderLeftColor: '#6C63FF',
    shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
    overflow: 'hidden',
  },
  cardToday: { borderLeftColor: '#FF9800', borderLeftWidth: 5 },
  cardExpanded: { borderLeftColor: '#6C63FF' },

  summary: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 10,
  },
  summaryLeft: { flex: 1, gap: 6 },
  summaryRight: { alignItems: 'flex-end', gap: 2 },
  timeText: { fontSize: 20, fontWeight: '800', color: '#6C63FF' },
  dimText: { color: '#BDBDBD' },
  dateText: { fontSize: 13, color: '#555', fontWeight: '500' },
  countText: { fontSize: 12, color: '#888' },
  chevron: { fontSize: 11, color: '#BDBDBD', marginLeft: 4 },

  bedRow: { flexDirection: 'row', gap: 4 },
  bed: { width: 18, height: 10, borderRadius: 3 },

  divider: { height: 1, backgroundColor: '#F0F0F0', marginHorizontal: 14 },
  detail: { paddingHorizontal: 14, paddingBottom: 12, paddingTop: 4 },

  clientRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 7, gap: 10,
  },
  replacementRow: { backgroundColor: '#FFF8F0', borderRadius: 8, paddingHorizontal: 6, marginTop: 2 },
  rowIcon: { fontSize: 15, width: 22, textAlign: 'center' },
  clientName: { flex: 1, fontSize: 14, color: '#333' },
  strikethrough: { textDecorationLine: 'line-through', color: '#bbb' },
  paidBadge: { fontSize: 12, color: '#4CAF50', fontWeight: 'bold' },
  emptySlot: { fontSize: 13, color: '#BDBDBD', fontStyle: 'italic' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#555' },
  emptyHint: { fontSize: 14, color: '#999', marginTop: 6 },
});
