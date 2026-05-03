const SUPABASE_URL = 'https://pdsppgedfzwytogpnmrh.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_3kFnGcu2H-sUDFLXyt2bcA_PJGuNus4';

// Initialize Supabase client if keys are provided
window.supabaseClient = null;
if (SUPABASE_URL && typeof window.supabase !== 'undefined') {
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
