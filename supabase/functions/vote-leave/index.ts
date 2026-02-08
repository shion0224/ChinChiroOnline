import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts'

/**
 * vote-leave Edge Function
 *
 * 退出リクエストに対して投票する。
 * 全員が賛成 → リクエスト承認＋退出実行＋残り人数チェック
 * 1人でも反対 → リクエスト却下
 *
 * Request body: { requestId: string, playerId: string, approved: boolean }
 */
serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { requestId, playerId, approved } = await req.json()

    if (!requestId || !playerId || approved === undefined) {
      return new Response(
        JSON.stringify({ error: 'requestId, playerId, approved が必要です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = getSupabaseAdmin()

    // 退出リクエストを取得
    const { data: leaveRequest, error: reqError } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('id', requestId)
      .single()

    if (reqError || !leaveRequest) {
      return new Response(
        JSON.stringify({ error: '退出リクエストが見つかりません' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (leaveRequest.status !== 'pending') {
      return new Response(
        JSON.stringify({ error: 'この退出リクエストは既に処理済みです', alreadyProcessed: true }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // リクエスト者自身は投票できない
    if (leaveRequest.requester_id === playerId) {
      return new Response(
        JSON.stringify({ error: '自分の退出リクエストには投票できません' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 投票者がルームに存在するか確認
    const { data: voter, error: voterError } = await supabase
      .from('players')
      .select('id')
      .eq('id', playerId)
      .eq('room_id', leaveRequest.room_id)
      .single()

    if (voterError || !voter) {
      return new Response(
        JSON.stringify({ error: '投票者がルームに存在しません' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 投票を記録（upsert で重複対応）
    const { error: voteError } = await supabase
      .from('leave_votes')
      .upsert(
        {
          leave_request_id: requestId,
          voter_id: playerId,
          approved: Boolean(approved),
        },
        { onConflict: 'leave_request_id,voter_id' }
      )

    if (voteError) {
      throw new Error(`投票記録エラー: ${voteError.message}`)
    }

    // --- 反対票が入った場合は即却下 ---
    if (!approved) {
      await supabase
        .from('leave_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId)

      return new Response(
        JSON.stringify({
          result: 'rejected',
          message: '退出リクエストが却下されました',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- 賛成票の場合、全員投票済みか確認 ---
    const roomId = leaveRequest.room_id
    const requesterId = leaveRequest.requester_id

    // リクエスト者以外のプレイヤー数
    const { data: otherPlayers } = await supabase
      .from('players')
      .select('id')
      .eq('room_id', roomId)
      .neq('id', requesterId)

    const totalVotersNeeded = otherPlayers?.length ?? 0

    // 賛成票数
    const { count: approvedCount } = await supabase
      .from('leave_votes')
      .select('*', { count: 'exact', head: true })
      .eq('leave_request_id', requestId)
      .eq('approved', true)

    if ((approvedCount ?? 0) < totalVotersNeeded) {
      // まだ全員投票していない
      return new Response(
        JSON.stringify({
          result: 'pending',
          votesReceived: approvedCount ?? 0,
          votesNeeded: totalVotersNeeded,
          message: '投票を受け付けました。他のプレイヤーの投票を待っています。',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- 全員賛成 → 退出を実行 ---
    await supabase
      .from('leave_requests')
      .update({ status: 'approved' })
      .eq('id', requestId)

    // プレイヤー情報を取得（ホストかどうか）
    const { data: requester } = await supabase
      .from('players')
      .select('*')
      .eq('id', requesterId)
      .single()

    const wasHost = requester?.is_host ?? false

    // プレイヤーを削除
    await supabase
      .from('players')
      .delete()
      .eq('id', requesterId)

    // 残りのプレイヤーを確認
    const { data: remainingPlayers } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })

    const remainingCount = remainingPlayers?.length ?? 0

    if (remainingCount === 0) {
      // 全員いなくなった → ルーム削除
      await supabase.from('rooms').delete().eq('id', roomId)
      return new Response(
        JSON.stringify({ result: 'approved', roomDeleted: true, remainingPlayers: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (remainingCount === 1) {
      // 1人だけ残った → ゲーム終了
      // 現在のラウンドを finished にする
      await supabase
        .from('game_rounds')
        .update({ status: 'finished' })
        .eq('room_id', roomId)
        .eq('status', 'playing')

      await supabase
        .from('rooms')
        .update({ status: 'finished' })
        .eq('id', roomId)
    }

    // ホストが抜けた場合、次のプレイヤーをホストに昇格
    if (wasHost && remainingPlayers && remainingPlayers.length > 0) {
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
        result: 'approved',
        roomDeleted: false,
        remainingPlayers: remainingCount,
        message: '退出が承認されました',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '投票に失敗しました'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
