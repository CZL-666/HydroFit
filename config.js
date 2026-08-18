const SUPABASE_URL = "https://mtvoqthetdnaboqounhi.supabase.co";
const SUPABASE_KEY = "sb_publishable_rDfjD2F-3TybZ6h-dnrPlQ_GJLs8xzu";
const WATER_TABLE = "daily_water_records";
const WORKOUT_TABLE = "daily_workout_records";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
