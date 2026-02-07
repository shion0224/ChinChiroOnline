import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'
import {
  rollThreeDice,
  evaluateHand,
  isHandDecided,
  isInstantSettlement,
  type HandResult,
} from '../_shared/game-logic.ts'

/**
 * roll-dice Edge Function
 *
 * 親/子のフェーズに応じてサイコロを振る。
 * - 最大3回振り直し可能（バラの場合のみ）
 * - 3回目でもバラの場合はションベン
 * - 親の役確定後、即決役なら settlement へ、通常目なら children_rolling へ
 * - 子の役確定後、次の子へターンを渡す。全子確定で settlement へ
 *
 * Request body: { roundId: string, playerId: string }
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

    // ゲームラウンドを確認
    const { data: round, error: roundError } = await supabase
      .from('game_rounds')
      .select('*')
      .eq('id', roundId)
      .single()

    if (roundError || !round) {
      return errorResponse('ゲームラウンドが見つかりません', 404)
    }

    if (round.status !== 'playing') {
      return errorResponse('このラウンドは既に終了しています')
    }

    const phase = round.phase as string

    if (phase !== 'parent_rolling' && phase !== 'children_rolling') {
      // ロールフェーズでない場合、現在の状態を返す（エラーにしない）
      return jsonResponse({
        error: null,
        notYourPhase: true,
        currentPhase: phase,
        message: '現在はロールフェーズではありません',
      })
    }

    // ターンチェック
    if (round.current_turn_player_id !== playerId) {
      // 自分のターンでない場合も、エラーにしない
      return jsonResponse({
        error: null,
        notYourTurn: true,
        currentTurnPlayerId: round.current_turn_player_id,
        message: 'あなたのターンではありません',
      })
    }

    // プレイヤー情報
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .eq('room_id', round.room_id)
      .single()

    if (playerError || !player) {
      return errorResponse('プレイヤーが見つかりません', 404)
    }

    // このプレイヤーの既存ロール数を取得
    const { data: existingRolls } = await supabase
      .from('player_rolls')
      .select('*')
      .eq('game_round_id', roundId)
      .eq('player_id', playerId)
      .order('roll_attempt', { ascending: true })

    // 既にロールが確定済みなら、既存の結果を返す（べき等）
    const existingFinal = existingRolls?.find((r) => r.is_final)
    if (existingFinal) {
      return jsonResponse({
        roll: {
          id: existingFinal.id,
          dice1: existingFinal.dice1,
          dice2: existingFinal.dice2,
          dice3: existingFinal.dice3,
        },
        hand: {
          type: existingFinal.hand_type,
          displayName: existingFinal.hand_type,
          value: existingFinal.hand_value,
        },
        attempt: existingFinal.roll_attempt,
        decided: true,
        phaseChanged: false,
        newPhase: phase,
        alreadyFinal: true,
      })
    }

    const attemptNumber = (existingRolls?.length ?? 0) + 1

    if (attemptNumber > 3) {
      return errorResponse('これ以上振ることはできません')
    }

    // サイコロを振る
    const dice = rollThreeDice()
    const isThirdAttempt = attemptNumber === 3
    const hand: HandResult = evaluateHand(dice, isThirdAttempt)
    const decided = isHandDecided(hand)

    // 役が確定したか（バラでない or 3回目）
    const isFinal = decided || isThirdAttempt

    // DBに保存
    const { data: rollData, error: rollError } = await supabase
      .from('player_rolls')
      .insert({
        game_round_id: roundId,
        player_id: playerId,
        dice1: dice[0],
        dice2: dice[1],
        dice3: dice[2],
        hand_type: hand.displayName,
        hand_value: hand.handValue ?? 0,
        roll_attempt: attemptNumber,
        is_final: isFinal,
      })
      .select()
      .single()

    if (rollError) {
      return errorResponse(`ロール保存エラー: ${rollError.message}`, 500)
    }

    // ---- フェーズ遷移ロジック ----

    let phaseChanged = false
    let newPhase = phase

    if (isFinal) {
      if (phase === 'parent_rolling') {
        // 親の役が確定
        if (isInstantSettlement(hand)) {
          // 即決役 → settlement へ
          newPhase = 'settlement'
          await supabase
            .from('game_rounds')
            .update({
              phase: 'settlement',
              parent_hand_type: hand.displayName,
              parent_hand_value: hand.handValue,
              current_turn_player_id: null,
            })
            .eq('id', roundId)
          phaseChanged = true
        } else {
          // 通常目 → children_rolling へ
          // 最初の子プレイヤーを取得
          const { data: allPlayers } = await supabase
            .from('players')
            .select('*')
            .eq('room_id', round.room_id)
            .order('turn_order', { ascending: true })

          const firstChild = (allPlayers ?? []).find(
            (p) => p.id !== round.parent_id
          )

          newPhase = 'children_rolling'
          await supabase
            .from('game_rounds')
            .update({
              phase: 'children_rolling',
              parent_hand_type: hand.displayName,
              parent_hand_value: hand.handValue,
              current_turn_player_id: firstChild?.id ?? null,
            })
            .eq('id', roundId)
          phaseChanged = true
        }
      } else if (phase === 'children_rolling') {
        // 子の役が確定 → 次の子へ or settlement
        const { data: allPlayers } = await supabase
          .from('players')
          .select('*')
          .eq('room_id', round.room_id)
          .order('turn_order', { ascending: true })

        const children = (allPlayers ?? []).filter(
          (p) => p.id !== round.parent_id
        )

        // 確定済みの子プレイヤー数を取得
        const { data: finalRolls } = await supabase
          .from('player_rolls')
          .select('player_id')
          .eq('game_round_id', roundId)
          .eq('is_final', true)

        const decidedPlayerIds = new Set(
          (finalRolls ?? []).map((r) => r.player_id)
        )

        // 次のまだ振っていない子を見つける
        const nextChild = children.find((c) => !decidedPlayerIds.has(c.id))

        if (nextChild) {
          // 次の子のターンへ
          await supabase
            .from('game_rounds')
            .update({ current_turn_player_id: nextChild.id })
            .eq('id', roundId)
        } else {
          // 全員確定 → settlement へ
          newPhase = 'settlement'
          await supabase
            .from('game_rounds')
            .update({
              phase: 'settlement',
              current_turn_player_id: null,
            })
            .eq('id', roundId)
          phaseChanged = true
        }
      }
    }

    return jsonResponse({
      roll: {
        id: rollData.id,
        dice1: dice[0],
        dice2: dice[1],
        dice3: dice[2],
      },
      hand: {
        type: hand.handType,
        displayName: hand.displayName,
        value: hand.handValue,
      },
      attempt: attemptNumber,
      decided: isFinal,
      phaseChanged,
      newPhase,
    })
  } catch (err) {
    console.error('roll-dice error:', err)
    return errorResponse(`サーバーエラー: ${(err as Error).message}`, 500)
  }
})
