import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createSupabaseAdmin,
  createSupabaseClient,
} from "../_shared/supabaseAdmin.ts";

/**
 * join-room Edge Function
 *
 * ルームに参加する
 *
 * リクエストボディ:
 *   { room_id: string, player_name: string }
 *
 * レスポンス:
 *   { room: object, player: object }
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 認証チェック
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "認証が必要です" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseClient = createSupabaseClient(authHeader);
    const {
      data: { user },
    } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(
        JSON.stringify({ error: "認証に失敗しました" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // リクエスト解析
    const { room_id, player_name } = await req.json();

    if (!room_id) {
      return new Response(
        JSON.stringify({ error: "ルームIDを入力してください" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!player_name?.trim()) {
      return new Response(
        JSON.stringify({ error: "プレイヤー名を入力してください" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();

    // ルーム存在確認
    const { data: room, error: roomError } = await supabaseAdmin
      .from("rooms")
      .select("*")
      .eq("id", room_id)
      .single();

    if (roomError || !room) {
      return new Response(
        JSON.stringify({ error: "ルームが見つかりません" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (room.status !== "waiting") {
      return new Response(
        JSON.stringify({ error: "このルームは既に開始されています" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 人数上限チェック
    const { count: currentPlayerCount } = await supabaseAdmin
      .from("players")
      .select("*", { count: "exact", head: true })
      .eq("room_id", room_id);

    if ((currentPlayerCount ?? 0) >= room.max_players) {
      return new Response(
        JSON.stringify({ error: "ルームが満員です" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 同じユーザーが既に参加しているか確認
    const { data: existingPlayer } = await supabaseAdmin
      .from("players")
      .select("id")
      .eq("room_id", room_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (existingPlayer) {
      return new Response(
        JSON.stringify({ error: "既にこのルームに参加しています" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // プレイヤー追加
    const { data: player, error: playerError } = await supabaseAdmin
      .from("players")
      .insert({
        room_id,
        name: player_name.trim(),
        user_id: user.id,
        is_host: false,
        is_ready: false,
      })
      .select()
      .single();

    if (playerError) {
      return new Response(
        JSON.stringify({ error: `参加に失敗: ${playerError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ room, player }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: `サーバーエラー: ${(err as Error).message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
