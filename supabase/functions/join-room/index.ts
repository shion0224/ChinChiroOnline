import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts'

serve(async (req: Request) => {
  // CORS プリフライト
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { playerName, roomId } = await req.json()

    // バリデーション
    if (!playerName || typeof playerName !== 'string' || !playerName.trim()) {
      return new Response(
        JSON.stringify({ error: 'プレイヤー名を入力してください' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!roomId) {
      return new Response(
        JSON.stringify({ error: 'ルームIDを指定してください' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = getSupabaseAdmin()

    // ルームコード（6文字英数字）またはUUIDで検索
    const roomIdStr = String(roomId).trim().toUpperCase()
    let roomData = null
    let roomError = null

    if (roomIdStr.length === 6 && /^[A-Z0-9]{6}$/.test(roomIdStr)) {
      // 6文字英数字の場合、room_code で検索
      const result = await supabase
        .from('rooms')
        .select('*')
        .eq('room_code', roomIdStr)
        .single()
      roomData = result.data
      roomError = result.error
    } else {
      // UUIDの場合、id で検索
      const result = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .single()
      roomData = result.data
      roomError = result.error
    }

    if (roomError || !roomData) {
      return new Response(
        JSON.stringify({ error: 'ルームが見つかりません' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (roomData.status !== 'waiting') {
      return new Response(
        JSON.stringify({ error: 'このルームは既に開始されています' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 現在のプレイヤー数をチェック
    const { count, error: countError } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', roomData.id)

    if (countError) {
      throw new Error(`プレイヤー数取得エラー: ${countError.message}`)
    }

    if (count !== null && count >= roomData.max_players) {
      return new Response(
        JSON.stringify({ error: 'ルームが満員です' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // プレイヤーを追加
    const { data: playerData, error: playerError } = await supabase
      .from('players')
      .insert({
        room_id: roomData.id,
        name: playerName.trim(),
        is_host: false,
        is_ready: false,
      })
      .select()
      .single()

    if (playerError) {
      throw new Error(`プレイヤー追加エラー: ${playerError.message}`)
    }

    return new Response(
      JSON.stringify({
        roomId: roomData.id,
        roomCode: roomData.room_code,
        playerId: playerData.id,
        roomName: roomData.name,
        isHost: false,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ルームへの参加に失敗しました'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
