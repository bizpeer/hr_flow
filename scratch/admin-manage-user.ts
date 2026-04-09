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

    const { action, userId, tempPassword } = await req.json()

    if (action === 'reset-password') {
      // 1. Auth 비밀번호 업데이트 (서비스 롤 사용)
      const { error: authError } = await supabaseClient.auth.admin.updateUserById(
        userId,
        { password: tempPassword }
      )
      if (authError) throw authError

      // 2. 비밀번호 변경 강제 플래그 설정
      const { error: profileError } = await supabaseClient
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', userId)

      if (profileError) throw profileError

      return new Response(
        JSON.stringify({ message: "Password reset successfully" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    throw new Error('Unsupported action')

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
