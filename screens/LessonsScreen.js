import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import { fetchSchedule, getSlotsForDay } from '../lib/studioSchedule';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MAX_BEDS = 6;
const INITIAL_BACK = 14;  // days of history on first load
const INITIAL_AHEAD = 14; // days of future on first load
const LOAD_STEP = 14;     // days added per lazy-load trigger

// Item heights used by getItemLayout so scrollToIndex works on web without needing
// to measure the DOM. Values match the StyleSheet below.
const CARD_H    = 80; // summary padding(14*2) + content(~44) + marginBottom(8)
const DIVIDER_H = 38; // marginTop(16) + label(~18) + marginBottom(4)
const LIST_PAD  = 12; // contentContainerStyle top padding

function getItemLayout(data, index) {
  let offset = LIST_PAD;
  for (let i = 0; i < index; i++) {
    offset += data[i]?.type === 'divider' ? DIVIDER_H : CARD_H;
  }
  return {
    length: data[index]?.type === 'divider' ? DIVIDER_H : CARD_H,
    offset,
    index,
  };
}

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function addDays(base, n) {
  const d = new Date(base);
  d.setDate(d.getDate() + n);
  return d;
}

function buildFlatItems(lessonList) {
  const flat = [];
  let lastDate = null;
  for (const lesson of lessonList) {
    if (lesson.date !== lastDate) {
      lastDate = lesson.date;
      flat.push({ type: 'divider', id: `divider-${lesson.date}`, date: lesson.date, dayOfWeek: lesson.dayOfWeek });
    }
    flat.push({ type: 'lesson', ...lesson });
  }
  return flat;
}

// Generates lesson objects for a date range given pre-fetched schedule + slots + attendance.
function generateLessons(fromDate, toDate, schedule, slots, attRecords, now) {
  const attMap = {};
  attRecords.forEach(a => {
    const key = `${String(a.lesson_date).slice(0, 10)}_${String(a.time_slot).slice(0, 5)}`;
    if (!attMap[key]) attMap[key] = [];
    attMap[key].push(a);
  });

  const result = [];
  const cur = new Date(fromDate);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(23, 59, 59, 999);

  while (cur <= end) {
    const dateStr = toDateStr(cur);
    const dow = cur.getDay();
    if (dow !== 6) {
      for (const { start_time: ts, end_time: te } of getSlotsForDay(schedule, dow)) {
        const regular = slots.filter(s => s.day_of_week === dow && s.time_slot === ts);
        const key = `${dateStr}_${ts}`;
        const lessonAtt = attMap[key] || [];
        const regularIds = new Set(regular.map(s => s.client_id));
        const hasReplacements = lessonAtt.some(a => !regularIds.has(a.client_id));
        if (regular.length === 0 && !hasReplacements) continue;

        const [h, m] = ts.split(':').map(Number);
        const lessonDt = new Date(cur); lessonDt.setHours(h, m, 0, 0);
        let lessonEndDt;
        if (te) {
          const [eh, em] = te.split(':').map(Number);
          lessonEndDt = new Date(cur); lessonEndDt.setHours(eh, em, 0, 0);
        } else {
          lessonEndDt = new Date(lessonDt.getTime() + 60 * 60 * 1000);
        }

        result.push({
          id: key,
          date: dateStr,
          dayOfWeek: dow,
          timeSlot: ts,
          isFuture: lessonDt > now,
          isActive: lessonDt <= now && now < lessonEndDt,
          regularClients: regular.slice(0, MAX_BEDS),
          attendance: lessonAtt,
        });
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

function DayDivider({ date, dayOfWeek }) {
  const dateObj = new Date(date + 'T12:00:00');
  const dateLabel = dateObj.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric', year: 'numeric' });
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
  const isToday = date === toDateStr(new Date());

  const attMap = {};
  attendance.forEach(a => { attMap[a.client_id] = a; });
  const regularIds = new Set(regularClients.map(cs => cs.client_id));
  const replacements = attendance.filter(a => !regularIds.has(a.client_id));

  const presentCount = isFuture ? 0 : (
    regularClients.filter(cs => { const att = attMap[cs.client_id]; return !att || att.status === 'present'; }).length
    + replacements.filter(a => a.status === 'replacement').length
  );
  const filledBeds = regularClients.length + replacements.length;
  const emptyBeds = Math.max(0, MAX_BEDS - filledBeds);

  const beds = [];
  regularClients.forEach(cs => {
    const att = attMap[cs.client_id];
    let color = '#BDBDBD';
    if (!isFuture) {
      if (!att || att.status === 'present') color = '#4CAF50';
      else if (att.status === 'absent')         color = '#F44336';
      else if (att.status === 'planned_absent') color = '#BDBDBD';
      else if (att.status === 'replaced_out')   color = '#FF9800';
    }
    beds.push(color);
  });
  replacements.forEach(() => beds.push('#FF9800'));
  for (let i = 0; i < emptyBeds; i++) beds.push('#E8E8E8');

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
            {beds.slice(0, MAX_BEDS).map((c, i) => <View key={i} style={[styles.bed, { backgroundColor: c }]} />)}
          </View>
        </View>
        <View style={styles.summaryRight}>
          <Text style={[styles.dateText, isFuture && styles.dimText]}>
            {isToday ? 'היום' : `יום ${DAY_NAMES[dayOfWeek]}`} {dateLabel}
          </Text>
          {!isFuture && <Text style={styles.countText}>{presentCount}/{MAX_BEDS} הגיעו</Text>}
        </View>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function LessonsScreen() {
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [extendingPast, setExtendingPast] = useState(false);
  const [extendingFuture, setExtendingFuture] = useState(false);

  const navigation = useNavigation();
  const listRef = useRef(null);
  const scrollTargetIdxRef = useRef(0);
  // Fires once per focus to trigger the initial scroll after data loads
  const shouldScrollRef = useRef(true);
  // Tracks the loaded date range so lazy-load extensions know where to start
  const loadedFromRef = useRef(-INITIAL_BACK);
  const loadedToRef = useRef(INITIAL_AHEAD);
  // Cached studio schedule + client slots (rarely change)
  const scheduleRef = useRef(null);
  const slotsRef = useRef([]);

  useFocusEffect(useCallback(() => {
    shouldScrollRef.current = true;
    loadedFromRef.current = -INITIAL_BACK;
    loadedToRef.current = INITIAL_AHEAD;
    fetchData(-INITIAL_BACK, INITIAL_AHEAD);
  }, []));

  async function fetchData(fromDays, toDays) {
    setLoading(true);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const now = new Date();
    const fromDate = addDays(today, fromDays);
    const toDate = addDays(today, toDays);

    const [schedule, slotsRes, attRes] = await Promise.all([
      fetchSchedule(),
      supabase.from('client_slots').select('client_id, day_of_week, time_slot, clients(id, name)'),
      supabase.from('attendance')
        .select('id, lesson_date, time_slot, client_id, status, paid, clients(id, name)')
        .gte('lesson_date', toDateStr(fromDate))
        .lte('lesson_date', toDateStr(toDate)),
    ]);

    scheduleRef.current = schedule;
    slotsRef.current = slotsRes.data || [];

    const generated = generateLessons(fromDate, toDate, schedule, slotsRef.current, attRes.data || [], now);

    const todayStr = toDateStr(today);
    const flat = buildFlatItems(generated);
    const activeIdx = flat.findIndex(it => it.type === 'lesson' && it.isActive);
    const todayIdx  = flat.findIndex(it => it.type === 'lesson' && it.date === todayStr);
    const futureIdx = flat.findIndex(it => it.type === 'lesson' && it.isFuture);
    scrollTargetIdxRef.current =
      activeIdx  >= 0 ? activeIdx  :
      todayIdx   >= 0 ? todayIdx   :
      Math.max(0, futureIdx);

    setLessons(generated);
    setLoading(false);
  }

  async function extendPast() {
    if (extendingPast || !scheduleRef.current) return;
    setExtendingPast(true);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const now = new Date();
    const newFrom = loadedFromRef.current - LOAD_STEP;
    const fromDate = addDays(today, newFrom);
    const toDate = addDays(today, loadedFromRef.current - 1);

    const { data: attData } = await supabase.from('attendance')
      .select('id, lesson_date, time_slot, client_id, status, paid, clients(id, name)')
      .gte('lesson_date', toDateStr(fromDate))
      .lte('lesson_date', toDateStr(toDate));

    const newLessons = generateLessons(fromDate, toDate, scheduleRef.current, slotsRef.current, attData || [], now);
    loadedFromRef.current = newFrom;
    setLessons(prev => {
      const existingIds = new Set(prev.map(l => l.id));
      return [...newLessons.filter(l => !existingIds.has(l.id)), ...prev];
    });
    setExtendingPast(false);
  }

  async function extendFuture() {
    if (extendingFuture || !scheduleRef.current) return;
    setExtendingFuture(true);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const now = new Date();
    const fromDate = addDays(today, loadedToRef.current + 1);
    const newTo = loadedToRef.current + LOAD_STEP;
    const toDate = addDays(today, newTo);

    const { data: attData } = await supabase.from('attendance')
      .select('id, lesson_date, time_slot, client_id, status, paid, clients(id, name)')
      .gte('lesson_date', toDateStr(fromDate))
      .lte('lesson_date', toDateStr(toDate));

    const newLessons = generateLessons(fromDate, toDate, scheduleRef.current, slotsRef.current, attData || [], now);
    loadedToRef.current = newTo;
    setLessons(prev => {
      const existingIds = new Set(prev.map(l => l.id));
      return [...prev, ...newLessons.filter(l => !existingIds.has(l.id))];
    });
    setExtendingFuture(false);
  }

  // Scroll today's lesson to the top of the viewport once after each focus+load.
  // getItemLayout (above) makes scrollToIndex reliable on web.
  useEffect(() => {
    if (loading || lessons.length === 0 || !shouldScrollRef.current) return;
    shouldScrollRef.current = false;
    const idx = scrollTargetIdxRef.current;
    if (idx <= 0) return;
    let raf1, raf2;
    // Show 1 item from yesterday above today rather than starting hard at today
    const scrollIdx = Math.max(0, idx - 2);
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index: scrollIdx, animated: false, viewPosition: 0 });
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [loading, lessons]);

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
      {extendingPast && (
        <View style={styles.loadingBar}>
          <ActivityIndicator size="small" color="#6C63FF" />
          <Text style={styles.loadingBarText}>טוען היסטוריה…</Text>
        </View>
      )}
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={item => item.id}
        getItemLayout={getItemLayout}
        // Prevents scroll jumping when prepending past lessons
        maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
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
        onScroll={({ nativeEvent }) => {
          if (nativeEvent.contentOffset.y < 200 && !extendingPast && !loading) {
            extendPast();
          }
        }}
        scrollEventThrottle={200}
        onEndReached={extendFuture}
        onEndReachedThreshold={0.4}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => listRef.current?.scrollToIndex({
            index, animated: false, viewPosition: 0,
          }), 200);
        }}
        ListFooterComponent={extendingFuture
          ? <ActivityIndicator style={{ marginVertical: 16 }} color="#6C63FF" />
          : null}
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
  summary: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
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
  dayDivider: { flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 4, marginHorizontal: 4 },
  dayDividerLine: { flex: 1, height: 1, backgroundColor: '#E0E0E0' },
  dayDividerLabel: { fontSize: 12, color: '#888', fontWeight: '500', marginHorizontal: 10 },
  dayDividerLabelToday: { color: '#FF9800', fontWeight: '700' },
  loadingBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 6, backgroundColor: '#EDE7F6',
  },
  loadingBarText: { fontSize: 12, color: '#6C63FF' },
});
