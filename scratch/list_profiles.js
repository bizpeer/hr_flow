const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);

async function listAdminProfiles() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('email', 'bizpeer@gmail.com');

  if (error) {
    console.error('DB Fetch Error:', error.message);
    return;
  }

  console.log('--- Profiles found for bizpeer@gmail.com ---');
  console.log(JSON.stringify(data, null, 2));
}

listAdminProfiles();
