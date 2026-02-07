/**
 * ゲームAPI層
 * Supabase Edge Functionsを呼び出すヘルパー関数群
 */
import { supabase } from './supabase'
import type { RollDiceResponse, SettleRoundResponse } from '../types/database'

/**
 * Edge Functionを呼び出す汎用ヘルパー
 * non-2xx レスポンスから実際のエラーメッセージを抽出する
 */
async function callEdgeFunction<T = Record<string, unknown>>(
  functionName: string,
  params: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    body: params,
  })

  if (error) {
    // non-2xx レスポンスの場合、error.context にレスポンスボディが入っている
    let message = 'サーバーエラーが発生しました'
    try {
      // FunctionsHttpError の context はパース済みのレスポンスボディ
      const ctx = (error as unknown as { context?: unknown }).context
      if (ctx) {
        if (typeof ctx === 'object' && ctx !== null && 'error' in ctx) {
          message = String((ctx as Record<string, unknown>).error)
        } else if (typeof ctx === 'string') {
          try {
            const parsed = JSON.parse(ctx)
            if (parsed?.error) {
              message = parsed.error
            }
          } catch {
            message = ctx
          }
        }
      }
    } catch {
      // パース失敗時はデフォルトメッセージを使用
      if (error.message && !error.message.includes('non-2xx')) {
        message = error.message
      }
    }
    throw new Error(message)
  }

  return data as T
}

// ---- 公開API ----

/**
 * ルームを作成する
 */
export async function createRoom(
  playerName: string,
  roomName: string,
  maxPlayers: number = 4
): Promise<{ roomId: string; roomCode: string; playerId: string; roomName: string; isHost: boolean }> {
  return callEdgeFunction('create-room', { playerName, roomName, maxPlayers })
}

/**
 * ルームに参加する（roomId は UUID または 6文字ルームコード）
 */
export async function joinRoom(
  playerName: string,
  roomId: string
): Promise<{ roomId: string; roomCode: string; playerId: string; roomName: string; isHost: boolean }> {
  return callEdgeFunction('join-room', { playerName, roomId })
}

/**
 * ゲームを開始する（ホスト専用）
 */
export async function startGame(
  roomId: string,
  playerId: string
): Promise<Record<string, unknown>> {
  return callEdgeFunction('start-game', { roomId, playerId })
}

/**
 * ルームから退出する
 */
export async function leaveRoom(
  roomId: string,
  playerId: string
): Promise<Record<string, unknown>> {
  return callEdgeFunction('leave-room', { playerId, roomId })
}

/**
 * 待機中にチップ額を設定する
 */
export async function setChips(
  roomId: string,
  playerId: string,
  chips: number
): Promise<{ success: boolean; playerId: string; chips: number }> {
  return callEdgeFunction('set-chips', { roomId, playerId, chips })
}

/**
 * ベットを配置する（子プレイヤー用）
 */
export async function placeBet(
  roundId: string,
  playerId: string,
  amount: number
): Promise<Record<string, unknown>> {
  return callEdgeFunction('place-bet', { roundId, playerId, amount })
}

/**
 * サイコロを振る
 */
export async function rollDice(
  roundId: string,
  playerId: string
): Promise<RollDiceResponse> {
  return callEdgeFunction<RollDiceResponse>('roll-dice', { roundId, playerId })
}

/**
 * ラウンドを精算する
 */
export async function settleRound(
  roundId: string,
  playerId: string
): Promise<SettleRoundResponse> {
  return callEdgeFunction<SettleRoundResponse>('settle-round', {
    roundId,
    playerId,
  })
}
