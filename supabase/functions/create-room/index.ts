import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createSupabaseAdmin,
  createSupabaseClient,
} from "../_shared/supabaseAdmin.ts";

/**
 * create-room Edge Function
 *
 * ルーム作成 + ホストプレイヤー登録
 *
 * リクエストボディ:
 *   { room_name: string, player_name: string, max_players?: number }
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
    const { room_name, player_name, max_players = 4 } = await req.json();

    if (!room_name?.trim()) {
      return new Response(
        JSON.stringify({ error: "ルーム名を入力してください" }),
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

    // ルーム作成
    const { data: room, error: roomError } = await supabaseAdmin
      .from("rooms")
      .insert({
        name: room_name.trim(),
        status: "waiting",
        max_players: Math.min(Math.max(max_players, 2), 8),
      })
      .select()
      .single();

    if (roomError) {
      return new Response(
        JSON.stringify({ error: `ルーム作成に失敗: ${roomError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ホストプレイヤー作成
    const { data: player, error: playerError } = await supabaseAdmin
      .from("players")
      .insert({
        room_id: room.id,
        name: player_name.trim(),
        user_id: user.id,
        is_host: true,
        is_ready: false,
      })
      .select()
      .single();

    if (playerError) {
      // ロールバック: ルームを削除
      await supabaseAdmin.from("rooms").delete().eq("id", room.id);
      return new Response(
        JSON.stringify({ error: `プレイヤー作成に失敗: ${playerError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ルームの host_id を更新
    await supabaseAdmin
      .from("rooms")
      .update({ host_id: player.id })
      .eq("id", room.id);

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
