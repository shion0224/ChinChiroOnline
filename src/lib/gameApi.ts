/**
 * ゲームAPI層
 * Supabase Edge Functionsを呼び出すヘルパー関数群
 */
import { supabase } from './supabase'
import type { RollDiceResponse, SettleRoundResponse } from '../types/database'

/**
 * Edge Functionを呼び出す汎用ヘルパー
 */
async function callEdgeFunction<T = Record<string, unknown>>(
  functionName: string,
  params: Record<string, unknown>
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(functionName, {
    body: params,
  })

  if (error) {
    const message = error.message || 'サーバーエラーが発生しました'
    throw new Error(message)
  }

  const dataObj = data as Record<string, unknown> | null
  if (dataObj?.error) {
    throw new Error(String(dataObj.error))
  }

  return data as T
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
