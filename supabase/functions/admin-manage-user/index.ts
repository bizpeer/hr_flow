import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.1.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
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

    // Get request body
    const { action, userId, tempPassword } = await req.json();

    if (!action || !userId) {
      throw new Error('Missing required fields: action, userId');
    }

    // Authorization check could be added here by verifying the JWT from headers
    // But for now, we rely on the client-side logic as requested and Service Role.

    if (action === 'reset-password') {
      if (!tempPassword) throw new Error('New password is required for reset');

      console.log(`Resetting password for user ID: ${userId}`);

      // 1. Update User in Auth (Password only)
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: tempPassword,
      });

      if (authError) throw authError;

      // 2. Set must_change_password flag to true in profiles
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', userId);

      if (profileError) {
        console.warn('Updated password but failed to set must_change_password flag:', profileError);
      }

      return new Response(JSON.stringify({ success: true, message: 'Password reset successful' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } else {
      throw new Error(`Unsupported action: ${action}`);
    }

  } catch (error: any) {
    console.error('Admin Manage User Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
