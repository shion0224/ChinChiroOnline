import { supabase } from './supabase'

/**
 * 匿名認証でサインインする
 * 既にセッションがある場合はそのまま返す
 * @returns {Promise<{user: object, session: object}>}
 */
export async function signInAnonymously() {
  // 既存セッションを確認
  const { data: { session } } = await supabase.auth.getSession()
  if (session) {
    return { user: session.user, session }
  }

  // 匿名サインイン
  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) {
    throw new Error(`匿名認証に失敗しました: ${error.message}`)
  }

  return { user: data.user, session: data.session }
}

/**
 * 現在のユーザーを取得
 * @returns {Promise<object|null>}
 */
export async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/**
 * 認証トークンを取得（Edge Function呼び出し用）
 * @returns {Promise<string>}
 */
export async function getAuthToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    throw new Error('認証されていません')
  }
  return session.access_token
}
