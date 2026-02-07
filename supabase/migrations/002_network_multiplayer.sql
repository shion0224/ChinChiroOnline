-- ====================================================================
-- チンチロオンライン ネットワーク対戦用スキーマ変更
-- 伝統ルール（親/子システム + 賭け）対応
-- ====================================================================

-- ====================================================================
-- 1. 既存テーブルの DROP（クリーンスタート用）
--    既存のSupabaseセットアップで作成済みのテーブルを再作成する場合に使用
--    ※ 既にデータがある場合は ALTER TABLE で個別に対応すること
-- ====================================================================

DROP TABLE IF EXISTS player_rolls CASCADE;
DROP TABLE IF EXISTS round_bets CASCADE;
DROP TABLE IF EXISTS game_rounds CASCADE;
DROP TABLE IF EXISTS players CASCADE;
DROP TABLE IF EXISTS rooms CASCADE;

-- ====================================================================
-- 2. テーブル作成
-- ====================================================================

-- ルームテーブル
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  host_id UUID,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  max_players INTEGER NOT NULL DEFAULT 6,
  initial_chips INTEGER NOT NULL DEFAULT 1000,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- プレイヤーテーブル
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  user_id UUID,
  is_host BOOLEAN DEFAULT FALSE,
  is_ready BOOLEAN DEFAULT FALSE,
  chips INTEGER NOT NULL DEFAULT 1000,
  turn_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ゲームラウンドテーブル
CREATE TABLE game_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'playing' CHECK (status IN ('waiting', 'playing', 'finished')),
  phase TEXT NOT NULL DEFAULT 'betting'
    CHECK (phase IN ('betting', 'parent_rolling', 'children_rolling', 'settlement')),
  parent_id UUID REFERENCES players(id),
  current_turn_player_id UUID REFERENCES players(id),
  parent_hand_type TEXT,
  parent_hand_value INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ラウンドベットテーブル（新規）
CREATE TABLE round_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_round_id UUID REFERENCES game_rounds(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  result_multiplier NUMERIC DEFAULT 0,
  settled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(game_round_id, player_id)
);

-- プレイヤーのサイコロ結果テーブル
CREATE TABLE player_rolls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_round_id UUID REFERENCES game_rounds(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  dice1 INTEGER NOT NULL CHECK (dice1 BETWEEN 1 AND 6),
  dice2 INTEGER NOT NULL CHECK (dice2 BETWEEN 1 AND 6),
  dice3 INTEGER NOT NULL CHECK (dice3 BETWEEN 1 AND 6),
  hand_type TEXT NOT NULL,
  hand_value INTEGER,
  roll_attempt INTEGER NOT NULL DEFAULT 1 CHECK (roll_attempt BETWEEN 1 AND 3),
  is_final BOOLEAN NOT NULL DEFAULT FALSE,
  rolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ====================================================================
-- 3. インデックス
-- ====================================================================

CREATE INDEX idx_players_room_id ON players(room_id);
CREATE INDEX idx_players_turn_order ON players(room_id, turn_order);
CREATE INDEX idx_game_rounds_room_id ON game_rounds(room_id);
CREATE INDEX idx_game_rounds_status ON game_rounds(room_id, status);
CREATE INDEX idx_player_rolls_game_round_id ON player_rolls(game_round_id);
CREATE INDEX idx_player_rolls_player_id ON player_rolls(player_id);
CREATE INDEX idx_player_rolls_final ON player_rolls(game_round_id, player_id, is_final);
CREATE INDEX idx_round_bets_game_round_id ON round_bets(game_round_id);
CREATE INDEX idx_round_bets_player_id ON round_bets(player_id);

-- ====================================================================
-- 4. Realtime有効化
-- ====================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE player_rolls;
ALTER PUBLICATION supabase_realtime ADD TABLE game_rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE round_bets;

-- ====================================================================
-- 5. Row Level Security（開発用 - 本番環境では適切なポリシーを設定）
-- ====================================================================

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_rolls ENABLE ROW LEVEL SECURITY;
ALTER TABLE round_bets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on rooms" ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on players" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on game_rounds" ON game_rounds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on player_rolls" ON player_rolls FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on round_bets" ON round_bets FOR ALL USING (true) WITH CHECK (true);

-- ====================================================================
-- 6. updated_at 自動更新トリガー
-- ====================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
