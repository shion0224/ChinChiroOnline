# Supabase セットアップ手順

## 1. Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com)にアクセスしてアカウントを作成
2. 新しいプロジェクトを作成
3. プロジェクトの設定から以下を取得：
   - Project URL
   - Anon/Public Key
   - Service Role Key（Edge Functions用）

## 2. Supabase CLI のインストール（ローカル開発用）

```bash
# npm でインストール
npm install -g supabase

# 初期化（既に supabase/ ディレクトリが存在するためスキップ可能）
# npx supabase init

# ローカル環境を起動
npx supabase start

# ローカル環境を停止
npx supabase stop
```

## 3. データベーススキーマの作成

### 方法A: マイグレーションファイルを使用（推奨）

```bash
# ローカル環境が起動している状態で
npx supabase db reset
```

これにより `supabase/migrations/001_initial_schema.sql` が自動的に適用されます。

### 方法B: SupabaseダッシュボードのSQL Editorで直接実行

`supabase/migrations/001_initial_schema.sql` の内容をSQL Editorにコピー&ペーストして実行してください。

## 4. Edge Functions のデプロイ

### ローカルでテスト

```bash
# Edge Functions をローカルで実行
npx supabase functions serve
```

### クラウドにデプロイ

```bash
# Supabaseプロジェクトにリンク
npx supabase link --project-ref your-project-ref

# 全Edge Functions をデプロイ
npx supabase functions deploy create-room
npx supabase functions deploy join-room
npx supabase functions deploy leave-room
npx supabase functions deploy start-game
npx supabase functions deploy roll-dice
```

### Edge Functions の環境変数

Edge Functions はデプロイ先の Supabase プロジェクトの以下の環境変数を自動的に使用します：
- `SUPABASE_URL` - プロジェクトURL
- `SUPABASE_SERVICE_ROLE_KEY` - サービスロールキー（DB操作用）

ローカル開発時は `npx supabase start` で自動設定されます。

## 5. フロントエンドの環境変数設定

`.env.local` ファイルを作成：

```env
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

ローカル開発時は `npx supabase start` の出力に表示されるURLとキーを使用：

```env
VITE_SUPABASE_URL=http://localhost:54321
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...（supabase startの出力を参照）
```

## 6. 開発の流れ

```bash
# 1. Supabase ローカル環境を起動
npx supabase start

# 2. Edge Functions をローカルで起動
npx supabase functions serve

# 3. フロントエンドを起動
npm run dev

# 4. ブラウザで http://localhost:5173 にアクセス
```

## 7. 機能テスト

アプリを起動して以下の機能をテスト：
- ルーム作成（Edge Function: create-room）
- プレイヤー参加（Edge Function: join-room）
- ゲーム開始（Edge Function: start-game）
- サイコロを振る（Edge Function: roll-dice）
- リアルタイム更新（Supabase Realtime）
- ルーム退出（Edge Function: leave-room）
- ホスト引き継ぎ（ホスト退出時に自動）

## 8. トラブルシューティング

### Edge Functions が呼び出せない
- `supabase functions serve` が起動しているか確認
- `.env.local` の `VITE_SUPABASE_URL` が正しいか確認

### Realtime が動作しない
- `supabase/migrations/001_initial_schema.sql` 内の `ALTER PUBLICATION supabase_realtime` が適用されているか確認
- Supabase ダッシュボードで Realtime が有効になっているか確認

### CORS エラー
- Edge Functions の `_shared/cors.ts` で許可するオリジンを確認
- 本番環境では `Access-Control-Allow-Origin` を具体的なドメインに変更することを推奨
