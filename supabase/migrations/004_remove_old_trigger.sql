-- =============================================================
-- 旧トリガー削除
-- check_round_complete トリガーは旧ゲームフロー用で、
-- 新しいフェーズベースのゲームフロー（親/子3回振り直し対応）と衝突するため削除
-- ラウンド完了判定は Edge Function (roll-dice, settle-round) 側で管理する
-- =============================================================

-- トリガーを削除
DROP TRIGGER IF EXISTS trigger_check_round_complete ON player_rolls;

-- 関数も削除
DROP FUNCTION IF EXISTS check_round_complete();
