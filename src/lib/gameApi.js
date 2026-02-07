/**
 * ゲームAPI層
 * Supabase Edge Functionsを呼び出すヘルパー関数群
 */
import { supabase } from './supabase'

/**
 * Edge Functionを呼び出す汎用ヘルパー
 */
async function callEdgeFunction(functionName, params) {
  const { data, error } = await supabase.functions.invoke(functionName, {
    body: params,
  })

  if (error) {
    // Edge Functionからのエラーレスポンスを処理
    const message = error.message || 'サーバーエラーが発生しました'
    throw new Error(message)
  }

  // Edge Functionが error フィールドを返した場合
  if (data?.error) {
    throw new Error(data.error)
  }

  return data
}

/**
 * ゲームを開始する（ホスト専用）
 * @param {string} roomId - ルームID
 * @param {string} playerId - ホストのプレイヤーID
 */
export async function startGame(roomId, playerId) {
  return callEdgeFunction('start-game', { roomId, playerId })
}

/**
 * ベットを配置する（子プレイヤー用）
 * @param {string} roundId - ラウンドID
 * @param {string} playerId - プレイヤーID
 * @param {number} amount - ベット額
 */
export async function placeBet(roundId, playerId, amount) {
  return callEdgeFunction('place-bet', { roundId, playerId, amount })
}

/**
 * サイコロを振る
 * @param {string} roundId - ラウンドID
 * @param {string} playerId - プレイヤーID
 */
export async function rollDice(roundId, playerId) {
  return callEdgeFunction('roll-dice', { roundId, playerId })
}

/**
 * ラウンドを精算する
 * @param {string} roundId - ラウンドID
 * @param {string} playerId - プレイヤーID
 */
export async function settleRound(roundId, playerId) {
  return callEdgeFunction('settle-round', { roundId, playerId })
}
