import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

/**
 * place-bet Edge Function
 *
 * 子プレイヤーがベットを配置する。
 * 全子プレイヤーのベットが完了したら、フェーズを parent_rolling に遷移。
 *
 * Request body: { roundId: string, playerId: string, amount: number }
 */
serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { roundId, playerId, amount } = await req.json()

    if (!roundId || !playerId || !amount) {
      return errorResponse('roundId, playerId, amount は必須です')
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return errorResponse('ベット額は正の整数である必要があります')
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

    if (round.phase !== 'betting') {
      return errorResponse('現在はベットフェーズではありません')
    }

    // プレイヤー情報を取得
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .eq('room_id', round.room_id)
      .single()

    if (playerError || !player) {
      return errorResponse('プレイヤーが見つかりません', 404)
    }

    // 親はベットしない
    if (player.id === round.parent_id) {
      return errorResponse('親はベットできません')
    }

    // チップが足りるか確認
    if (player.chips < amount) {
      return errorResponse(`チップが不足しています（残り: ${player.chips}）`)
    }

    // 既にベット済みか確認
    const { data: existingBet } = await supabase
      .from('round_bets')
      .select('*')
      .eq('game_round_id', roundId)
      .eq('player_id', playerId)
      .single()

    if (existingBet) {
      return errorResponse('既にベット済みです')
    }

    // ベットを配置
    const { data: bet, error: betError } = await supabase
      .from('round_bets')
      .insert({
        game_round_id: roundId,
        player_id: playerId,
        amount,
      })
      .select()
      .single()

    if (betError) {
      return errorResponse(`ベット配置に失敗: ${betError.message}`, 500)
    }

    // 全子プレイヤーがベットしたか確認
    const { data: allPlayers } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', round.room_id)

    const childPlayers = (allPlayers ?? []).filter(
      (p) => p.id !== round.parent_id
    )

    const { data: allBets } = await supabase
      .from('round_bets')
      .select('id')
      .eq('game_round_id', roundId)

    const allBetCount = allBets?.length ?? 0

    if (allBetCount >= childPlayers.length) {
      // 全員ベット完了 → parent_rolling フェーズへ遷移
      await supabase
        .from('game_rounds')
        .update({
          phase: 'parent_rolling',
          current_turn_player_id: round.parent_id,
        })
        .eq('id', roundId)

      return jsonResponse({
        success: true,
        bet,
        phaseChanged: true,
        newPhase: 'parent_rolling',
      })
    }

    return jsonResponse({
      success: true,
      bet,
      phaseChanged: false,
      betsPlaced: allBetCount,
      betsRequired: childPlayers.length,
    })
  } catch (err) {
    console.error('place-bet error:', err)
    return errorResponse(`サーバーエラー: ${(err as Error).message}`, 500)
  }
})
