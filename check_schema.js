const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  try {
    const { data, error } = await supabase
      .from('divisions')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('Error fetching divisions:', error);
    } else {
      console.log('Divisions Sample Data:', data);
      if (data && data.length > 0) {
          console.log('Columns:', Object.keys(data[0]));
      } else {
          console.log('No divisions found to check columns.');
      }
    }
  } catch (err) {
    console.error('Unexpected error:', err);
  }
}

checkSchema();
