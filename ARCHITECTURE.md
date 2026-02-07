# チンチロオンラインアプリ 構成ドキュメント

## システム構成

### フロントエンド（React + Vite）
- **ロビー画面**: ルーム作成・参加・プレイヤー待機
- **ゲーム画面**: サイコロを振る・結果表示・勝敗判定
- **リアルタイム更新**: Supabase Realtimeを使用
- **認証**: Supabase匿名認証（自動）

### バックエンド（Supabase）

#### Edge Functions（Deno/TypeScript）

サーバー側で実行される関数群。クライアントからの不正を防止する。

| 関数名 | 処理内容 |
|--------|---------|
| `create-room` | ルーム作成 + ホストプレイヤー登録 |
| `join-room` | ルーム参加（状態チェック + 人数上限チェック） |
| `start-game` | ゲーム開始（ホストのみ、ラウンド作成） |
| `roll-dice` | サーバー側でサイコロを振る（乱数生成 + 役判定） |
| `next-round` | 次のラウンドを開始（ホストのみ） |
| `leave-room` | ルーム退出（ホスト引き継ぎ対応） |

#### Database Trigger

- `check_round_complete`: player_rollsにINSERT後、全員がサイコロを振ったか確認し、自動で勝敗判定を行う

#### データベーステーブル

1. **rooms（ルーム情報）**
   ```sql
   - id: uuid (主キー)
   - name: text (ルーム名)
   - host_id: uuid (ホストのプレイヤーID)
   - status: text (waiting, playing, finished)
   - max_players: integer (最大人数、デフォルト4)
   - created_at: timestamp
   - updated_at: timestamp
   ```

2. **players（プレイヤー情報）**
   ```sql
   - id: uuid (主キー)
   - room_id: uuid (ルームID、外部キー)
   - name: text (プレイヤー名)
   - user_id: uuid (認証ユーザーID、NOT NULL)
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
   - winner_id: uuid (勝者のプレイヤーID)
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
- `player_rolls`テーブル: サイコロ結果をリアルタイム更新
- `game_rounds`テーブル: ラウンド状態（勝者決定）を監視

#### RLSポリシー
- 認証ユーザー: 全テーブルSELECTのみ可能
- service_role（Edge Functions）: 全テーブルALL操作可能

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
src/
├── lib/
│   ├── supabase.js          # Supabaseクライアント設定
│   ├── auth.js              # 匿名認証ユーティリティ
│   └── edgeFunctions.js     # Edge Function呼び出しユーティリティ
├── utils/
│   └── gameLogic.js         # チンチロゲームロジック（クライアント参照用）
├── components/
│   ├── Lobby.jsx            # ロビー画面
│   ├── GameRoom.jsx         # ゲーム画面
│   ├── DiceDisplay.jsx      # サイコロ表示
│   └── PlayerList.jsx       # プレイヤーリスト
├── App.jsx                  # メインアプリ（認証フロー）
└── main.jsx                 # エントリーポイント

supabase/
├── config.toml              # Supabase設定
├── migrations/
│   └── 001_schema_update.sql  # DBスキーマ + RLS + Trigger
└── functions/
    ├── import_map.json      # Deno import map
    ├── _shared/
    │   ├── cors.ts          # CORS設定
    │   ├── supabaseAdmin.ts # Supabaseクライアント（Admin/User）
    │   └── gameLogic.ts     # ゲームロジック（サーバー側）
    ├── create-room/
    │   └── index.ts
    ├── join-room/
    │   └── index.ts
    ├── start-game/
    │   └── index.ts
    ├── roll-dice/
    │   └── index.ts
    ├── next-round/
    │   └── index.ts
    └── leave-room/
        └── index.ts
```
