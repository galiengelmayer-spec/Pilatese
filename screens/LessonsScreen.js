import React, { useCallback, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { fetchSchedule, getSlotsForDay } from '../lib/studioSchedule';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MAX_BEDS = 6;

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

// Build a flat array interleaving { type:'divider' } headers between day groups
function buildFlatItems(lessonList) {
  const flat = [];
  let lastDate = null;
  for (const lesson of lessonList) {
    if (lesson.date !== lastDate) {
      lastDate = lesson.date;
      flat.push({
        type: 'divider',
        id: `divider-${lesson.date}`,
        date: lesson.date,
        dayOfWeek: lesson.dayOfWeek,
      });
    }
    flat.push({ type: 'lesson', ...lesson });
  }
  return flat;
}

function DayDivider({ date, dayOfWeek }) {
  const dateObj = new Date(date + 'T12:00:00');
  const dateLabel = dateObj.toLocaleDateString('he-IL', {
    day: 'numeric', month: 'numeric', year: 'numeric',
  });
  const isToday = date === toDateStr(new Date());
  return (
    <View style={styles.dayDivider}>
      <View style={styles.dayDividerLine} />
      <Text style={[styles.dayDividerLabel, isToday && styles.dayDividerLabelToday]}>
        יום {DAY_NAMES[dayOfWeek]} · {dateLabel}
      </Text>
      <View style={styles.dayDividerLine} />
    </View>
  );
}

function LessonRow({ lesson, onPress }) {
  const { date, dayOfWeek, timeSlot, isFuture, regularClients, attendance } = lesson;

  const dateObj = new Date(date + 'T12:00:00');
  const dateLabel = dateObj.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  const todayStr = toDateStr(new Date());
  const isToday = date === todayStr;

  const attMap = {};
  attendance.forEach(a => { attMap[a.client_id] = a; });

  const regularIds = new Set(regularClients.map(cs => cs.client_id));
  const replacements = attendance.filter(a => !regularIds.has(a.client_id));

  // No-record on a past lesson = arrived by default (same model as the pre-seed in LessonDetailScreen)
  const presentCount = isFuture ? 0 : (
    regularClients.filter(cs => {
      const att = attMap[cs.client_id];
      return !att || att.status === 'present';
    }).length + replacements.filter(a => a.status === 'replacement').length
  );
  const filledBeds = regularClients.length + replacements.length;
  const emptyBeds = Math.max(0, MAX_BEDS - filledBeds);

  function renderBeds() {
    const beds = [];
    regularClients.forEach(cs => {
      const att = attMap[cs.client_id];
      let color = '#BDBDBD'; // future = unconfirmed grey
      if (!isFuture) {
        if (!att || att.status === 'present') color = '#4CAF50'; // arrived (default)
        else if (att.status === 'absent')         color = '#F44336'; // no-show
        else if (att.status === 'planned_absent') color = '#BDBDBD'; // notified absent
        else if (att.status === 'replaced_out')   color = '#E0E0E0'; // replaced
      }
      beds.push(color);
    });
    replacements.forEach(() => beds.push('#FF9800')); // replacement client
    for (let i = 0; i < emptyBeds; i++) beds.push('#E8E8E8'); // empty slot
    return beds.slice(0, MAX_BEDS);
  }

  const beds = renderBeds();

  return (
    <TouchableOpacity
      style={[styles.card, isToday && styles.cardToday]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.summary}>
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
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function LessonsScreen() {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();
  const listRef = useRef(null);
  const scrollTargetIdxRef = useRef(0);

  // Refresh every time the screen comes into focus (returning from LessonDetailScreen
  // means attendance may have changed via pre-seeding or manual toggles)
  useFocusEffect(useCallback(() => { fetchData(); }, []));

  async function fetchData() {
    setLoading(true);
    const today = new Date();
    const now = new Date();
    const from = new Date(today); from.setDate(today.getDate() - 30);
    const to = new Date(today); to.setDate(today.getDate() + 14);

    const [studioSchedule, slotsRes, attRes] = await Promise.all([
      fetchSchedule(),
      supabase.from('client_slots').select('client_id, day_of_week, time_slot, clients(id, name)'),
      supabase.from('attendance')
        .select('id, lesson_date, time_slot, client_id, status, paid, clients(id, name)')
        .gte('lesson_date', toDateStr(from))
        .lte('lesson_date', toDateStr(to)),
    ]);

    const slots = slotsRes.data || [];
    const att = attRes.data || [];

    // Normalize keys: lesson_date may arrive as 'YYYY-MM-DDT...' (TIMESTAMPTZ) and
    // time_slot may arrive as 'HH:MM:SS' (TIME column) — slice to canonical forms.
    const attMap = {};
    att.forEach(a => {
      const key = `${String(a.lesson_date).slice(0, 10)}_${String(a.time_slot).slice(0, 5)}`;
      if (!attMap[key]) attMap[key] = [];
      attMap[key].push(a);
    });

    const todayStr = toDateStr(today);
    const generated = [];

    for (let i = -30; i <= 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const dateStr = toDateStr(d);
      const dow = d.getDay();
      if (dow === 6) continue;

      for (const { start_time: ts, end_time: te } of getSlotsForDay(studioSchedule, dow)) {
        const regular = slots.filter(s => s.day_of_week === dow && s.time_slot === ts);
        const key = `${dateStr}_${ts}`;
        const lessonAtt = attMap[key] || [];
        const regularIds = new Set(regular.map(s => s.client_id));
        const hasReplacements = lessonAtt.some(a => !regularIds.has(a.client_id));

        if (regular.length === 0 && !hasReplacements) continue;

        const [h, m] = ts.split(':').map(Number);
        const lessonDt = new Date(d); lessonDt.setHours(h, m, 0, 0);

        let lessonEndDt;
        if (te) {
          const [eh, em] = te.split(':').map(Number);
          lessonEndDt = new Date(d); lessonEndDt.setHours(eh, em, 0, 0);
        } else {
          lessonEndDt = new Date(lessonDt.getTime() + 60 * 60 * 1000);
        }

        generated.push({
          id: key,
          date: dateStr,
          dayOfWeek: dow,
          timeSlot: ts,
          isFuture: lessonDt > now,
          isActive: lessonDt <= now && now < lessonEndDt,
          regularClients: regular,
          attendance: lessonAtt,
        });
      }
    }

    // Find scroll target index within the flat items array (includes dividers)
    const flat = buildFlatItems(generated);
    const activeIdx  = flat.findIndex(it => it.type === 'lesson' && it.isActive);
    const todayIdx   = flat.findIndex(it => it.type === 'lesson' && it.date === todayStr);
    const futureIdx  = flat.findIndex(it => it.type === 'lesson' && it.isFuture);
    scrollTargetIdxRef.current =
      activeIdx  >= 0 ? activeIdx  :
      todayIdx   >= 0 ? todayIdx   :
      Math.max(0, futureIdx);

    setLessons(generated);
    setLoading(false);
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

  const items = buildFlatItems(lessons);

  return (
    <View style={{ flex: 1, backgroundColor: '#F0EEF8' }}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={item => item.id}
        renderItem={({ item }) => {
          if (item.type === 'divider') {
            return <DayDivider date={item.date} dayOfWeek={item.dayOfWeek} />;
          }
          return (
            <LessonRow
              lesson={item}
              onPress={() => navigation.navigate('LessonDetail', {
                date: item.date,
                timeSlot: item.timeSlot,
                dayOfWeek: item.dayOfWeek,
              })}
            />
          );
        }}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
        onLayout={() => {
          const idx = scrollTargetIdxRef.current;
          if (idx > 0) {
            listRef.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0.5 });
          }
        }}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => listRef.current?.scrollToIndex({
            index, animated: false, viewPosition: 0.5,
          }), 300);
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
  chevron: { fontSize: 18, color: '#BDBDBD', marginLeft: 4 },

  bedRow: { flexDirection: 'row', gap: 4 },
  bed: { width: 18, height: 10, borderRadius: 3 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#555' },
  emptyHint: { fontSize: 14, color: '#999', marginTop: 6 },

  dayDivider: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 16, marginBottom: 4, marginHorizontal: 4,
  },
  dayDividerLine: { flex: 1, height: 1, backgroundColor: '#E0E0E0' },
  dayDividerLabel: { fontSize: 12, color: '#888', fontWeight: '500', marginHorizontal: 10 },
  dayDividerLabelToday: { color: '#FF9800', fontWeight: '700' },
});
