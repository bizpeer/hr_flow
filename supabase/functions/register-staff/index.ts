import { createClient } from "supabase";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Server environment configuration error');
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // --- 수동 권한 검증 로직 시작 ---
    // (Gateway의 --no-verify-jwt 옵션을 위해 직접 검증)
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authentication required: Missing Authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error('Manual Auth Error:', authError);
      return new Response(JSON.stringify({ error: 'Unauthorized: Invalid token', details: authError?.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // 관리자 권한 확인 (User Metadata 및 Profiles 테이블 대조)
    let userRole = (user.user_metadata?.role || '').toLowerCase();
    
    if (!userRole) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile) userRole = profile.role.toLowerCase();
    }

    if (!['super_admin', 'admin', 'sub_admin', 'system_admin'].includes(userRole)) {
      console.error(`Access Forbidden: User ${user.email} with role ${userRole} attempted admin action.`);
      return new Response(JSON.stringify({ error: 'Forbidden: Insufficient permissions' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }
    // --- 수동 권한 검증 로직 종료 ---

    const body = await req.json();
    const { 
      email, 
      fullName, 
      tempPassword, 
      role, 
      companyId, 
      residentNumber, 
      address, 
      familyData,
      hireDate,
      position,
      department,
      teamId 
    } = body;

    console.log(`Registering user: ${email} by admin: ${user.email}`);

    // 1. Create User in Auth
    const { data: authData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { 
        full_name: fullName,
        company_id: companyId,
        role: role || 'member'
      }
    });

    if (createUserError) throw createUserError;

    const userId = authData.user.id;

    // 2. Create Profile in public.profiles
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        company_id: companyId,
        email: email,
        full_name: fullName,
        role: (role || 'member').toString().toLowerCase().trim(),
        position: (position || 'Professional').toString().trim(),
        department: (department || 'General').toString().trim(),
        resident_number: residentNumber,
        address: address,
        family_data: familyData || [],
        team_id: teamId || null,
        hire_date: hireDate || null,
        must_change_password: true
      });

    if (profileError) {
      // Cleanup: Auth 유저 생성 후 프로필 실패 시 Auth 유저 삭제 고려 가능
      throw profileError;
    }

    return new Response(JSON.stringify({ success: true, userId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Worker Error:', error.message);
    return new Response(JSON.stringify({ 
      error: error.message || 'Internal processing error',
      code: error.code || 'FUNCTION_ERROR'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
