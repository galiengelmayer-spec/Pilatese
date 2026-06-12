import React, { useEffect, useState } from 'react';
import {
  View, Text, ActivityIndicator, StyleSheet,
  TouchableOpacity, TextInput, FlatList, Alert,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { supabase } from '../lib/supabase';
import SlidePanel from '../components/SlidePanel';

const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
const MAX_BEDS = 6;

function StatusPill({ label, active, color, onPress, loading }) {
  return (
    <TouchableOpacity
      style={[styles.pill, active && { backgroundColor: color, borderColor: color }]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.7}
    >
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function LessonDetailScreen() {
  const { params } = useRoute();
  const { date, timeSlot, dayOfWeek } = params;

  const lessonDt = new Date(`${date}T${timeSlot}:00`);
  const isFuture = lessonDt > new Date();

  const [regularClients, setRegularClients] = useState([]);
  const [attendanceRecs, setAttendanceRecs] = useState([]);
  const [substitutions, setSubstitutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const [unpaidClientIds, setUnpaidClientIds] = useState(new Set());

  const [replaceModal, setReplaceModal] = useState(false);
  const [replacingClientId, setReplacingClientId] = useState(null);
  const [allClients, setAllClients] = useState([]);
  const [clientSearch, setClientSearch] = useState('');
  const [loadingAllClients, setLoadingAllClients] = useState(false);

  const dateObj = new Date(date + 'T12:00:00');
  const dateLabel = dateObj.toLocaleDateString('he-IL', {
    day: 'numeric', month: 'numeric', year: 'numeric',
  });
  const title = `${timeSlot}  ·  יום ${DAY_NAMES[dayOfWeek]} ${dateLabel}`;

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const [slotsRes, attRes, subsRes, unpaidRes] = await Promise.all([
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
      supabase
        .from('substitutions')
        .select('absent_client_id, substitute_client_id')
        .eq('lesson_date', date)
        .eq('time_slot', timeSlot),
      supabase
        .from('payments')
        .select('client_id')
        .eq('status', 'unpaid'),
    ]);

    const regulars = slotsRes.data || [];
    let atts = attRes.data || [];

    // Pre-seed: insert 'present' for regular clients with no attendance record yet.
    // Filters first so it only inserts truly missing rows (no race risk on first open).
    if (!isFuture && regulars.length > 0) {
      const attClientIds = new Set(atts.map(a => a.client_id));
      const missing = regulars.filter(cs => !attClientIds.has(cs.client_id));
      if (missing.length > 0) {
        await supabase.from('attendance').insert(
          missing.map(cs => ({
            lesson_date: date, time_slot: timeSlot,
            client_id: cs.client_id, status: 'present', paid: false,
          }))
        );
        const { data: refreshed } = await supabase
          .from('attendance')
          .select('id, client_id, status, paid, clients(id, name)')
          .eq('lesson_date', date)
          .eq('time_slot', timeSlot);
        atts = refreshed || [];
      }
    }

    setRegularClients(regulars);
    setAttendanceRecs(atts);
    setSubstitutions(subsRes.data || []);
    setUnpaidClientIds(new Set((unpaidRes.data || []).map(p => p.client_id)));
    setLoading(false);
  }

  // Derived maps — recomputed from state on every render
  const attMap = {};
  attendanceRecs.forEach(a => { attMap[a.client_id] = a; });

  const subMap = {}; // absent_client_id → substitute_client_id
  substitutions.forEach(s => { subMap[s.absent_client_id] = s.substitute_client_id; });

  const regularIds = new Set(regularClients.map(cs => cs.client_id));
  const replacementRecs = attendanceRecs.filter(
    a => !regularIds.has(a.client_id) && a.status === 'replacement'
  );
  const presentCount = attendanceRecs.filter(
    a => a.status === 'present' || a.status === 'replacement'
  ).length;
  const emptyBeds = Math.max(0, MAX_BEDS - regularClients.length - replacementRecs.length);

  async function setStatus(clientId, newStatus) {
    if (newStatus === 'replaced_out') {
      setReplacingClientId(clientId);
      setReplaceModal(true);
      setClientSearch('');
      setLoadingAllClients(true);
      const { data } = await supabase.from('clients').select('id, name').order('name');
      setAllClients(data || []);
      setLoadingAllClients(false);
      return;
    }

    const att = attMap[clientId];
    if (!att) return;

    setSavingId(clientId);
    try {
      const substituteId = subMap[clientId];

      // Clicking הגיע or לא הגיע on a replaced-out client undoes the substitution first
      if (att.status === 'replaced_out') {
        if (substituteId) {
          await supabase.from('attendance').delete()
            .eq('lesson_date', date).eq('time_slot', timeSlot).eq('client_id', substituteId);
        }
        await supabase.from('substitutions').delete()
          .eq('lesson_date', date).eq('time_slot', timeSlot).eq('absent_client_id', clientId);
      }

      await supabase.from('attendance').update({ status: newStatus }).eq('id', att.id);

      setAttendanceRecs(prev =>
        prev
          .filter(a => att.status !== 'replaced_out' || a.client_id !== substituteId)
          .map(a => a.client_id === clientId ? { ...a, status: newStatus } : a)
      );
      if (att.status === 'replaced_out') {
        setSubstitutions(prev => prev.filter(s => s.absent_client_id !== clientId));
      }
    } catch (e) {
      Alert.alert('שגיאה', e.message || 'לא ניתן לשמור');
    } finally {
      setSavingId(null);
    }
  }

  async function handleUndo(clientId) {
    const substituteId = subMap[clientId]; // capture before any state changes
    const att = attMap[clientId];
    setSavingId(clientId);
    try {
      if (substituteId) {
        await supabase.from('attendance').delete()
          .eq('lesson_date', date).eq('time_slot', timeSlot).eq('client_id', substituteId);
      }
      await supabase.from('substitutions').delete()
        .eq('lesson_date', date).eq('time_slot', timeSlot).eq('absent_client_id', clientId);
      if (att) {
        await supabase.from('attendance').update({ status: 'present' }).eq('id', att.id);
      }
      setAttendanceRecs(prev =>
        prev
          .filter(a => a.client_id !== substituteId)
          .map(a => a.client_id === clientId ? { ...a, status: 'present' } : a)
      );
      setSubstitutions(prev => prev.filter(s => s.absent_client_id !== clientId));
    } catch (e) {
      Alert.alert('שגיאה', e.message || 'לא ניתן לשמור');
    } finally {
      setSavingId(null);
    }
  }

  async function selectReplacement(substituteClient) {
    setReplaceModal(false);
    const absentId = replacingClientId;
    setReplacingClientId(null);
    setSavingId(absentId);
    try {
      const origAtt = attMap[absentId];
      if (!origAtt) throw new Error('לא נמצאה רשומת נוכחות');

      await supabase.from('attendance').update({ status: 'replaced_out' }).eq('id', origAtt.id);

      const { data: insertedRow, error: subErr } = await supabase
        .from('attendance')
        .insert({
          lesson_date: date, time_slot: timeSlot,
          client_id: substituteClient.id, status: 'replacement', paid: false,
        })
        .select('id')
        .single();
      if (subErr) throw subErr;

      // Build local-state record using the known substituteClient data so the
      // name shows immediately without relying on a join in the INSERT response.
      const subAttRec = {
        id: insertedRow?.id,
        client_id: substituteClient.id,
        status: 'replacement',
        paid: false,
        clients: { id: substituteClient.id, name: substituteClient.name },
      };

      const { error: linkErr } = await supabase.from('substitutions').insert({
        lesson_date: date, time_slot: timeSlot,
        absent_client_id: absentId, substitute_client_id: substituteClient.id,
      });
      if (linkErr) throw linkErr;

      setAttendanceRecs(prev => [
        ...prev.map(a => a.client_id === absentId ? { ...a, status: 'replaced_out' } : a),
        subAttRec,
      ]);
      setSubstitutions(prev => [
        ...prev,
        { absent_client_id: absentId, substitute_client_id: substituteClient.id },
      ]);
    } catch (e) {
      Alert.alert('שגיאה', e.message || 'לא ניתן לשמור');
    } finally {
      setSavingId(null);
    }
  }

  // Clients eligible as replacements: exclude regulars + already-placed replacements
  const replacementExcludes = new Set([
    ...regularClients.map(cs => cs.client_id),
    ...replacementRecs.map(a => a.client_id),
  ]);
  const filteredAllClients = allClients.filter(c =>
    !replacementExcludes.has(c.id) &&
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  return (
    <View style={{ flex: 1 }}>
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
              const status = att?.status;
              const isLoading = savingId === cs.client_id;
              const substituteId = subMap[cs.client_id];
              const substituteName = substituteId
                ? attMap[substituteId]?.clients?.name
                : null;

              return (
                <View key={cs.client_id} style={styles.clientRow}>
                  <View style={styles.clientInfo}>
                    {status === 'planned_absent' && (
                      <Text style={styles.notifiedLabel}>הודיעה</Text>
                    )}
                    <View style={styles.nameRow}>
                      <Text style={[
                        styles.clientName,
                        status === 'replaced_out' && styles.strikethrough,
                      ]}>
                        {cs.clients?.name}
                      </Text>
                      {unpaidClientIds.has(cs.client_id) && (
                        <View style={styles.debtBadge}>
                          <Text style={styles.debtBadgeText}>יתרה לתשלום</Text>
                        </View>
                      )}
                    </View>
                    {status === 'replaced_out' && substituteName && (
                      <Text style={styles.replacedByText}>⇄ {substituteName}</Text>
                    )}
                  </View>

                  {!isFuture && status !== 'replaced_out' && (
                    <View style={styles.pillGroup}>
                      <StatusPill
                        label="הגיע"
                        active={status === 'present'}
                        color="#4CAF50"
                        onPress={() => setStatus(cs.client_id, 'present')}
                        loading={isLoading}
                      />
                      <StatusPill
                        label="לא הגיע"
                        active={status === 'absent'}
                        color="#F44336"
                        onPress={() => setStatus(cs.client_id, 'absent')}
                        loading={isLoading}
                      />
                      <StatusPill
                        label="הוחלף"
                        active={false}
                        color="#FF9800"
                        onPress={() => setStatus(cs.client_id, 'replaced_out')}
                        loading={isLoading}
                      />
                    </View>
                  )}

                  {!isFuture && status === 'replaced_out' && (
                    <TouchableOpacity
                      style={styles.undoBtn}
                      onPress={() => handleUndo(cs.client_id)}
                      disabled={isLoading}
                    >
                      <Text style={styles.undoBtnText}>{isLoading ? '…' : 'בטל'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}

            {replacementRecs.map(a => (
              <View key={a.client_id} style={[styles.clientRow, styles.replacementRow]}>
                <View style={styles.clientInfo}>
                  <Text style={styles.replacementLabel}>מחליפ/ה</Text>
                  <Text style={styles.clientName}>{a.clients?.name}</Text>
                </View>
              </View>
            ))}

            {Array.from({ length: emptyBeds }).map((_, i) => (
              <View key={`empty-${i}`} style={[styles.clientRow, styles.emptyRow]}>
                <Text style={styles.emptySlot}>מקום פנוי</Text>
              </View>
            ))}
          </>
        )}
      </SlidePanel>

      {/* Replacement search — absolute overlay so it stays inside the phone frame */}
      {replaceModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.searchModal}>
            <Text style={styles.searchModalTitle}>בחרי מחליפ/ה</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="חיפוש לפי שם..."
              value={clientSearch}
              onChangeText={setClientSearch}
              textAlign="right"
              autoFocus
            />
            {loadingAllClients ? (
              <ActivityIndicator color="#6C63FF" style={{ marginTop: 20 }} />
            ) : (
              <FlatList
                data={filteredAllClients}
                keyExtractor={item => item.id}
                style={styles.clientList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.clientListItem}
                    onPress={() => selectReplacement(item)}
                  >
                    <Text style={styles.clientListName}>{item.name}</Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <Text style={styles.emptySearch}>לא נמצאו לקוחות</Text>
                }
              />
            )}
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => { setReplaceModal(false); setReplacingClientId(null); }}
            >
              <Text style={styles.cancelBtnText}>ביטול</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  summaryLine: { fontSize: 13, color: '#888', textAlign: 'right', marginBottom: 12 },

  clientRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12,
    padding: 12, marginBottom: 8, gap: 8,
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  replacementRow: { backgroundColor: '#FFF8F0', borderLeftWidth: 3, borderLeftColor: '#FF9800' },
  emptyRow: { backgroundColor: '#FAFAFA' },

  clientInfo: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'flex-end' },
  clientName: { fontSize: 15, color: '#333', fontWeight: '500', textAlign: 'right' },
  debtBadge: {
    backgroundColor: '#FFEBEE', borderRadius: 6,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  debtBadgeText: { fontSize: 10, color: '#E53935', fontWeight: '600' },
  strikethrough: { textDecorationLine: 'line-through', color: '#bbb' },
  notifiedLabel: { fontSize: 10, color: '#888', textAlign: 'right', marginBottom: 1 },
  replacedByText: { fontSize: 11, color: '#FF9800', marginTop: 2, textAlign: 'right' },
  replacementLabel: { fontSize: 10, color: '#FF9800', textAlign: 'right', marginBottom: 1 },
  emptySlot: { fontSize: 14, color: '#BDBDBD', fontStyle: 'italic', flex: 1, textAlign: 'right' },

  pillGroup: { flexDirection: 'row', gap: 4 },
  pill: {
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 20,
    borderWidth: 1, borderColor: '#E0E0E0', backgroundColor: '#F8F8F8',
    alignItems: 'center',
  },
  pillText: { fontSize: 11, color: '#666', fontWeight: '500' },
  pillTextActive: { color: '#fff', fontWeight: '700' },

  undoBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#BDBDBD',
  },
  undoBtnText: { fontSize: 12, color: '#888' },

  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end', zIndex: 200,
  },
  searchModal: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '75%',
  },
  searchModalTitle: {
    fontSize: 18, fontWeight: 'bold', textAlign: 'center', marginBottom: 12, color: '#333',
  },
  searchInput: {
    borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 10,
    padding: 10, fontSize: 15, marginBottom: 8, backgroundColor: '#F8F8F8',
  },
  clientList: { maxHeight: 320 },
  clientListItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  clientListName: { fontSize: 15, color: '#333', textAlign: 'right' },
  emptySearch: { fontSize: 14, color: '#aaa', textAlign: 'center', padding: 20 },
  cancelBtn: { marginTop: 12, padding: 14, alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: '#999' },
});
