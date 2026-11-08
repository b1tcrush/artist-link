import { createClient } from '@supabase/supabase-js';
// Browser client: anon key only. RLS is the real security boundary.
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
