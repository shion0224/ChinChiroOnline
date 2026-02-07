# Supabase セットアップ手順

## 1. Supabaseプロジェクトの作成

1. [Supabase](https://supabase.com)にアクセスしてアカウントを作成
2. 新しいプロジェクトを作成
3. プロジェクトの設定から以下を取得：
   - Project URL
   - Anon/Public Key
   - Service Role Key（Edge Functions用）

## 2. データベーススキーマの作成

SupabaseダッシュボードのSQL Editorで `supabase/migrations/001_network_multiplayer.sql` の内容を実行してください。

このSQLは以下のテーブルを作成します：

| テーブル | 説明 |
|---------|------|
| `rooms` | ルーム情報（名前、ステータス、最大人数、初期チップ） |
| `players` | プレイヤー情報（名前、チップ残高、ターン順） |
| `game_rounds` | ゲームラウンド（フェーズ管理、親プレイヤー、現在のターン） |
| `round_bets` | 各ラウンドのベット情報（賭け額、倍率、精算状態） |
| `player_rolls` | サイコロ結果（3回までの振り直し対応、最終結果フラグ） |

### ゲームラウンドのフェーズ

```
betting → parent_rolling → children_rolling → settlement → (次ラウンドのbetting)
```

## 3. 環境変数の設定

`.env.local`ファイルを作成：

```env
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## 4. Supabase Edge Functionsのデプロイ

### 前提条件

Supabase CLIのインストール:

```bash
npm install -g supabase
```

### Supabaseにログイン

```bash
supabase login
```

### プロジェクトにリンク

```bash
supabase link --project-ref your_project_ref
```

### Edge Functionsのデプロイ

```bash
# 全Edge Functionsを一括デプロイ
supabase functions deploy start-game --no-verify-jwt
supabase functions deploy place-bet --no-verify-jwt
supabase functions deploy roll-dice --no-verify-jwt
supabase functions deploy settle-round --no-verify-jwt
```

> **注意**: `--no-verify-jwt` は開発用です。本番環境ではJWT検証を有効にし、
> 認証済みユーザーのみがEdge Functionを呼び出せるようにしてください。

### Edge Functionsのシークレット設定

```bash
supabase secrets set SUPABASE_URL=your_project_url
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

> `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` はSupabaseプロジェクトに
> デフォルトで設定されている場合があります。その場合はこのステップは不要です。

## 5. Edge Functions一覧

| 関数名 | 説明 | リクエストBody |
|--------|------|---------------|
| `start-game` | ゲーム開始、親決定 | `{ roomId, playerId }` |
| `place-bet` | ベット配置 | `{ roundId, playerId, amount }` |
| `roll-dice` | サイコロを振る（サーバー側） | `{ roundId, playerId }` |
| `settle-round` | ラウンド精算 | `{ roundId, playerId }` |

### roll-dice のバリデーション

- ターンチェック: 現在のターンのプレイヤーのみがロール可能
- フェーズチェック: `parent_rolling` or `children_rolling` のみ
- ロール回数: 最大3回まで
- サイコロ生成: サーバー側で `crypto.getRandomValues()` を使用

## 6. ゲームフロー

```
1. ルーム作成/参加（フロントエンドからSupabase直接）
2. ゲーム開始（start-game Edge Function）
   → 親を決定、最初のラウンド（bettingフェーズ）を作成
3. ベットフェーズ（place-bet Edge Function）
   → 全子がベットしたら parent_rolling に遷移
4. 親がサイコロを振る（roll-dice Edge Function）
   → 即決役ならsettlementへ、通常目ならchildren_rollingへ
5. 子が順番にサイコロを振る（roll-dice Edge Function）
   → 全員完了でsettlementへ
6. 精算（settle-round Edge Function）
   → チップ移動、次ラウンド作成（親ローテーション）
7. チップ0のプレイヤーがいたらゲーム終了
```

## 7. 機能テスト

アプリを起動して以下の機能をテスト：
- ルーム作成
- プレイヤー参加（2名以上）
- ゲーム開始（ホストのみ）
- ベットフェーズ（子プレイヤーがベット）
- 親のサイコロロール（最大3回振り直し）
- 子のサイコロロール（各最大3回振り直し）
- ラウンド精算（チップの移動確認）
- 次ラウンドの親ローテーション
- ゲーム終了条件（チップ0）
