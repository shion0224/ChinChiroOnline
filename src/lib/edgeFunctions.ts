import { supabase } from './supabase'

/**
 * Edge Functionを呼び出すユーティリティ
 * 認証トークンを自動的に付与する
 */
export async function invokeEdgeFunction<T = Record<string, unknown>>(
  functionName: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    body,
  })

  if (error) {
    // Edge Functionからのエラーレスポンスを解析
    let message = error.message || 'Edge Function の呼び出しに失敗しました'
    const ctx = error as unknown as { context?: { body?: unknown } }
    if (ctx.context?.body) {
      try {
        const errorBody =
          typeof ctx.context.body === 'string'
            ? JSON.parse(ctx.context.body)
            : ctx.context.body
        if (errorBody?.error) {
          message = errorBody.error
        }
      } catch {
        // パース失敗は無視
      }
    }
    throw new Error(message)
  }

  // Edge Functionがエラーを返した場合
  const dataObj = data as Record<string, unknown> | null
  if (dataObj?.error) {
    throw new Error(String(dataObj.error))
  }

  return data as T
}
