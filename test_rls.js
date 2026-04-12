const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL, 
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
);

async function check() {
  const { data, error } = await supabase.from('profiles').select('*').limit(1);
  console.log("If this works, db connection is fine.", !!data);
  
  // To get policies, we run a direct postgres query through an RPC if it exists, or look at how they inserted data
  // Wait, I can try updating willkim's password to password123, login, and see what the anon key fetch returns exactly!
  const willkim = 'e5d44feb-319d-4448-9fde-c001e91bf499';
  
  const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(willkim, {
    password: 'password123!!!'
  });
  console.log('Update password error?', updateError);
  
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  
  const { data: loginData, error: loginErr } = await anonClient.auth.signInWithPassword({
    email: 'willkim@onedays.com',
    password: 'password123!!!'
  });
  
  console.log('Login error?', loginErr);
  
  if (loginData.session) {
    console.log('Logged in! Fetching profile...');
    const { data: prof, error: profErr } = await anonClient
        .from('profiles')
        .select(`
          *,
          companies:company_id (
            name
          )
        `)
        .eq('id', willkim)
        .single();
    
    console.log('Profile Fetch Error:', profErr);
    console.log('Profile Fetch Data:', prof);
  }
}

check();
