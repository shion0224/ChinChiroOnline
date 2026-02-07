import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  createSupabaseAdmin,
  createSupabaseClient,
} from "../_shared/supabaseAdmin.ts";
import { rollAndEvaluate } from "../_shared/gameLogic.ts";

/**
 * roll-dice Edge Function
 *
 * サーバー側でサイコロを振り、役判定を行い、DBに書き込む。
 * クライアント側での乱数生成を排除し、不正を防止する。
 *
 * リクエストボディ:
 *   { room_id: string, game_round_id: string }
 *
 * レスポンス:
 *   { dice: [number, number, number], hand: Hand }
 */
Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. 認証チェック
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

    // 2. リクエスト解析
    const { room_id, game_round_id } = await req.json();
    if (!room_id || !game_round_id) {
      return new Response(
        JSON.stringify({ error: "room_id と game_round_id は必須です" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Admin クライアント（RLSバイパス）
    const supabaseAdmin = createSupabaseAdmin();

    // 4. プレイヤーがこのルームに所属しているか確認
    const { data: player, error: playerError } = await supabaseAdmin
      .from("players")
      .select("*")
      .eq("room_id", room_id)
      .eq("user_id", user.id)
      .single();

    if (playerError || !player) {
      return new Response(
        JSON.stringify({ error: "このルームに所属していません" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. ゲームラウンドが playing 状態か確認
    const { data: gameRound, error: roundError } = await supabaseAdmin
      .from("game_rounds")
      .select("*")
      .eq("id", game_round_id)
      .eq("room_id", room_id)
      .eq("status", "playing")
      .single();

    if (roundError || !gameRound) {
      return new Response(
        JSON.stringify({ error: "このラウンドは現在プレイ中ではありません" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. このラウンドでまだ振っていないか確認（二重振り防止）
    const { data: existingRoll } = await supabaseAdmin
      .from("player_rolls")
      .select("id")
      .eq("game_round_id", game_round_id)
      .eq("player_id", player.id)
      .maybeSingle();

    if (existingRoll) {
      return new Response(
        JSON.stringify({ error: "このラウンドでは既にサイコロを振っています" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. サーバー側でサイコロを振る（crypto.getRandomValues使用）
    const { dice, hand } = rollAndEvaluate();

    // 8. DB書き込み
    const { data: rollData, error: rollError } = await supabaseAdmin
      .from("player_rolls")
      .insert({
        game_round_id,
        player_id: player.id,
        dice1: dice[0],
        dice2: dice[1],
        dice3: dice[2],
        hand_type: hand.displayName,
        hand_value: hand.handValue ?? 0,
      })
      .select()
      .single();

    if (rollError) {
      return new Response(
        JSON.stringify({ error: `サイコロ結果の保存に失敗しました: ${rollError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 9. レスポンス（勝敗判定はDBトリガーで自動実行される）
    return new Response(
      JSON.stringify({
        dice,
        hand,
        roll_id: rollData.id,
      }),
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
