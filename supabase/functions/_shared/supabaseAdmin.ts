/**
 * Supabase Admin クライアント（サービスロール）
 * Edge Functions 内で DB 操作を行うために使用
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export function getSupabaseAdmin() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}

/**
 * サービスロールキーを使用したSupabaseクライアント（エイリアス）
 */
export function createSupabaseAdmin() {
  return getSupabaseAdmin()
}

/**
 * ユーザーの認証トークンを使用したSupabaseクライアント
 */
export function createSupabaseClient(authHeader: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: { Authorization: authHeader },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
