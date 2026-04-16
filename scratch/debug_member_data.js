const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkRLS() {
  const { data, error } = await supabase.rpc('get_policies'); // If such function exists, usually not.
  
  // Alternative: query pg_policies directly via raw SQL if we have a way.
  // Since we don't have a reliable way to run raw SQL with service role via tool right now (MCP failed),
  // I will just read the migrations if they exist.
}

async function debugData() {
  const { data: memberProfile, error: pError } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'member')
    .limit(1)
    .single();

  if (memberProfile) {
    console.log('Member profile found:', memberProfile.id, memberProfile.full_name);
    
    const { data: expenses, error: eError } = await supabase
      .from('expense_requests')
      .select('*')
      .eq('user_id', memberProfile.id);
      
    console.log(`Expenses for ${memberProfile.full_name}:`, expenses?.length || 0);
    if (eError) console.error('Expense fetch error:', eError);
  }
}

debugData();
