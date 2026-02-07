-- =============================================
-- チンチロオンライン 初期スキーマ
-- =============================================

-- ルームテーブル
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  host_id UUID,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  max_players INTEGER NOT NULL DEFAULT 4 CHECK (max_players BETWEEN 2 AND 8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- プレイヤーテーブル
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  session_id TEXT,
  is_host BOOLEAN DEFAULT FALSE,
  is_ready BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ゲームラウンドテーブル
CREATE TABLE game_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  winner_player_id UUID REFERENCES players(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
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
  rolled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- インデックスの作成
CREATE INDEX idx_players_room_id ON players(room_id);
CREATE INDEX idx_players_session_id ON players(session_id);
CREATE INDEX idx_game_rounds_room_id ON game_rounds(room_id);
CREATE INDEX idx_player_rolls_game_round_id ON player_rolls(game_round_id);
CREATE INDEX idx_player_rolls_player_id ON player_rolls(player_id);

-- rooms の host_id に外部キー制約を追加（players作成後）
ALTER TABLE rooms ADD CONSTRAINT fk_rooms_host_id FOREIGN KEY (host_id) REFERENCES players(id) ON DELETE SET NULL;

-- updated_at 自動更新トリガー
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================
-- Row Level Security (RLS)
-- =============================================
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_rolls ENABLE ROW LEVEL SECURITY;

-- 開発用: すべてのユーザーが読み書き可能
-- 本番環境では適切なポリシーに変更すること
CREATE POLICY "Allow all on rooms" ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on players" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on game_rounds" ON game_rounds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on player_rolls" ON player_rolls FOR ALL USING (true) WITH CHECK (true);

-- =============================================
-- Realtime 有効化
-- =============================================
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE game_rounds;
ALTER PUBLICATION supabase_realtime ADD TABLE player_rolls;
