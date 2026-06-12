import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import SlidePanel from '../components/SlidePanel';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MAX_BEDS = 6;

export default function LessonDetailScreen() {
  const { params } = useRoute();
  const { date, timeSlot, dayOfWeek } = params;

  const [regularClients, setRegularClients] = useState([]);
  const [attendanceRecs, setAttendanceRecs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Compute locally so the value is always fresh on screen open
  const lessonDt = new Date(`${date}T${timeSlot}:00`);
  const isFuture = lessonDt > new Date();

  const dateObj = new Date(date + 'T12:00:00');
  const dateLabel = dateObj.toLocaleDateString('he-IL', {
    day: 'numeric', month: 'numeric', year: 'numeric',
  });
  const title = `${timeSlot}  ·  יום ${DAY_NAMES[dayOfWeek]} ${dateLabel}`;

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [slotsRes, attRes] = await Promise.all([
      supabase
        .from('client_slots')
        .select('client_id, clients(id, name)')
        .eq('day_of_week', dayOfWeek)
        .eq('time_slot', timeSlot),
      supabase
        .from('attendance')
        .select('id, client_id, status, paid, clients(id, name)')
        .eq('lesson_date', date)
        .eq('time_slot', timeSlot),
    ]);
    setRegularClients(slotsRes.data || []);
    setAttendanceRecs(attRes.data || []);
    setLoading(false);
  }

  // Build lookup map: client_id → attendance record
  const attMap = {};
  attendanceRecs.forEach(a => { attMap[a.client_id] = a; });

  const regularIds = new Set(regularClients.map(cs => cs.client_id));
  const replacements = attendanceRecs.filter(a => !regularIds.has(a.client_id));
  const emptyBeds = Math.max(0, MAX_BEDS - regularClients.length - replacements.length);
  const presentCount = attendanceRecs.filter(
    a => a.status === 'present' || a.status === 'replacement'
  ).length;

  return (
    <SlidePanel title={title}>
      {loading ? (
        <ActivityIndicator color="#6C63FF" style={{ marginTop: 40 }} />
      ) : (
        <>
          {!isFuture && (
            <Text style={styles.summaryLine}>{presentCount} מתוך {MAX_BEDS} הגיעו</Text>
          )}

          {regularClients.map(cs => {
            const att = attMap[cs.client_id];
            let icon = '○', iconColor = '#BDBDBD', nameStyle = {};
            if (!isFuture) {
              if (!att) { icon = '?'; iconColor = '#FFB300'; }
              else if (att.status === 'present')  { icon = '✓'; iconColor = '#4CAF50'; }
              else if (att.status === 'absent')   { icon = '✗'; iconColor = '#F44336'; nameStyle = styles.strikethrough; }
              else if (att.status === 'planned_absent') { icon = '–'; iconColor = '#BDBDBD'; }
              else if (att.status === 'replaced_out')   { icon = '✗'; iconColor = '#BDBDBD'; nameStyle = styles.strikethrough; }
            }
            return (
              <View key={cs.client_id} style={styles.clientRow}>
                <Text style={[styles.rowIcon, { color: iconColor }]}>{icon}</Text>
                <Text style={[styles.clientName, nameStyle]}>{cs.clients?.name}</Text>
                {att?.paid && <Text style={styles.paidBadge}>₪</Text>}
              </View>
            );
          })}

          {replacements.map(a => (
            <View key={a.client_id} style={[styles.clientRow, styles.replacementRow]}>
              <Text style={[styles.rowIcon, { color: '#FF9800' }]}>⇄</Text>
              <Text style={styles.clientName}>{a.clients?.name}</Text>
              {a.paid && <Text style={styles.paidBadge}>₪</Text>}
            </View>
          ))}

          {Array.from({ length: emptyBeds }).map((_, i) => (
            <View key={`empty-${i}`} style={styles.clientRow}>
              <Text style={[styles.rowIcon, { color: '#E0E0E0' }]}>○</Text>
              <Text style={styles.emptySlot}>פנוי</Text>
            </View>
          ))}
        </>
      )}
    </SlidePanel>
  );
}

const styles = StyleSheet.create({
  summaryLine: {
    fontSize: 13, color: '#888', textAlign: 'right', marginBottom: 12,
  },
  clientRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    padding: 14, marginBottom: 8, gap: 10,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  replacementRow: { backgroundColor: '#FFF8F0' },
  rowIcon: { fontSize: 16, width: 24, textAlign: 'center' },
  clientName: { flex: 1, fontSize: 15, color: '#333', fontWeight: '500' },
  strikethrough: { textDecorationLine: 'line-through', color: '#bbb' },
  paidBadge: { fontSize: 12, color: '#4CAF50', fontWeight: 'bold' },
  emptySlot: { fontSize: 14, color: '#BDBDBD', fontStyle: 'italic' },
});
