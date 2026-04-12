const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function testAsUser(email) {
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL, 
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY
  );
  
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  // Get user id for top@kwavem.com
  const { data: { users }, error: userError } = await adminClient.auth.admin.listUsers();
  const testUser = users.find(u => u.email === email);
  
  if (!testUser) {
    console.log("User not found:", email);
    return;
  }

  console.log(`Testing as ${email} (ID: ${testUser.id})`);

  // We can't easily sign in without password, but we can verify the profile exists via service role
  const { data: profileSrv } = await adminClient.from('profiles').select('*').eq('id', testUser.id).single();
  console.log("Profile (Service Role):", profileSrv);

  // Now let's try to see if we can find any RLS policies
  // Unfortunately we can't easily check RLS policies from the client without an RPC.
  
  // BUT, we can check if there's any obvious issue like missing company_id.
}

testAsUser('top@kwavem.com');
testAsUser('willkim@onedays.com');
