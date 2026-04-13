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
      console.error('Missing environment variables: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get request body
    const body = await req.json();
    const { action, userId, tempPassword } = body;

    console.log(`Action: ${action}, userId: ${userId}`);

    if (!action || !userId) {
      return new Response(JSON.stringify({ error: 'Missing required fields: action, userId' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    if (action === 'reset-password') {
      if (!tempPassword) {
        return new Response(JSON.stringify({ error: 'New password is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      console.log(`Attempting password reset for user: ${userId}`);

      // 1. Update User in Auth
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: tempPassword,
      });

      if (authError) {
        console.error('Auth Reset Error:', authError);
        return new Response(JSON.stringify({ error: authError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // 2. Set must_change_password flag
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', userId);

      if (profileError) {
        console.warn('Profile update warning:', profileError);
        // Not a critical failure for the password reset itself
      }

      return new Response(JSON.stringify({ success: true, message: 'Password reset successful' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } else {
      return new Response(JSON.stringify({ error: `Unsupported action: ${action}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

  } catch (error: any) {
    console.error('Detailed Error:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
