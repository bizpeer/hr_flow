const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY);

async function enableRealtime() {
  console.log('Enabling Realtime for tables...');
  
  // To enable realtime, we need to add the tables to the supabase_realtime publication
  // Since we don't have a direct "enable realtime" method in the JS SDK, 
  // we execute SQL through a RPC or just inform that it needs to be done.
  // Actually, standard way is to use the SQL editor, but I can try to run SQL through a helper if available.
  
  const sql = `
    DO $$ 
    BEGIN 
      IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
      END IF;
    END $$;

    ALTER PUBLICATION supabase_realtime ADD TABLE leave_requests;
    ALTER PUBLICATION supabase_realtime ADD TABLE expense_requests;
    ALTER PUBLICATION supabase_realtime ADD TABLE overtime_requests;
  `;

  // Note: Most Supabase projects have 'supabase_realtime' publication by default.
  // The JS SDK doesn't have a direct 'sql' method. I should have used the MCP tool if it worked.
  // However, I can try to 'upsert' to a dummy table to trigger something? No.
  
  console.log('Please ensure the following SQL is run in the Supabase SQL Editor:');
  console.log(sql);
  
  // I will attempt to run it via the MCP execute_sql again, maybe it was a transient error or I can use the service key in a different way.
  // Actually I cannot "use" service key with MCP.
}

enableRealtime();
