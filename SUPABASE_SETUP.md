# Supabase セットアップ手順

## 1. Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com)にアクセスしてアカウントを作成
2. 新しいプロジェクトを作成
3. プロジェクトの設定から以下を取得：
   - Project URL
   - Anon/Public Key

## 2. データベーススキーマの作成

SupabaseダッシュボードのSQL Editorで以下のSQLを実行：

```sql
-- ルームテーブル
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  host_id UUID,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
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
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ゲームラウンドテーブル
CREATE TABLE game_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
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
CREATE INDEX idx_game_rounds_room_id ON game_rounds(room_id);
CREATE INDEX idx_player_rolls_game_round_id ON player_rolls(game_round_id);
CREATE INDEX idx_player_rolls_player_id ON player_rolls(player_id);

-- Realtime有効化
ALTER PUBLICATION supabase_realtime ADD TABLE rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE player_rolls;
```

## 3. Row Level Security (RLS) ポリシーの設定

認証なしで動作するようにする場合（開発用）：

```sql
-- すべてのテーブルでRLSを有効化
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_rolls ENABLE ROW LEVEL SECURITY;

-- すべてのユーザーが読み書き可能（開発用 - 本番環境では適切なポリシーを設定）
CREATE POLICY "Allow all operations on rooms" ON rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on players" ON players FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on game_rounds" ON game_rounds FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on player_rolls" ON player_rolls FOR ALL USING (true) WITH CHECK (true);
```

## 4. 環境変数の設定

`.env.local`ファイルを作成：

```env
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## 5. 機能テスト

アプリを起動して以下の機能をテスト：
- ルーム作成
- プレイヤー参加
- サイコロを振る
- リアルタイム更新

