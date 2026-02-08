import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts'

/**
 * request-leave Edge Function
 *
 * ゲーム中にプレイヤーが退出をリクエストする。
 * - waiting 状態なら即退出（leave-room と同じ動作）
 * - playing 状態なら退出リクエストを作成し、全員の同意を待つ
 *
 * Request body: { playerId: string, roomId: string }
 */
serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { playerId, roomId } = await req.json()

    if (!playerId || !roomId) {
      return new Response(
        JSON.stringify({ error: 'playerId と roomId が必要です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = getSupabaseAdmin()

    // プレイヤー存在チェック
    const { data: player, error: playerError } = await supabase
      .from('players')
      .select('*')
      .eq('id', playerId)
      .eq('room_id', roomId)
      .single()

    if (playerError || !player) {
      return new Response(
        JSON.stringify({ error: 'プレイヤーが見つかりません' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ルーム状態チェック
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (roomError || !room) {
      return new Response(
        JSON.stringify({ error: 'ルームが見つかりません' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 既に pending の退出リクエストがあるか確認
    const { data: existingRequest } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'pending')
      .maybeSingle()

    if (existingRequest) {
      return new Response(
        JSON.stringify({ error: '既に退出リクエストが進行中です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // waiting 状態 or finished なら即退出（投票不要）
    if (room.status === 'waiting' || room.status === 'finished') {
      return new Response(
        JSON.stringify({ immediate: true, message: '待機中のため即退出できます' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // playing 状態 → 退出リクエストを作成
    const { data: leaveRequest, error: insertError } = await supabase
      .from('leave_requests')
      .insert({
        room_id: roomId,
        requester_id: playerId,
        status: 'pending',
      })
      .select()
      .single()

    if (insertError) {
      throw new Error(`退出リクエスト作成エラー: ${insertError.message}`)
    }

    // 他のプレイヤーの数を確認
    const { data: otherPlayers } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', roomId)
      .neq('id', playerId)

    // 他にプレイヤーがいない場合は即承認
    if (!otherPlayers || otherPlayers.length === 0) {
      await supabase
        .from('leave_requests')
        .update({ status: 'approved' })
        .eq('id', leaveRequest.id)

      return new Response(
        JSON.stringify({ immediate: true, requestId: leaveRequest.id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        immediate: false,
        requestId: leaveRequest.id,
        requesterName: player.name,
        totalVotersNeeded: otherPlayers.length,
        message: '退出リクエストを送信しました。他のプレイヤーの同意を待っています。',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '退出リクエストに失敗しました'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
