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
 * サーバーサイドでサイコロを振り、役を判定し、ゲーム状態を遷移させる。
 * - バリデーション（ターン、フェーズ、ロール回数）
 * - サーバーサイドで乱数生成 + 役判定
 * - 状態遷移（次のプレイヤー、フェーズ変更）
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

    // ラウンド情報を取得
    const { data: round, error: roundError } = await supabase
      .from('game_rounds')
      .select('*')
      .eq('id', roundId)
      .single()

    if (roundError || !round) {
      return errorResponse('ラウンドが見つかりません', 404)
    }

    // フェーズチェック
    if (round.phase !== 'parent_rolling' && round.phase !== 'children_rolling') {
      return errorResponse('現在はサイコロを振るフェーズではありません')
    }

    // ターンチェック
    if (round.current_turn_player_id !== playerId) {
      return errorResponse('あなたのターンではありません')
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

    // このラウンドでのこのプレイヤーの既存ロール数を取得
    const { data: existingRolls, error: rollsError } = await supabase
      .from('player_rolls')
      .select('*')
      .eq('game_round_id', roundId)
      .eq('player_id', playerId)
      .order('roll_attempt', { ascending: true })

    if (rollsError) {
      return errorResponse('ロール履歴の取得に失敗', 500)
    }

    const currentAttempt = (existingRolls?.length ?? 0) + 1

    if (currentAttempt > 3) {
      return errorResponse('ロール回数の上限（3回）に達しています')
    }

    // サーバーサイドでサイコロを振る
    const dice = rollThreeDice()
    const isThirdAttempt = currentAttempt === 3
    const hand = evaluateHand(dice, isThirdAttempt)
    const decided = isHandDecided(hand)

    // player_rolls に INSERT
    const { data: rollData, error: insertError } = await supabase
      .from('player_rolls')
      .insert({
        game_round_id: roundId,
        player_id: playerId,
        dice1: dice[0],
        dice2: dice[1],
        dice3: dice[2],
        hand_type: hand.displayName,
        hand_value: hand.handValue ?? null,
        roll_attempt: currentAttempt,
        is_final: decided,
      })
      .select()
      .single()

    if (insertError) {
      return errorResponse(`ロール保存に失敗: ${insertError.message}`, 500)
    }

    // 状態遷移の判定
    const stateUpdate = await handleStateTransition(
      supabase, round, player, hand, decided
    )

    return jsonResponse({
      success: true,
      roll: rollData,
      dice,
      hand: {
        handType: hand.handType,
        displayName: hand.displayName,
        handValue: hand.handValue,
      },
      attempt: currentAttempt,
      decided,
      ...stateUpdate,
    })
  } catch (err) {
    console.error('roll-dice error:', err)
    return errorResponse(`サーバーエラー: ${(err as Error).message}`, 500)
  }
})

/**
 * ロール結果に基づいてゲーム状態を遷移させる
 */
async function handleStateTransition(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  round: Record<string, unknown>,
  player: Record<string, unknown>,
  hand: HandResult,
  decided: boolean
): Promise<Record<string, unknown>> {
  const roundId = round.id as string
  const roomId = round.room_id as string
  const parentId = round.parent_id as string

  // 役が確定していない場合（バラ、1-2回目）→ 同じプレイヤーが再度振る
  if (!decided) {
    return { phaseChanged: false, message: '役なし、もう一度振ってください' }
  }

  // ---- 親のロールの場合 ----
  if (round.phase === 'parent_rolling') {
    // 親の役を記録
    await supabase
      .from('game_rounds')
      .update({
        parent_hand_type: hand.displayName,
        parent_hand_value: hand.handValue,
      })
      .eq('id', roundId)

    // 即決役か？（ピンゾロ、ゾロ目、シゴロ、ヒフミ、ションベン）
    if (isInstantSettlement(hand)) {
      // settlement フェーズへ直行
      await supabase
        .from('game_rounds')
        .update({
          phase: 'settlement',
          current_turn_player_id: null,
        })
        .eq('id', roundId)

      return {
        phaseChanged: true,
        newPhase: 'settlement',
        message: `親の即決役: ${hand.displayName}`,
      }
    }

    // 通常目 → children_rolling へ、最初の子のターンへ
    const firstChild = await getNextChildPlayer(supabase, roomId, parentId, null)

    if (!firstChild) {
      // 子がいない場合（通常ありえないが安全のため）
      await supabase
        .from('game_rounds')
        .update({ phase: 'settlement', current_turn_player_id: null })
        .eq('id', roundId)

      return { phaseChanged: true, newPhase: 'settlement' }
    }

    await supabase
      .from('game_rounds')
      .update({
        phase: 'children_rolling',
        current_turn_player_id: firstChild.id,
      })
      .eq('id', roundId)

    return {
      phaseChanged: true,
      newPhase: 'children_rolling',
      nextPlayerId: firstChild.id,
      message: `親の目: ${hand.displayName}。子のターンへ`,
    }
  }

  // ---- 子のロールの場合 ----
  if (round.phase === 'children_rolling') {
    // 次の子プレイヤーを取得
    const nextChild = await getNextChildPlayer(
      supabase, roomId, parentId, player.id as string
    )

    if (!nextChild) {
      // 全子プレイヤーが完了 → settlement へ
      await supabase
        .from('game_rounds')
        .update({
          phase: 'settlement',
          current_turn_player_id: null,
        })
        .eq('id', roundId)

      return {
        phaseChanged: true,
        newPhase: 'settlement',
        message: '全員のロール完了。精算フェーズへ',
      }
    }

    // 次の子のターンへ
    await supabase
      .from('game_rounds')
      .update({ current_turn_player_id: nextChild.id })
      .eq('id', roundId)

    return {
      phaseChanged: false,
      nextPlayerId: nextChild.id,
      message: `次のプレイヤー: ${nextChild.name}`,
    }
  }

  return { phaseChanged: false }
}

/**
 * 次の子プレイヤーを取得する（turn_order順）
 * currentPlayerId が null の場合は最初の子を返す
 */
async function getNextChildPlayer(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  roomId: string,
  parentId: string,
  currentPlayerId: string | null
): Promise<Record<string, unknown> | null> {
  // ルーム内の全プレイヤーを turn_order 順で取得
  const { data: players } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', roomId)
    .order('turn_order', { ascending: true })

  if (!players) return null

  // 親を除いた子プレイヤーリスト
  const children = players.filter((p) => p.id !== parentId)

  if (children.length === 0) return null

  if (currentPlayerId === null) {
    // 最初の子を返す
    return children[0]
  }

  // 現在のプレイヤーの次の子を見つける
  const currentIndex = children.findIndex((p) => p.id === currentPlayerId)
  if (currentIndex === -1 || currentIndex >= children.length - 1) {
    return null // 最後の子 or 見つからない
  }

  return children[currentIndex + 1]
}
