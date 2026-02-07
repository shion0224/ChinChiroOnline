import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts'

/**
 * set-chips Edge Function
 *
 * 待機中のルームで、プレイヤーが自分の初期チップ額を設定する。
 * ゲーム開始前（room.status === 'waiting'）のみ変更可能。
 *
 * Request body: { playerId: string, roomId: string, chips: number }
 */
serve(async (req: Request) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { playerId, roomId, chips } = await req.json()

    if (!playerId || !roomId || chips === undefined) {
      return new Response(
        JSON.stringify({ error: 'playerId, roomId, chips は必須です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const amount = Number(chips)
    if (!Number.isFinite(amount) || amount < 100 || amount > 1000000) {
      return new Response(
        JSON.stringify({ error: 'チップ額は 100〜1,000,000 の範囲で設定してください' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = getSupabaseAdmin()

    // ルーム状態の確認
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('status')
      .eq('id', roomId)
      .single()

    if (roomError || !room) {
      return new Response(
        JSON.stringify({ error: 'ルームが見つかりません' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (room.status !== 'waiting') {
      return new Response(
        JSON.stringify({ error: 'ゲーム開始後はチップ額を変更できません' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // プレイヤーのチップ額を更新
    const { data: player, error: updateError } = await supabase
      .from('players')
      .update({ chips: amount })
      .eq('id', playerId)
      .eq('room_id', roomId)
      .select()
      .single()

    if (updateError || !player) {
      return new Response(
        JSON.stringify({ error: 'プレイヤーが見つかりません' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({
        success: true,
        playerId: player.id,
        chips: player.chips,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'チップ額の設定に失敗しました'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
