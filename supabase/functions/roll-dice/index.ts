import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts'
import {
  rollAndEvaluate,
  getHandStrengthFromDB,
} from '../_shared/gameLogic.ts'

serve(async (req: Request) => {
  // CORS プリフライト
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { playerId, roundId } = await req.json()

    // バリデーション
    if (!playerId || !roundId) {
      return new Response(
        JSON.stringify({ error: 'playerId と roundId が必要です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const gameRoundId = roundId

    const supabase = getSupabaseAdmin()

    // ゲームラウンドを確認
    const { data: roundData, error: roundError } = await supabase
      .from('game_rounds')
      .select('*')
      .eq('id', gameRoundId)
      .single()

    if (roundError || !roundData) {
      return new Response(
        JSON.stringify({ error: 'ゲームラウンドが見つかりません' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (roundData.status !== 'playing') {
      return new Response(
        JSON.stringify({ error: 'このラウンドは既に終了しています' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // プレイヤーがこのルームに所属しているか確認
    const { data: playerData, error: playerError } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .eq('room_id', roundData.room_id)
      .single()

    if (playerError || !playerData) {
      return new Response(
        JSON.stringify({ error: 'プレイヤーがこのルームに所属していません' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 既にこのラウンドで振っているか確認
    const { data: existingRoll } = await supabase
      .from('player_rolls')
      .select('*')
      .eq('game_round_id', gameRoundId)
      .eq('player_id', playerId)
      .maybeSingle()

    if (existingRoll) {
      return new Response(
        JSON.stringify({ error: '既にこのラウンドでサイコロを振っています' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- サーバー側でサイコロを振る ---
    const { dice, hand } = rollAndEvaluate()

    // 結果をDBに保存
    const { data: rollData, error: rollError } = await supabase
      .from('player_rolls')
      .insert({
        game_round_id: gameRoundId,
        player_id: playerId,
        dice1: dice[0],
        dice2: dice[1],
        dice3: dice[2],
        hand_type: hand.displayName,
        hand_value: hand.handValue || 0,
      })
      .select()
      .single()

    if (rollError) {
      throw new Error(`サイコロ結果保存エラー: ${rollError.message}`)
    }

    // 全プレイヤーが振り終わったか確認
    const { data: allRolls, error: allRollsError } = await supabase
      .from('player_rolls')
      .select('*')
      .eq('game_round_id', gameRoundId)

    if (allRollsError) {
      throw new Error(`ロール取得エラー: ${allRollsError.message}`)
    }

    const { count: playerCount, error: playerCountError } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roundData.room_id)

    if (playerCountError) {
      throw new Error(`プレイヤー数取得エラー: ${playerCountError.message}`)
    }

    let winner = null
    const allRolled = allRolls && playerCount && allRolls.length >= playerCount

    // 全員が振り終わったら勝者を判定
    if (allRolled && allRolls.length > 0) {
      // 手の強さでソート
      const sortedRolls = [...allRolls].sort((a, b) => {
        return getHandStrengthFromDB(b) - getHandStrengthFromDB(a)
      })

      const winnerRoll = sortedRolls[0]

      // 勝者をラウンドに記録
      await supabase
        .from('game_rounds')
        .update({
          status: 'finished',
          winner_player_id: winnerRoll.player_id,
        })
        .eq('id', gameRoundId)

      // 勝者のプレイヤー情報を取得
      const { data: winnerPlayer } = await supabase
        .from('players')
        .select('*')
        .eq('id', winnerRoll.player_id)
        .single()

      winner = winnerPlayer
        ? { id: winnerPlayer.id, name: winnerPlayer.name }
        : null
    }

    return new Response(
      JSON.stringify({
        roll: {
          id: rollData.id,
          dice: [rollData.dice1, rollData.dice2, rollData.dice3],
          handType: rollData.hand_type,
          handValue: rollData.hand_value,
        },
        allRolled: !!allRolled,
        winner,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'サイコロを振るのに失敗しました'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
