import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { corsHeaders, handleCors } from '../_shared/cors.ts'
import { getSupabaseAdmin } from '../_shared/supabaseAdmin.ts'

serve(async (req: Request) => {
  // CORS プリフライト
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  try {
    const { playerName, roomName, maxPlayers } = await req.json()

    // バリデーション
    if (!playerName || typeof playerName !== 'string' || !playerName.trim()) {
      return new Response(
        JSON.stringify({ error: 'プレイヤー名を入力してください' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!roomName || typeof roomName !== 'string' || !roomName.trim()) {
      return new Response(
        JSON.stringify({ error: 'ルーム名を入力してください' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = getSupabaseAdmin()
    const playerLimit = Math.min(Math.max(maxPlayers || 4, 2), 8)

    // ルームを作成
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .insert({
        name: roomName.trim(),
        status: 'waiting',
        max_players: playerLimit,
      })
      .select()
      .single()

    if (roomError) {
      throw new Error(`ルーム作成エラー: ${roomError.message}`)
    }

    // ホストプレイヤーを作成
    const { data: playerData, error: playerError } = await supabase
      .from('players')
      .insert({
        room_id: roomData.id,
        name: playerName.trim(),
        is_host: true,
        is_ready: false,
      })
      .select()
      .single()

    if (playerError) {
      // プレイヤー作成失敗時、ルームを削除
      await supabase.from('rooms').delete().eq('id', roomData.id)
      throw new Error(`プレイヤー作成エラー: ${playerError.message}`)
    }

    // ルームの host_id を更新
    const { error: updateError } = await supabase
      .from('rooms')
      .update({ host_id: playerData.id })
      .eq('id', roomData.id)

    if (updateError) {
      throw new Error(`ルーム更新エラー: ${updateError.message}`)
    }

    return new Response(
      JSON.stringify({
        roomId: roomData.id,
        playerId: playerData.id,
        roomName: roomData.name,
        isHost: true,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ルームの作成に失敗しました'
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
