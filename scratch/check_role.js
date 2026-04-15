const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function checkMyRole() {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: process.env.system_admin_id,
    password: process.env.system_admin_pw,
  });

  if (authError) {
    console.error('Login failed:', authError.message);
    return;
  }

  const { user } = authData;
  console.log('User Email:', user.email);
  console.log('User Metadata Role:', user.user_metadata?.role);
}

checkMyRole();
