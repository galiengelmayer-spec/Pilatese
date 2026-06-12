import { useState, useEffect } from 'react';
import { supabase } from './supabase';

const DEFAULT_TIME_SLOTS = ['07:30', '08:30', '09:30', '17:00', '18:00', '19:00', '20:00'];
const DEFAULT_END_MAP = {
  '07:30': '08:30', '08:30': '09:30', '09:30': '10:30',
  '17:00': '18:00', '18:00': '19:00', '19:00': '20:00', '20:00': '21:00',
};

export const FALLBACK_SCHEDULE = Array.from({ length: 6 }, (_, day) =>
  DEFAULT_TIME_SLOTS.map(start => ({
    id: `default-${day}-${start}`,
    day_of_week: day,
    start_time: start,
    end_time: DEFAULT_END_MAP[start],
  }))
).flat();

export async function fetchSchedule() {
  try {
    const { data, error } = await supabase
      .from('studio_schedule')
      .select('*')
      .order('day_of_week', { ascending: true })
      .order('start_time', { ascending: true });
    if (error || !data?.length) return FALLBACK_SCHEDULE;
    return data;
  } catch {
    return FALLBACK_SCHEDULE;
  }
}

export function getSlotsForDay(schedule, dayOfWeek) {
  const slots = schedule.filter(s => s.day_of_week === dayOfWeek);
  return slots.length ? slots : FALLBACK_SCHEDULE.filter(s => s.day_of_week === dayOfWeek);
}

export function useStudioSchedule() {
  const [schedule, setSchedule] = useState(FALLBACK_SCHEDULE);
  const [loading, setLoading] = useState(true);

  async function load() {
    const data = await fetchSchedule();
    setSchedule(data);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  return { schedule, loading, refetch: load };
}
