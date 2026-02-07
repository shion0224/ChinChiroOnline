import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createSupabaseAdmin,
  createSupabaseClient,
} from "../_shared/supabaseAdmin.ts";

/**
 * next-round Edge Function
 *
 * 次のラウンドを開始する（ホストのみ実行可能）
 * 新しい game_round を作成し、rooms.status を playing に戻す
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
        JSON.stringify({ error: "ホストのみが次のラウンドを開始できます" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 直前のラウンドが finished であるか確認
    const { data: lastRound, error: lastRoundError } = await supabaseAdmin
      .from("game_rounds")
      .select("*")
      .eq("room_id", room_id)
      .order("round_number", { ascending: false })
      .limit(1)
      .single();

    if (lastRoundError || !lastRound) {
      return new Response(
        JSON.stringify({ error: "前のラウンドが見つかりません" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (lastRound.status !== "finished") {
      return new Response(
        JSON.stringify({ error: "現在のラウンドがまだ終了していません" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const nextRoundNumber = lastRound.round_number + 1;

    // rooms.status を playing に確実に設定
    await supabaseAdmin
      .from("rooms")
      .update({ status: "playing", updated_at: new Date().toISOString() })
      .eq("id", room_id);

    // 新しいラウンドを作成
    const { data: gameRound, error: roundError } = await supabaseAdmin
      .from("game_rounds")
      .insert({
        room_id,
        round_number: nextRoundNumber,
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
