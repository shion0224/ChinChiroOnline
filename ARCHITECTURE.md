# チンチロオンラインアプリ 構成ドキュメント

## システム構成

### フロントエンド（React + Vite）
- **ロビー画面**: ルーム作成・参加・プレイヤー待機
- **ゲーム画面**: サイコロを振る・結果表示・勝敗判定
- **リアルタイム更新**: Supabase Realtimeを使用

### バックエンド（Supabase Edge Functions + PostgreSQL）

#### Edge Functions（Deno/TypeScript）

サーバーサイドでゲームロジックを実行し、不正防止・公平性を担保する。

| 関数名 | 役割 |
|--------|------|
| `create-room` | ルーム作成 + ホストプレイヤー登録 |
| `join-room` | ルーム存在確認 + 人数制限チェック + プレイヤー追加 |
| `leave-room` | プレイヤー削除 + ホスト引き継ぎ or ルーム削除 |
| `start-game` | ホスト権限チェック + ゲーム開始 + ラウンド作成 |
| `roll-dice` | サーバー側でサイコロ生成 + 役判定 + 全員完了時に勝者判定 |

#### データフロー

```
Frontend (React)
  ↓ supabase.functions.invoke()
Edge Functions (Deno/TypeScript)
  ↓ DB操作 (サービスロール)
Supabase PostgreSQL
  ↓ Realtime broadcast
Frontend (Realtime購読で全クライアントに反映)
```

#### データベーステーブル

1. **rooms（ルーム情報）**
   ```sql
   - id: uuid (主キー)
   - name: text (ルーム名)
   - host_id: uuid (ホストのプレイヤーID)
   - status: text (waiting, playing, finished)
   - max_players: integer (最大プレイヤー数、デフォルト4)
   - created_at: timestamp
   - updated_at: timestamp
   ```

2. **players（プレイヤー情報）**
   ```sql
   - id: uuid (主キー)
   - room_id: uuid (ルームID、外部キー)
   - name: text (プレイヤー名)
   - session_id: text (匿名認証用識別子)
   - is_host: boolean
   - is_ready: boolean
   - created_at: timestamp
   ```

3. **game_rounds（ゲームラウンド）**
   ```sql
   - id: uuid (主キー)
   - room_id: uuid (ルームID、外部キー)
   - round_number: integer
   - status: text (waiting, playing, finished)
   - winner_player_id: uuid (勝者プレイヤーID)
   - created_at: timestamp
   ```

4. **player_rolls（プレイヤーのサイコロ結果）**
   ```sql
   - id: uuid (主キー)
   - game_round_id: uuid (ゲームラウンドID、外部キー)
   - player_id: uuid (プレイヤーID、外部キー)
   - dice1: integer (1-6)
   - dice2: integer (1-6)
   - dice3: integer (1-6)
   - hand_type: text (役の種類)
   - hand_value: integer (役の値)
   - rolled_at: timestamp
   ```

#### Realtime設定
- `rooms`テーブル: ルーム状態の変更を監視
- `players`テーブル: プレイヤーの参加・退出を監視
- `game_rounds`テーブル: ラウンド状態（勝者確定）を監視
- `player_rolls`テーブル: サイコロ結果をリアルタイム更新

## チンチロのルール

### 役の種類
1. **ピンゾロ（111）**: 最高の役
2. **ゾロ目（222-666）**: 同じ数字3つ
3. **シゴロ（456）**: 4, 5, 6の順
4. **目なし（123, 234, 345）**: 特殊な順
5. **通常目**: 2つのサイコロが同じ数字（例: 225 = 5の目）
6. **役なし（バラ）**: 3つすべて異なる数字で順でもない

### 勝敗判定
- ピンゾロ > ゾロ目 > シゴロ > 目なし > 通常目 > 役なし
- 同じ役の場合、数値で比較

## ファイル構成

```
pgm/
├── src/
│   ├── lib/
│   │   └── supabase.js          # Supabaseクライアント設定
│   ├── utils/
│   │   └── gameLogic.js         # チンチロゲームロジック（フロント表示用）
│   ├── hooks/
│   │   └── useRealtimeGame.js   # Realtime購読カスタムフック
│   ├── components/
│   │   ├── Lobby.jsx            # ロビー画面
│   │   ├── GameRoom.jsx         # ゲーム画面
│   │   ├── DiceDisplay.jsx      # サイコロ表示
│   │   └── PlayerList.jsx       # プレイヤーリスト
│   ├── App.jsx                  # メインアプリ
│   └── main.jsx                 # エントリーポイント
├── supabase/
│   ├── config.toml              # Supabase CLI設定
│   ├── migrations/
│   │   └── 001_initial_schema.sql  # テーブル定義
│   └── functions/
│       ├── _shared/
│       │   ├── gameLogic.ts     # ゲームロジック（TypeScript版）
│       │   ├── cors.ts          # CORS設定
│       │   └── supabaseAdmin.ts # サービスロール用クライアント
│       ├── create-room/index.ts
│       ├── join-room/index.ts
│       ├── leave-room/index.ts
│       ├── start-game/index.ts
│       └── roll-dice/index.ts
└── ...
```
