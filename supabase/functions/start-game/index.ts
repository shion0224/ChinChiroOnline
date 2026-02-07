import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { getSupabaseAdmin } from '../_shared/supabase-admin.ts'
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts'

/**
 * start-game Edge Function
 *
 * ゲームを開始し、最初のラウンドを作成する。
 * - ルームの status を 'playing' に変更
 * - プレイヤーの turn_order を設定
 * - 最初の game_round を作成（親 = ホスト）
 *
 * Request body: { roomId: string, playerId: string }
 */
serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { roomId, playerId } = await req.json()

    if (!roomId || !playerId) {
      return errorResponse('roomId と playerId は必須です')
    }

    const supabase = getSupabaseAdmin()

    // ルーム情報を取得
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (roomError || !room) {
      return errorResponse('ルームが見つかりません', 404)
    }

    if (room.status !== 'waiting') {
      return errorResponse('ゲームは既に開始されています')
    }

    // リクエストしたプレイヤーがホストか確認
    const { data: requestPlayer, error: playerError } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .eq('room_id', roomId)
      .single()

    if (playerError || !requestPlayer) {
      return errorResponse('プレイヤーが見つかりません', 404)
    }

    if (!requestPlayer.is_host) {
      return errorResponse('ゲームを開始できるのはホストのみです', 403)
    }

    // ルーム内のプレイヤーを取得
    const { data: players, error: playersError } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })

    if (playersError || !players || players.length < 2) {
      return errorResponse('ゲームを開始するには最低2人のプレイヤーが必要です')
    }

    // turn_order を設定（ホストが最初）
    const hostIndex = players.findIndex((p) => p.is_host)
    const orderedPlayers = [
      ...players.slice(hostIndex),
      ...players.slice(0, hostIndex),
    ]

    for (let i = 0; i < orderedPlayers.length; i++) {
      await supabase
        .from('players')
        .update({ turn_order: i })
        .eq('id', orderedPlayers[i].id)
    }

    // ルームを playing に変更
    await supabase
      .from('rooms')
      .update({ status: 'playing' })
      .eq('id', roomId)

    // 最初のゲームラウンドを作成（親 = ホスト）
    const parentPlayer = orderedPlayers[0] // ホストが最初の親
    const { data: gameRound, error: roundError } = await supabase
      .from('game_rounds')
      .insert({
        room_id: roomId,
        round_number: 1,
        status: 'playing',
        phase: 'betting',
        parent_id: parentPlayer.id,
        current_turn_player_id: null, // betting フェーズでは全員が同時にベットする
      })
      .select()
      .single()

    if (roundError) {
      return errorResponse(`ラウンド作成に失敗: ${roundError.message}`, 500)
    }

    return jsonResponse({
      success: true,
      gameRound,
      parentId: parentPlayer.id,
      players: orderedPlayers.map((p) => ({
        id: p.id,
        name: p.name,
        turnOrder: p.turn_order,
        chips: p.chips,
      })),
    })
  } catch (err) {
    console.error('start-game error:', err)
    return errorResponse(`サーバーエラー: ${(err as Error).message}`, 500)
  }
})
