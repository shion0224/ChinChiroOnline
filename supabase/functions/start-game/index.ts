import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createSupabaseAdmin,
  createSupabaseClient,
} from "../_shared/supabaseAdmin.ts";

/**
 * start-game Edge Function
 *
 * ゲームを開始する（ホストのみ実行可能）
 * rooms.status を playing に変更し、最初の game_round を作成する
 *
 * リクエストボディ:
 *   { room_id: string }
 *
 * レスポンス:
 *   { game_round: object }
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
    const { room_id } = await req.json();

    if (!room_id) {
      return new Response(
        JSON.stringify({ error: "room_id は必須です" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createSupabaseAdmin();

    // ホスト権限チェック
    const { data: player, error: playerError } = await supabaseAdmin
      .from("players")
      .select("*")
      .eq("room_id", room_id)
      .eq("user_id", user.id)
      .eq("is_host", true)
      .single();

    if (playerError || !player) {
      return new Response(
        JSON.stringify({ error: "ホストのみがゲームを開始できます" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ルーム状態チェック
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
        JSON.stringify({ error: "ルームは既にゲーム中です" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // プレイヤー数チェック（最低2人必要）
    const { count: playerCount } = await supabaseAdmin
      .from("players")
      .select("*", { count: "exact", head: true })
      .eq("room_id", room_id);

    if ((playerCount ?? 0) < 2) {
      return new Response(
        JSON.stringify({ error: "ゲーム開始には最低2人のプレイヤーが必要です" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ルーム状態を playing に変更
    const { error: updateError } = await supabaseAdmin
      .from("rooms")
      .update({ status: "playing", updated_at: new Date().toISOString() })
      .eq("id", room_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: `ルーム更新に失敗: ${updateError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 最初のゲームラウンドを作成
    const { data: gameRound, error: roundError } = await supabaseAdmin
      .from("game_rounds")
      .insert({
        room_id,
        round_number: 1,
        status: "playing",
      })
      .select()
      .single();

    if (roundError) {
      return new Response(
        JSON.stringify({ error: `ラウンド作成に失敗: ${roundError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ game_round: gameRound }),
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
