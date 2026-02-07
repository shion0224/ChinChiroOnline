import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createSupabaseAdmin,
  createSupabaseClient,
} from "../_shared/supabaseAdmin.ts";

/**
 * leave-room Edge Function
 *
 * ルームを退出する
 * ホストが退出した場合、次のプレイヤーにホスト権限を引き継ぐ
 * 最後のプレイヤーが退出したらルームを削除する
 *
 * リクエストボディ:
 *   { room_id: string }
 *
 * レスポンス:
 *   { success: boolean }
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

    // プレイヤー情報を取得
    const { data: player, error: playerError } = await supabaseAdmin
      .from("players")
      .select("*")
      .eq("room_id", room_id)
      .eq("user_id", user.id)
      .single();

    if (playerError || !player) {
      return new Response(
        JSON.stringify({ error: "このルームに所属していません" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const wasHost = player.is_host;

    // プレイヤーを削除
    await supabaseAdmin
      .from("players")
      .delete()
      .eq("id", player.id);

    // 残りのプレイヤーを確認
    const { data: remainingPlayers, error: remainingError } = await supabaseAdmin
      .from("players")
      .select("*")
      .eq("room_id", room_id)
      .order("created_at", { ascending: true });

    if (remainingError) {
      return new Response(
        JSON.stringify({ error: "プレイヤー確認に失敗しました" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!remainingPlayers || remainingPlayers.length === 0) {
      // 最後のプレイヤーが退出 → ルームを削除
      await supabaseAdmin.from("rooms").delete().eq("id", room_id);
    } else if (wasHost) {
      // ホストが退出 → 次のプレイヤーにホストを引き継ぎ
      const newHost = remainingPlayers[0];
      await supabaseAdmin
        .from("players")
        .update({ is_host: true })
        .eq("id", newHost.id);

      await supabaseAdmin
        .from("rooms")
        .update({ host_id: newHost.id, updated_at: new Date().toISOString() })
        .eq("id", room_id);
    }

    return new Response(
      JSON.stringify({ success: true }),
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
