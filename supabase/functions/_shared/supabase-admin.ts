import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * サービスロールキーを使用したSupabaseクライアント
 * Edge Functions内でRLSをバイパスしてDB操作を行う
 */
export function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
