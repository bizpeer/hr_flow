const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Environment variables NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupStorage() {
  console.log('--- Setting up Supabase Storage ---');
  
  // 1. Create bucket 'receipts'
  const { data, error } = await supabase.storage.createBucket('receipts', {
    public: true, // 퍼블릭 읽기 권한 권장
    allowedMimeTypes: ['image/png', 'image/jpeg', 'application/pdf', 'application/octet-stream'],
    fileSizeLimit: 5242880 // 5MB
  });

  if (error) {
    if (error.message.includes('already exists')) {
      console.log('Bucket "receipts" already exists.');
    } else {
      console.error('Error creating bucket:', error.message);
      return;
    }
  } else {
    console.log('Bucket "receipts" created successfully.');
  }

  console.log('Storage setup complete.');
}

setupStorage();
