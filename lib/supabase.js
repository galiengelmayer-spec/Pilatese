import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://fdcurjtwyqidfrqhmhmg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ZBk5LRF9_RyfxfjSXuxFBw_1fLza4sk';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
