-- =============================================================
-- チンチロオンライン DBスキーマ更新
-- ネットワーク対戦対応のためのスキーマ変更 + RLS厳格化
-- =============================================================

-- ----- テーブル作成（初回 or IF NOT EXISTS） -----

-- ルームテーブル
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  host_id UUID,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  max_players INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- プレイヤーテーブル
CREATE TABLE IF NOT EXISTS players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  user_id UUID NOT NULL,
  is_host BOOLEAN DEFAULT FALSE,
  is_ready BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ゲームラウンドテーブル
CREATE TABLE IF NOT EXISTS game_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  winner_id UUID REFERENCES players(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- プレイヤーのサイコロ結果テーブル
CREATE TABLE IF NOT EXISTS player_rolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_round_id UUID REFERENCES game_rounds(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  dice1 INTEGER NOT NULL CHECK (dice1 BETWEEN 1 AND 6),
  dice2 INTEGER NOT NULL CHECK (dice2 BETWEEN 1 AND 6),
  dice3 INTEGER NOT NULL CHECK (dice3 BETWEEN 1 AND 6),
  hand_type TEXT NOT NULL,
  hand_value INTEGER,
  rolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ----- カラム追加（既存テーブルへの追加対応） -----

-- rooms に max_players カラムを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rooms' AND column_name = 'max_players'
  ) THEN
    ALTER TABLE rooms ADD COLUMN max_players INTEGER NOT NULL DEFAULT 4;
  END IF;
END $$;

-- game_rounds に winner_id カラムを追加
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'game_rounds' AND column_name = 'winner_id'
  ) THEN
    ALTER TABLE game_rounds ADD COLUMN winner_id UUID REFERENCES players(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ----- インデックス -----
CREATE INDEX IF NOT EXISTS idx_players_room_id ON players(room_id);
CREATE INDEX IF NOT EXISTS idx_players_user_id ON players(user_id);
CREATE INDEX IF NOT EXISTS idx_game_rounds_room_id ON game_rounds(room_id);
CREATE INDEX IF NOT EXISTS idx_player_rolls_game_round_id ON player_rolls(game_round_id);
CREATE INDEX IF NOT EXISTS idx_player_rolls_player_id ON player_rolls(player_id);

-- ----- Realtime有効化 -----
-- 002_network_multiplayer.sql で追加済みのためスキップ

-- ----- RLS（Row Level Security）厳格化 -----

-- まずRLSを有効化
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_rolls ENABLE ROW LEVEL SECURITY;

-- 既存のポリシーを削除（IF EXISTSで安全に）
DROP POLICY IF EXISTS "Allow all operations on rooms" ON rooms;
DROP POLICY IF EXISTS "Allow all operations on players" ON players;
DROP POLICY IF EXISTS "Allow all operations on game_rounds" ON game_rounds;
DROP POLICY IF EXISTS "Allow all operations on player_rolls" ON player_rolls;

-- rooms: 認証ユーザーは閲覧可能、書き込みはEdge Function（service_role）経由
CREATE POLICY "rooms_select_authenticated"
  ON rooms FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "rooms_all_service_role"
  ON rooms FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- players: 認証ユーザーは閲覧可能、書き込みはEdge Function経由
CREATE POLICY "players_select_authenticated"
  ON players FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "players_all_service_role"
  ON players FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- game_rounds: 認証ユーザーは閲覧可能、書き込みはEdge Function経由
CREATE POLICY "game_rounds_select_authenticated"
  ON game_rounds FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "game_rounds_all_service_role"
  ON game_rounds FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- player_rolls: 認証ユーザーは閲覧可能、書き込みはEdge Function経由
CREATE POLICY "player_rolls_select_authenticated"
  ON player_rolls FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "player_rolls_all_service_role"
  ON player_rolls FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ----- Database Trigger: ラウンド自動完了判定 -----

CREATE OR REPLACE FUNCTION check_round_complete()
RETURNS TRIGGER AS $$
DECLARE
  player_count INTEGER;
  roll_count INTEGER;
  v_room_id UUID;
  best_roll RECORD;
BEGIN
  -- このラウンドのroom_idを取得
  SELECT room_id INTO v_room_id
  FROM game_rounds WHERE id = NEW.game_round_id;

  -- ルーム内のプレイヤー数を取得
  SELECT COUNT(*) INTO player_count
  FROM players WHERE room_id = v_room_id;

  -- このラウンドのロール数を取得
  SELECT COUNT(*) INTO roll_count
  FROM player_rolls WHERE game_round_id = NEW.game_round_id;

  -- 全員がサイコロを振り終わったか確認
  IF roll_count >= player_count AND player_count > 0 THEN
    -- 最強の手を持つプレイヤーを特定
    -- hand_type の強さ順: ピンゾロ > ゾロ > シゴロ > 目なし > 通常目 > 役なし
    SELECT * INTO best_roll
    FROM player_rolls
    WHERE game_round_id = NEW.game_round_id
    ORDER BY
      CASE
        WHEN hand_type = 'ピンゾロ' THEN 1000
        WHEN hand_type LIKE '%ゾロ' THEN 900 + COALESCE(hand_value, 0)
        WHEN hand_type = 'シゴロ' THEN 800
        WHEN hand_type = '目なし' THEN 700
        WHEN hand_type = '役なし' THEN 0
        ELSE 100 + COALESCE(hand_value, 0)
      END DESC
    LIMIT 1;

    -- ラウンドを終了し勝者を設定
    UPDATE game_rounds
    SET status = 'finished', winner_id = best_roll.player_id
    WHERE id = NEW.game_round_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 既存トリガーを削除してから再作成
DROP TRIGGER IF EXISTS trigger_check_round_complete ON player_rolls;

CREATE TRIGGER trigger_check_round_complete
AFTER INSERT ON player_rolls
FOR EACH ROW EXECUTE FUNCTION check_round_complete();
