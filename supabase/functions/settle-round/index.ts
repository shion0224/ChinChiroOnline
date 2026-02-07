import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import {
  calculateMultiplier,
  parseHandFromDB,
  type HandResult,
} from '../_shared/game-logic.ts'

interface SettlementResult {
  playerId: string
  playerName: string
  betAmount: number
  multiplier: number
  chipChange: number
  isParent: boolean
}

/**
 * settle-round Edge Function
 *
 * ラウンドの精算を行い、次のラウンドを作成する。
 * - 各子プレイヤーの役と親の役を比較
 * - 倍率に基づいてチップを移動
 * - 次ラウンドを作成（親をローテーション）
 *
 * Request body: { roundId: string, playerId: string }
 * playerId はホスト or 自動呼び出し用（バリデーション）
 */
serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { roundId, playerId } = await req.json()

    if (!roundId || !playerId) {
      return errorResponse('roundId と playerId は必須です')
    }

    const supabase = getSupabaseAdmin()

    // ラウンド情報を取得
    const { data: round, error: roundError } = await supabase
      .from('game_rounds')
      .select('*')
      .eq('id', roundId)
      .single()

    if (roundError || !round) {
      return errorResponse('ラウンドが見つかりません', 404)
    }

    if (round.phase !== 'settlement') {
      // 精算フェーズでない場合も、エラーにしない（フェーズ遷移の競合を防ぐ）
      return jsonResponse({
        success: false,
        notSettlementPhase: true,
        currentPhase: round.phase,
        message: '現在は精算フェーズではありません',
      })
    }

    if (round.status === 'finished') {
      // 既に精算済みの場合、エラーではなく成功を返す（べき等）
      return jsonResponse({
        success: true,
        alreadySettled: true,
        message: 'このラウンドは既に精算済みです',
      })
    }

    const roomId = round.room_id as string
    const parentId = round.parent_id as string

    // 全プレイヤーを取得
    const { data: players } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('turn_order', { ascending: true })

    if (!players) {
      return errorResponse('プレイヤー情報の取得に失敗', 500)
    }

    // 親の役を取得
    const parentHandType = round.parent_hand_type as string
    const parentHandValue = round.parent_hand_value as number | null
    const parentHand = parseHandFromDB(parentHandType, parentHandValue)

    // 全子のベットと最終ロールを取得
    const { data: bets } = await supabase
      .from('round_bets')
      .select('*')
      .eq('game_round_id', roundId)

    const { data: finalRolls } = await supabase
      .from('player_rolls')
      .select('*')
      .eq('game_round_id', roundId)
      .eq('is_final', true)

    // 精算処理
    const results: SettlementResult[] = []
    let parentChipChange = 0

    const childPlayers = players.filter((p) => p.id !== parentId)

    for (const child of childPlayers) {
      const bet = bets?.find((b) => b.player_id === child.id)
      if (!bet) continue

      const betAmount = bet.amount as number

      // 子の最終ロールを取得
      const childRoll = finalRolls?.find((r) => r.player_id === child.id)

      let childHand: HandResult
      let multiplier: number

      if (childRoll) {
        childHand = parseHandFromDB(
          childRoll.hand_type as string,
          childRoll.hand_value as number | null
        )
        multiplier = calculateMultiplier(parentHand, childHand)
      } else {
        // 子がロールしていない場合（親の即決役）
        multiplier = calculateMultiplier(parentHand, {
          handType: 'shonben',
          handValue: null,
          displayName: 'ションベン',
        })
      }

      // チップ変動計算（正 = 子の勝ち、負 = 子の負け）
      const chipChange = betAmount * multiplier
      parentChipChange -= chipChange // 親は逆

      // ベットの result_multiplier を更新
      await supabase
        .from('round_bets')
        .update({ result_multiplier: multiplier, settled: true })
        .eq('id', bet.id)

      // 子のチップを更新
      await supabase
        .from('players')
        .update({ chips: Math.max(0, child.chips + chipChange) })
        .eq('id', child.id)

      results.push({
        playerId: child.id,
        playerName: child.name,
        betAmount,
        multiplier,
        chipChange,
        isParent: false,
      })
    }

    // 親のチップを更新
    const parentPlayer = players.find((p) => p.id === parentId)
    if (parentPlayer) {
      await supabase
        .from('players')
        .update({
          chips: Math.max(0, parentPlayer.chips + parentChipChange),
        })
        .eq('id', parentId)

      results.push({
        playerId: parentId,
        playerName: parentPlayer.name,
        betAmount: 0,
        multiplier: 0,
        chipChange: parentChipChange,
        isParent: true,
      })
    }

    // ラウンドを finished に
    await supabase
      .from('game_rounds')
      .update({ status: 'finished' })
      .eq('id', roundId)

    // 次のラウンドを作成（親をローテーション）
    const nextParent = getNextParent(players, parentId)
    const nextRoundNumber = (round.round_number as number) + 1

    // チップが0のプレイヤーがいるか確認（ゲーム終了条件）
    const { data: updatedPlayers } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('turn_order', { ascending: true })

    const activePlayers = (updatedPlayers ?? []).filter((p) => p.chips > 0)

    let nextRound = null

    if (activePlayers.length < 2) {
      // ゲーム終了
      await supabase
        .from('rooms')
        .update({ status: 'finished' })
        .eq('id', roomId)
    } else {
      // 次ラウンド作成
      const { data: newRound } = await supabase
        .from('game_rounds')
        .insert({
          room_id: roomId,
          round_number: nextRoundNumber,
          status: 'playing',
          phase: 'betting',
          parent_id: nextParent?.id ?? parentId,
          current_turn_player_id: null,
        })
        .select()
        .single()

      nextRound = newRound
    }

    return jsonResponse({
      success: true,
      results,
      parentChipChange,
      parentHand: parentHand.displayName,
      nextRound,
      gameFinished: activePlayers.length < 2,
      updatedPlayers: (updatedPlayers ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        chips: p.chips,
        turnOrder: p.turn_order,
      })),
    })
  } catch (err) {
    console.error('settle-round error:', err)
    return errorResponse(`サーバーエラー: ${(err as Error).message}`, 500)
  }
})

/**
 * 次の親を決定する（turn_order 順でローテーション）
 */
function getNextParent(
  players: Record<string, unknown>[],
  currentParentId: string
): Record<string, unknown> | null {
  const sorted = [...players].sort(
    (a, b) => (a.turn_order as number) - (b.turn_order as number)
  )
  const currentIndex = sorted.findIndex((p) => p.id === currentParentId)

  if (currentIndex === -1) return sorted[0] ?? null

  const nextIndex = (currentIndex + 1) % sorted.length
  return sorted[nextIndex]
}
