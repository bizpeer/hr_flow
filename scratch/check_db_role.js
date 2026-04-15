const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Use service role key to bypass RLS for checking roles
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);

async function debugRoleInDb() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('email', 'bizpeer@gmail.com')
    .single();

  if (error) {
    console.error('DB Fetch Error:', error.message);
    return;
  }

  console.log('--- Profile in DB ---');
  console.log(JSON.stringify(data, null, 2));
}

debugRoleInDb();
