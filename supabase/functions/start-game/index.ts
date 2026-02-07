import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts'

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

    // ルームを取得
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (roomError || !roomData) {
      return new Response(
        JSON.stringify({ error: 'ルームが見つかりません' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ホスト権限チェック
    if (roomData.host_id !== playerId) {
      return new Response(
        JSON.stringify({ error: 'ゲームを開始できるのはホストのみです' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (roomData.status !== 'waiting') {
      return new Response(
        JSON.stringify({ error: 'ゲームは既に開始されています' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // プレイヤー一覧を取得（turn_order 設定のため）
    const { data: playersData, error: playersError } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })

    if (playersError) {
      throw new Error(`プレイヤー取得エラー: ${playersError.message}`)
    }

    if (!playersData || playersData.length < 2) {
      return new Response(
        JSON.stringify({ error: 'ゲームを開始するには最低2人のプレイヤーが必要です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 各プレイヤーに turn_order を設定 + 初期チップを確認
    for (let i = 0; i < playersData.length; i++) {
      await supabase
        .from('players')
        .update({ turn_order: i })
        .eq('id', playersData[i].id)
    }

    // 最初の親はホスト（turn_order = 0）
    const firstParentId = playersData[0].id

    // ルームステータスを playing に変更
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ status: 'playing' })
      .eq('id', roomId)

    if (updateError) {
      throw new Error(`ルーム更新エラー: ${updateError.message}`)
    }

    // ゲームラウンドを作成（parent_id とphase を設定）
    const { data: roundData, error: roundError } = await supabase
      .from('game_rounds')
      .insert({
        room_id: roomId,
        round_number: 1,
        status: 'playing',
        phase: 'betting',
        parent_id: firstParentId,
        current_turn_player_id: null,
      })
      .select()
      .single()

    if (roundError) {
      throw new Error(`ラウンド作成エラー: ${roundError.message}`)
    }

    return new Response(
      JSON.stringify({
        message: 'ゲームが開始されました',
        gameRoundId: roundData.id,
        roundNumber: roundData.round_number,
        parentId: firstParentId,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ゲームの開始に失敗しました'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
