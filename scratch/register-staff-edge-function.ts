import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { email, fullName, department, position, tempPassword, companyId } = await req.json()

    // 1. Auth 계정 생성 (서비스 롤 사용)
    const { data: userData, error: authError } = await supabaseClient.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: fullName }
    })

    if (authError) throw authError

    // 2. 프로필 등록 (must_change_password 플래그와 함께)
    const { error: profileError } = await supabaseClient
      .from('profiles')
      .insert([
        {
          id: userData.user.id,
          full_name: fullName,
          role: 'member',
          company_id: companyId,
          department,
          position,
          must_change_password: true
        }
      ])

    if (profileError) throw profileError

    return new Response(
      JSON.stringify({ message: "Staff registered successfully" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
