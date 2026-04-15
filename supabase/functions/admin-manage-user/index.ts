import { createClient } from "supabase";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
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

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // --- 수동 권한 검증 로직 시작 ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authentication required');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized', details: authError?.message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    // 관리자 또는 시스템 관리자 권한 확인
    let userRole = (user.user_metadata?.role || '').toLowerCase();
    
    if (!userRole) {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      if (profile) userRole = profile.role.toLowerCase();
    }

    if (!['super_admin', 'admin', 'system_admin'].includes(userRole)) {
      console.error(`Access Forbidden: User ${user.email} with role ${userRole}`);
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }
    // --- 수동 권한 검증 로직 종료 ---

    const body = await req.json();
    const { action, userId, tempPassword, newRole, companyId } = body;

    console.log(`Action: ${action}, targetUserId: ${userId} by admin: ${user.email}`);

    if (action === 'reset-password') {
      if (!userId || !tempPassword) throw new Error('Missing userId or new password');
      
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: tempPassword,
      });
      if (authError) throw authError;

      await supabaseAdmin.from('profiles').update({ must_change_password: true }).eq('id', userId);
      
      return new Response(JSON.stringify({ success: true, message: 'Password reset successful' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'update-role') {
      if (!userId || !newRole) throw new Error('Missing userId or new role');

      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { role: newRole }
      });
      if (authError) throw authError;

      const { error: profileError } = await supabaseAdmin.from('profiles').update({ role: newRole }).eq('id', userId);
      if (profileError) throw profileError;

      return new Response(JSON.stringify({ success: true, message: `Role updated to ${newRole}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'delete-user') {
      if (!userId) throw new Error('Missing userId');
      
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authError) throw authError;

      return new Response(JSON.stringify({ success: true, message: 'User deleted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else if (action === 'delete-company') {
      if (!companyId) throw new Error('Missing companyId');

      const { data: users } = await supabaseAdmin.from('profiles').select('id').eq('company_id', companyId);
      if (users) {
        for (const u of users) {
          await supabaseAdmin.auth.admin.deleteUser(u.id);
        }
      }

      const { error: companyError } = await supabaseAdmin.from('companies').delete().eq('id', companyId);
      if (companyError) throw companyError;

      return new Response(JSON.stringify({ success: true, message: 'Company and users deleted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } else {
      throw new Error(`Unsupported action: ${action}`);
    }

  } catch (error: any) {
    console.error('Action Error:', error.message);
    return new Response(JSON.stringify({ error: error.message || 'Error occurred' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
