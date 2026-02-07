import { supabase } from './supabase'

/**
 * Edge Functionを呼び出すユーティリティ
 * 認証トークンを自動的に付与する
 *
 * @param {string} functionName - Edge Function名
 * @param {object} body - リクエストボディ
 * @returns {Promise<object>} レスポンスデータ
 */
export async function invokeEdgeFunction(functionName, body = {}) {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body,
  })

  if (error) {
    // Edge Functionからのエラーレスポンスを解析
    let message = error.message || 'Edge Function の呼び出しに失敗しました'
    if (error.context?.body) {
      try {
        const errorBody = typeof error.context.body === 'string'
          ? JSON.parse(error.context.body)
          : error.context.body
        if (errorBody.error) {
          message = errorBody.error
        }
      } catch {
        // パース失敗は無視
      }
    }
    throw new Error(message)
  }

  // Edge Functionがエラーを返した場合
  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}
