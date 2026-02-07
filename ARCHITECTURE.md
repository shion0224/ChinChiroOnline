# チンチロオンラインアプリ 構成ドキュメント

## システム構成

### フロントエンド（React + Vite）
- **ロビー画面**: ルーム作成・参加・プレイヤー待機
- **ゲーム画面**: フェーズベースUI（ベット→ロール→精算）
- **リアルタイム更新**: Supabase Realtimeを使用

### バックエンド（Supabase）

#### Edge Functions（サーバーサイドゲームロジック）
- `start-game`: ゲーム開始、親決定、ラウンド作成
- `place-bet`: ベット配置、フェーズ遷移
- `roll-dice`: サーバーサイドサイコロ生成、役判定、状態遷移
- `settle-round`: チップ精算、次ラウンド作成、親ローテーション

#### データベーステーブル

1. **rooms（ルーム情報）**
   ```sql
   - id: uuid (主キー)
   - name: text (ルーム名)
   - host_id: uuid (ホストのプレイヤーID)
   - status: text (waiting, playing, finished)
   - max_players: integer (最大人数、デフォルト6)
   - initial_chips: integer (初期チップ、デフォルト1000)
   - created_at: timestamp
   - updated_at: timestamp
   ```

2. **players（プレイヤー情報）**
   ```sql
   - id: uuid (主キー)
   - room_id: uuid (ルームID、外部キー)
   - name: text (プレイヤー名)
   - user_id: uuid (認証ユーザーID、optional)
   - is_host: boolean
   - is_ready: boolean
   - chips: integer (チップ残高、デフォルト1000)
   - turn_order: integer (ターン順)
   - created_at: timestamp
   ```

3. **game_rounds（ゲームラウンド）**
   ```sql
   - id: uuid (主キー)
   - room_id: uuid (ルームID、外部キー)
   - round_number: integer
   - status: text (waiting, playing, finished)
   - phase: text (betting, parent_rolling, children_rolling, settlement)
   - parent_id: uuid (親プレイヤーID)
   - current_turn_player_id: uuid (現在のターン)
   - parent_hand_type: text (親の役名)
   - parent_hand_value: integer (親の目の値)
   - created_at: timestamp
   ```

4. **round_bets（ラウンドベット）**
   ```sql
   - id: uuid (主キー)
   - game_round_id: uuid (ゲームラウンドID、外部キー)
   - player_id: uuid (プレイヤーID、外部キー)
   - amount: integer (ベット額)
   - result_multiplier: numeric (精算倍率)
   - settled: boolean (精算済みフラグ)
   - created_at: timestamp
   ```

5. **player_rolls（プレイヤーのサイコロ結果）**
   ```sql
   - id: uuid (主キー)
   - game_round_id: uuid (ゲームラウンドID、外部キー)
   - player_id: uuid (プレイヤーID、外部キー)
   - dice1: integer (1-6)
   - dice2: integer (1-6)
   - dice3: integer (1-6)
   - hand_type: text (役の種類)
   - hand_value: integer (役の値)
   - roll_attempt: integer (振り回数、1-3)
   - is_final: boolean (最終結果フラグ)
   - rolled_at: timestamp
   ```

#### Realtime設定
- `rooms`テーブル: ルーム状態の変更を監視
- `players`テーブル: プレイヤーの参加・退出・チップ更新を監視
- `game_rounds`テーブル: フェーズ遷移・ターン変更を監視
- `round_bets`テーブル: ベット状況をリアルタイム更新
- `player_rolls`テーブル: サイコロ結果をリアルタイム更新

## チンチロのルール（伝統ルール）

### ゲームフロー
1. 親（ディーラー）を決定（ホストが最初の親、以降ローテーション）
2. 子プレイヤーがベット額を決定
3. 親がサイコロを振る（最大3回）
4. 親の結果に応じて：
   - 即決役 → そのまま精算
   - 通常目 → 子が順番にサイコロを振る
5. 精算（チップの移動）
6. 親をローテーションして次のラウンド

### 役の種類（強い順）
1. **ピンゾロ（111）**: 最強。勝ち×3倍
2. **ゾロ目（222-666）**: 勝ち×2倍
3. **シゴロ（456）**: 勝ち×1倍
4. **通常目**: 2つ同じ + 1つ異なる → 異なる数字が「目」。値で比較
5. **ヒフミ（123）**: 即負け。負け×2倍
6. **ションベン**: 3回振って役なし。負け×1倍

### 親の特別ルール
- 即決役（ピンゾロ・ゾロ目・シゴロ）→ 全子から即座に勝ち取り
- ヒフミ → 全子に即座に支払い
- 通常目 → 基準値として子と比較
- 3回バラ（ションベン）→ 全子に支払い

### 勝敗判定（子 vs 親の通常目）
- 子がピンゾロ/ゾロ目/シゴロ → 子の勝ち（倍率付き）
- 子の目 > 親の目 → 子の勝ち ×1
- 子の目 = 親の目 → 引き分け
- 子の目 < 親の目 → 子の負け ×1
- 子がヒフミ → 子の負け ×2
- 子がションベン → 子の負け ×1

## ファイル構成

```
src/
├── lib/
│   ├── supabase.js          # Supabaseクライアント設定
│   └── gameApi.js           # Edge Function呼び出しヘルパー
├── utils/
│   └── gameLogic.js         # チンチロゲームロジック（クライアント表示用）
├── components/
│   ├── Lobby.jsx            # ロビー画面
│   ├── GameRoom.jsx         # ゲーム画面（フェーズベース）
│   ├── BettingPhase.jsx     # ベットフェーズUI
│   ├── RollingPhase.jsx     # ロールフェーズUI（親・子共通）
│   ├── SettlementPhase.jsx  # 精算フェーズUI
│   ├── DiceDisplay.jsx      # サイコロ表示
│   └── PlayerList.jsx       # プレイヤーリスト
├── App.jsx                  # メインアプリ
└── main.jsx                 # エントリーポイント

supabase/
├── migrations/
│   └── 001_network_multiplayer.sql  # DBスキーマ
└── functions/
    ├── _shared/
    │   ├── game-logic.ts     # サーバー側ゲームロジック（役判定）
    │   ├── supabase-admin.ts # サービスロールクライアント
    │   └── cors.ts           # CORS設定
    ├── start-game/index.ts   # ゲーム開始
    ├── place-bet/index.ts    # ベット配置
    ├── roll-dice/index.ts    # サイコロを振る
    └── settle-round/index.ts # ラウンド精算
```
