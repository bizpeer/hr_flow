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
    } else if (action === 'update-role') {
      const { newRole } = body;
      if (!newRole) {
        return new Response(JSON.stringify({ error: 'New role is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      console.log(`Updating role to ${newRole} for user: ${userId}`);

      // 1. Update Auth Metadata
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: { role: newRole }
      });

      if (authError) {
        console.error('Auth Role Update Error:', authError);
        return new Response(JSON.stringify({ error: authError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // 2. Update Profile Table
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (profileError) {
        console.error('Profile Role Update Error:', profileError);
        return new Response(JSON.stringify({ error: profileError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      return new Response(JSON.stringify({ success: true, message: `Role updated to ${newRole}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } else if (action === 'delete-user') {
      console.log(`Deleting user: ${userId}`);

      // 1. Delete From Auth
      const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(userId);
      if (authError) {
        console.error('Auth Delete Error:', authError);
        return new Response(JSON.stringify({ error: authError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // 2. Profile will be deleted by Cascade or Manual if needed
      // (Supabase standard suggests Profiles usually follow Auth if set up with FK Cascade)
      
      return new Response(JSON.stringify({ success: true, message: 'User deleted from Auth and DB' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });

    } else if (action === 'delete-company') {
      const { companyId } = body;
      if (!companyId) {
        return new Response(JSON.stringify({ error: 'companyId is required' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      console.log(`Deleting company ${companyId} and all its users...`);

      // 1. Find all users of this company
      const { data: users, error: fetchError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('company_id', companyId);

      if (fetchError) {
        console.error('Fetch Users Error:', fetchError);
        return new Response(JSON.stringify({ error: fetchError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      // 2. Delete each user from Auth
      if (users && users.length > 0) {
        for (const user of users) {
          console.log(`Deleting Auth user: ${user.id}`);
          const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(user.id);
          if (delErr) {
            console.warn(`Failed to delete auth user ${user.id}:`, delErr.message);
          }
        }
      }

      // 3. Finally delete the company row (This triggers cascade delete in DB)
      const { error: companyError } = await supabaseAdmin
        .from('companies')
        .delete()
        .eq('id', companyId);

      if (companyError) {
        console.error('Company Delete Error:', companyError);
        return new Response(JSON.stringify({ error: companyError.message }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        });
      }

      return new Response(JSON.stringify({ success: true, message: 'Company and all associated users deleted successfully' }), {
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
