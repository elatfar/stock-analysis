import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://lqyvelxkllydugnwxoou.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_v7PcAVgzwUF0jQ2ZJLe-wg_SfoZk72m';

export const supabase = createClient(supabaseUrl, supabaseKey);
