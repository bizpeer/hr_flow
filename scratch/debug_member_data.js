const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// .env 로드
dotenv.config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Error: Required environment variables are missing.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function debugAllData() {
  console.log('--- 🔍 데이터 정밀 진단 시작 ---');

  // 1. 프로필 샘플 확인 (member 중 한 명)
  const { data: profiles, error: pError } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'member')
    .limit(5);

  if (pError) console.error('Profile Fetch Error:', pError);
  
  if (profiles && profiles.length > 0) {
    for (const profile of profiles) {
      console.log(`\n👤 [사용자] ${profile.full_name} (${profile.email})\n   ID: ${profile.id}\n   CompanyID: ${profile.company_id}`);

      // 2. 해당 사용자의 지출결의 확인
      const { data: expenses, error: exError } = await supabase
        .from('expense_requests')
        .select('*')
        .eq('user_id', profile.id);
      
      console.log(`   🔸 지출결의 내역: ${expenses?.length || 0}건`);
      if (expenses && expenses.length > 0) {
        expenses.slice(0, 2).forEach(ex => {
          console.log(`      - [${ex.expense_date}] ${ex.description}: ${ex.amount}원 (CompanyID: ${ex.company_id})`);
        });
      }

      // 3. 해당 사용자의 휴가신청 확인
      const { data: leaves, error: lvError } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('user_id', profile.id);
      
      console.log(`   🔸 휴가신청 내역: ${leaves?.length || 0}건`);
      if (leaves && leaves.length > 0) {
        leaves.slice(0, 2).forEach(lv => {
          console.log(`      - [${lv.start_date} ~ ${lv.end_date}] ${lv.reason} (CompanyID: ${lv.company_id})`);
        });
      }
    }
  } else {
    console.log('No member profiles found.');
  }

  // 4. 테이블에 전체 데이터가 있는지 확인 (company_id가 null인 경우가 있는지)
  const { count: expenseCount } = await supabase.from('expense_requests').select('*', { count: 'exact', head: true });
  const { count: leaveCount } = await supabase.from('leave_requests').select('*', { count: 'exact', head: true });
  const { count: nullCompanyEx } = await supabase.from('expense_requests').select('*', { count: 'exact', head: true }).is('company_id', null);

  console.log('\n--- 📊 전체 요약 ---');
  console.log(`전체 지출결의: ${expenseCount}건 (CompanyID null: ${nullCompanyEx}건)`);
  console.log(`전체 휴가신청: ${leaveCount}건`);
  
  console.log('\n📅 현재 서버 시간:', new Date().toISOString());
}

debugAllData();
