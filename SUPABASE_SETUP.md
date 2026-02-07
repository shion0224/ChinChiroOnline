# Supabase セットアップ手順

## 1. Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com)にアクセスしてアカウントを作成
2. 新しいプロジェクトを作成
3. プロジェクトの設定から以下を取得：
   - Project URL
   - Anon/Public Key
   - Service Role Key（Edge Functions用）

## 2. 匿名認証の有効化

1. Supabaseダッシュボード → Authentication → Providers
2. **Anonymous Sign-ins** を有効にする

## 3. データベーススキーマの作成

SupabaseダッシュボードのSQL Editorで `supabase/migrations/001_schema_update.sql` の内容を実行してください。

このSQLには以下が含まれます：
- テーブル作成（rooms, players, game_rounds, player_rolls）
- インデックス作成
- Realtime有効化
- RLSポリシー（認証ユーザーはSELECTのみ、書き込みはEdge Function経由）
- Database Trigger（全員がサイコロを振ったら自動で勝敗判定）

## 4. 環境変数の設定

`.env.local`ファイルを作成：

```env
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## 5. Edge Functionsのデプロイ

Supabase CLIを使用してEdge Functionsをデプロイします：

```bash
# Supabase CLIのインストール
npm install -g supabase

# ログイン
supabase login

# プロジェクトとリンク
supabase link --project-ref your_project_ref

# 全Edge Functionsをデプロイ
supabase functions deploy create-room
supabase functions deploy join-room
supabase functions deploy start-game
supabase functions deploy roll-dice
supabase functions deploy next-round
supabase functions deploy leave-room
```

## 6. Edge Functionsの環境変数

Edge Functionsは以下の環境変数を自動的に使用します（Supabaseプロジェクトに紐付いている場合）：
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## 7. 機能テスト

アプリを起動して以下の機能をテスト：
- 匿名認証（自動）
- ルーム作成（Edge Function経由）
- プレイヤー参加（Edge Function経由）
- ゲーム開始（ホストのみ）
- サイコロを振る（サーバー側で乱数生成）
- 勝敗判定（Database Trigger自動判定）
- 次のラウンド（ホストのみ）
- リアルタイム更新

## Edge Functions 一覧

| 関数名 | 処理内容 |
|--------|---------|
| `create-room` | ルーム作成 + ホストプレイヤー登録 |
| `join-room` | ルーム参加（状態チェック + 人数上限チェック） |
| `start-game` | ゲーム開始（ホストのみ） |
| `roll-dice` | サーバー側でサイコロを振る（不正防止） |
| `next-round` | 次のラウンドを開始（ホストのみ） |
| `leave-room` | ルーム退出（ホスト引き継ぎ対応） |
