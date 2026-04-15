const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);

async function checkTables() {
  const tablesToCheck = ['leave_requests', 'expense_requests', 'overtime_requests', 'profiles', 'companies', 'teams'];
  
  console.log('Checking tables...');
  
  for (const table of tablesToCheck) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .limit(0);
      
    if (error) {
      console.log(`❌ Table "${table}" error: ${error.message} (Code: ${error.code})`);
    } else {
      console.log(`✅ Table "${table}" exists.`);
    }
  }
}

checkTables();
