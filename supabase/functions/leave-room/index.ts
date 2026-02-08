import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts'

/**
 * leave-room Edge Function
 *
 * ルームからプレイヤーを退出させる。
 * - waiting / finished 状態では即退出可能
 * - playing 状態でも呼べる（vote-leave で承認後に呼ばれるケース等）
 *
 * 退出後:
 * - 0人 → ルーム削除
 * - 1人 → ゲーム終了（playing中なら status=finished に変更）
 * - 2人以上 → 続行（ホスト引き継ぎ）
 */
serve(async (req: Request) => {
  // CORS プリフライト
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { playerId, roomId } = await req.json()

    // バリデーション
    if (!playerId || !roomId) {
      return new Response(
        JSON.stringify({ error: 'playerId と roomId が必要です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = getSupabaseAdmin()

    // プレイヤー情報を取得
    const { data: playerData, error: playerError } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .eq('room_id', roomId)
      .single()

    if (playerError || !playerData) {
      return new Response(
        JSON.stringify({ error: 'プレイヤーが見つかりません' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const wasHost = playerData.is_host

    // ルーム状態を取得
    const { data: room } = await supabase
      .from('rooms')
      .select('status')
      .eq('id', roomId)
      .single()

    const roomStatus = room?.status ?? 'waiting'

    // このプレイヤーに関連する pending の退出リクエストをクリーンアップ
    await supabase
      .from('leave_requests')
      .update({ status: 'approved' })
      .eq('room_id', roomId)
      .eq('requester_id', playerId)
      .eq('status', 'pending')

    // プレイヤーを削除
    const { error: deleteError } = await supabase
      .from('players')
      .delete()
      .eq('id', playerId)

    if (deleteError) {
      throw new Error(`プレイヤー削除エラー: ${deleteError.message}`)
    }

    // 残りのプレイヤーを確認
    const { data: remainingPlayers, error: remainingError } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })

    if (remainingError) {
      throw new Error(`プレイヤー取得エラー: ${remainingError.message}`)
    }

    // プレイヤーがいなくなったらルームを削除
    if (!remainingPlayers || remainingPlayers.length === 0) {
      await supabase.from('rooms').delete().eq('id', roomId)
      return new Response(
        JSON.stringify({ message: 'ルームが削除されました', roomDeleted: true }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 1人だけ残った場合 + ゲーム中だった → ゲーム終了
    if (remainingPlayers.length === 1 && roomStatus === 'playing') {
      // 進行中のラウンドを終了
      await supabase
        .from('game_rounds')
        .update({ status: 'finished' })
        .eq('room_id', roomId)
        .eq('status', 'playing')

      // ルームステータスを finished に変更
      await supabase
        .from('rooms')
        .update({ status: 'finished' })
        .eq('id', roomId)
    }

    // ホストが抜けた場合、次のプレイヤーをホストに昇格
    if (wasHost && remainingPlayers.length > 0) {
      const newHost = remainingPlayers[0]

      await supabase
        .from('players')
        .update({ is_host: true })
        .eq('id', newHost.id)

      await supabase
        .from('rooms')
        .update({ host_id: newHost.id })
        .eq('id', roomId)
    }

    return new Response(
      JSON.stringify({
        message: 'ルームから退出しました',
        roomDeleted: false,
        remainingPlayers: remainingPlayers.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ルームからの退出に失敗しました'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
