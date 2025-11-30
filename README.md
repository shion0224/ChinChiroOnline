# チンチロオンライン 🎲

SupabaseとReactを使ったオンライン対戦型チンチロゲームアプリです。

## 特徴

- 🎮 リアルタイムオンライン対戦
- 🎲 3つのサイコロを使ったチンチロゲーム
- 👥 複数プレイヤーでの対戦
- ⚡ Supabase Realtimeによるリアルタイム更新

## セットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. Supabaseプロジェクトの設定

1. [Supabase](https://supabase.com)でアカウントを作成
2. 新しいプロジェクトを作成
3. `SUPABASE_SETUP.md`の手順に従ってデータベーススキーマを作成

### 3. 環境変数の設定

`.env.local`ファイルを作成：

```env
VITE_SUPABASE_URL=your_project_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

### 4. 開発サーバーの起動

```bash
npm run dev
```

## プロジェクト構成

```
src/
├── lib/
│   └── supabase.js          # Supabaseクライアント設定
├── utils/
│   └── gameLogic.js         # チンチロゲームロジック
├── components/
│   ├── Lobby.jsx            # ロビー画面
│   ├── GameRoom.jsx         # ゲーム画面
│   ├── DiceDisplay.jsx      # サイコロ表示
│   ├── PlayerList.jsx       # プレイヤーリスト
│   └── *.css                # 各コンポーネントのスタイル
├── App.jsx                  # メインアプリ
└── main.jsx                 # エントリーポイント
```

詳細な構成については`ARCHITECTURE.md`を参照してください。

## チンチロのルール

### 役の種類（強い順）

1. **ピンゾロ（111）**: 最高の役
2. **ゾロ目（222-666）**: 同じ数字3つ
3. **シゴロ（456）**: 4, 5, 6の順
4. **目なし（123, 234, 345）**: 特殊な順
5. **通常目**: 2つのサイコロが同じ数字（例: 225 = 5の目）
6. **役なし（バラ）**: 3つすべて異なる数字で順でもない

### 勝敗判定

- 役の強さで比較
- 同じ役の場合、数値で比較（例: 6のゾロ > 5のゾロ）

## 使い方

1. プレイヤー名を入力
2. ルームを作成するか、既存のルームに参加
3. ホストが「ゲームを開始」をクリック
4. 全員がサイコロを振る
5. 最も強い役を持ったプレイヤーの勝利！

## 開発

```bash
# 開発サーバー起動
npm run dev

# ビルド
npm run build

# プレビュー
npm run preview

# リント
npm run lint
```

## 技術スタック

- **フロントエンド**: React 19, Vite
- **バックエンド**: Supabase (PostgreSQL + Realtime)
- **スタイリング**: CSS

## ライセンス

MIT
