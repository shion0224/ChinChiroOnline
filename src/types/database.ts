/** データベースのテーブル型定義 */

export interface Room {
  id: string
  name: string
  host_id: string | null
  status: 'waiting' | 'playing' | 'finished'
  max_players: number
  initial_chips: number
  created_at: string
  updated_at: string
}

export interface Player {
  id: string
  room_id: string
  name: string
  user_id: string | null
  is_host: boolean
  is_ready: boolean
  chips: number
  turn_order: number
  created_at: string
}

export interface GameRound {
  id: string
  room_id: string
  round_number: number
  status: 'waiting' | 'playing' | 'finished'
  phase: 'betting' | 'parent_rolling' | 'children_rolling' | 'settlement'
  parent_id: string | null
  current_turn_player_id: string | null
  parent_hand_type: string | null
  parent_hand_value: number | null
  created_at: string
}

export interface RoundBet {
  id: string
  game_round_id: string
  player_id: string
  amount: number
  result_multiplier: number
  settled: boolean
  created_at: string
}

export interface PlayerRoll {
  id: string
  game_round_id: string
  player_id: string
  dice1: number
  dice2: number
  dice3: number
  hand_type: string
  hand_value: number | null
  roll_attempt: number
  is_final: boolean
  rolled_at: string
}

/** Supabase Edge Function のレスポンス型 */

export interface CreateRoomResponse {
  roomId: string
  playerId: string
  roomName: string
  isHost: boolean
}

export interface JoinRoomResponse {
  roomId: string
  playerId: string
  roomName: string
  isHost: boolean
}

export interface RollDiceResponse {
  roll?: {
    id?: string
    dice1: number
    dice2: number
    dice3: number
  }
  hand?: {
    displayName: string
    type: string
    value: number | null
  }
  attempt?: number
  decided?: boolean
  phaseChanged?: boolean
  newPhase?: string
  alreadyFinal?: boolean
  notYourTurn?: boolean
  notYourPhase?: boolean
  message?: string
  currentPhase?: string
  currentTurnPlayerId?: string | null
  error?: string | null
}

export interface SettleRoundResponse {
  success?: boolean
  results?: {
    playerId: string
    playerName: string
    isParent: boolean
    chipChange: number
  }[]
  gameFinished?: boolean
  alreadySettled?: boolean
  notSettlementPhase?: boolean
  message?: string
}

/** ルーム一覧用（プレイヤー数付き） */
export interface RoomWithPlayerCount extends Room {
  players: { count: number }[]
}

/** ゲームステータス */
export type GameStatus = 'waiting' | 'playing' | 'finished'
