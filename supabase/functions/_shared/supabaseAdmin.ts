import { createClient } from "@supabase/supabase-js";

/**
 * Service Role キーを使ったSupabaseクライアント（サーバー側専用）
 * RLSをバイパスして全テーブルに直接アクセスできる
 */
export function createSupabaseAdmin() {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}

/**
 * リクエストのJWTからユーザーIDを取得するためのクライアント
 */
export function createSupabaseClient(authHeader: string) {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    {
      global: {
        headers: { Authorization: authHeader },
      },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
