import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.1.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('Missing environment variables');
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    const { 
      email, 
      fullName, 
      tempPassword, 
      role, 
      companyId, 
      residentNumber, 
      address, 
      familyData,
      position,
      department,
      teamId 
    } = await req.json();

    console.log(`Registering user: ${email} for company: ${companyId}`);

    // 1. Create User in Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { 
        full_name: fullName,
        company_id: companyId,
        role: role || 'member'
      }
    });

    if (authError) throw authError;

    const userId = authData.user.id;

    // 2. Create Profile in public.profiles
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id: userId,
        company_id: companyId,
        email: email,
        full_name: fullName,
        role: role,
        position: position || 'Professional',
        department: department || 'General',
        resident_number: residentNumber,
        address: address,
        family_data: familyData || [],
        team_id: teamId || null,
        must_change_password: true
      });

    if (profileError) {
      // Rollback Auth user if profile creation fails? 
      // For now just throw, but a cleanup would be better in production.
      throw profileError;
    }

    return new Response(JSON.stringify({ success: true, userId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error: any) {
    console.error('Registration Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
