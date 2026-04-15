const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testEdgeFunction() {
  console.log('--- Testing register-staff Edge Function ---');
  
  // 1. Sign in as admin first (to get a JWT)
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: process.env.system_admin_id,
    password: process.env.system_admin_pw,
  });

  if (authError) {
    console.error('Login failed:', authError.message);
    return;
  }

  const { session } = authData;
  console.log('Login successful. JWT obtained.');

  // 2. Invoke the function
  const staffData = {
    email: `test_user_${Math.random().toString(36).substring(7)}@example.com`,
    fullName: 'Test User',
    tempPassword: 'password123',
    role: 'member',
    companyId: '76807ea7-30e7-497d-aa5b-01c3858c4228', // Dummy or known ID
    hireDate: '2026-04-16'
  };

  console.log('Invoking function...');
  const { data, error } = await supabase.functions.invoke('register-staff', {
    body: staffData,
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  });

  if (error) {
    console.error('Function execution failed:', error.message);
    if (error.context) {
        try {
            const body = await error.context.json();
            console.error('Response Body:', body);
        } catch(e) {}
    }
  } else {
    console.log('Function result:', data);
  }
}

testEdgeFunction();
