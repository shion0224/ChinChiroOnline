import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import type {
  Room,
  Player,
  GameRound,
  PlayerRoll,
  RoundBet,
  GameStatus,
} from '../types/database'

interface UseRealtimeGameReturn {
  room: Room | null
  players: Player[]
  gameRound: GameRound | null
  rolls: PlayerRoll[]
  bets: RoundBet[]
  gameStatus: GameStatus
  setGameRound: React.Dispatch<React.SetStateAction<GameRound | null>>
  setRolls: React.Dispatch<React.SetStateAction<PlayerRoll[]>>
  setBets: React.Dispatch<React.SetStateAction<RoundBet[]>>
  setGameStatus: React.Dispatch<React.SetStateAction<GameStatus>>
  loadGameRound: () => Promise<void>
}

/**
 * ゲームルームのリアルタイム状態管理カスタムフック
 * Supabase Realtime を使って rooms, players, game_rounds, player_rolls を購読する
 */
export function useRealtimeGame(
  roomId: string,
  _playerId: string
): UseRealtimeGameReturn {
  const [room, setRoom] = useState<Room | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [gameRound, setGameRound] = useState<GameRound | null>(null)
  const [rolls, setRolls] = useState<PlayerRoll[]>([])
  const [bets, setBets] = useState<RoundBet[]>([])
  const [gameStatus, setGameStatus] = useState<GameStatus>('waiting')

  // ルーム情報を読み込む
  const loadRoomData = useCallback(async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (!error && data) {
      setRoom(data as Room)
      setGameStatus((data as Room).status)
    }
  }, [roomId])

  // プレイヤー一覧を読み込む
  const loadPlayers = useCallback(async () => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })

    if (!error && data) {
      setPlayers(data as Player[])
    }
  }, [roomId])

  // アクティブなゲームラウンドを読み込む
  const loadGameRound = useCallback(async () => {
    // playing のラウンドを優先、なければ最新の finished
    const { data: playingRound } = await supabase
      .from('game_rounds')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'playing')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (playingRound) {
      setGameRound((prev) => {
        // ラウンドIDが変わった場合、rolls/betsをクリア
        if (prev && prev.id !== playingRound.id) {
          setRolls([])
          setBets([])
        }
        return playingRound as GameRound
      })
      return
    }

    // playing がなければ最新の finished を取得
    const { data: finishedRound } = await supabase
      .from('game_rounds')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'finished')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (finishedRound) {
      setGameRound((prev) => {
        if (prev && prev.id !== finishedRound.id) {
          setRolls([])
          setBets([])
        }
        return finishedRound as GameRound
      })
    }
  }, [roomId])

  // サイコロ結果を読み込む
  const loadRolls = useCallback(async () => {
    if (!gameRound) {
      setRolls([])
      return
    }

    const { data, error } = await supabase
      .from('player_rolls')
      .select('*')
      .eq('game_round_id', gameRound.id)
      .order('rolled_at', { ascending: true })

    if (!error && data) {
      setRolls(data as PlayerRoll[])
    }
  }, [gameRound])

  // ベット情報を読み込む
  const loadBets = useCallback(async () => {
    if (!gameRound) {
      setBets([])
      return
    }

    const { data, error } = await supabase
      .from('round_bets')
      .select('*')
      .eq('game_round_id', gameRound.id)
      .order('created_at', { ascending: true })

    if (!error && data) {
      setBets(data as RoundBet[])
    }
  }, [gameRound])

  // 初回読み込み + Realtime購読（rooms, players）
  useEffect(() => {
    loadRoomData()
    loadPlayers()

    const playersChannel = supabase
      .channel(`room-${roomId}-players`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `room_id=eq.${roomId}`,
        },
        () => loadPlayers()
      )
      .subscribe()

    const roomChannel = supabase
      .channel(`room-${roomId}-room`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'rooms',
          filter: `id=eq.${roomId}`,
        },
        () => loadRoomData()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(playersChannel)
      supabase.removeChannel(roomChannel)
    }
  }, [roomId, loadRoomData, loadPlayers])

  // ゲームステータスが playing になったらラウンドを読み込む
  useEffect(() => {
    if (gameStatus === 'playing' || gameStatus === 'finished') {
      loadGameRound()
    }
  }, [gameStatus, loadGameRound])

  // game_rounds のRealtime購読
  useEffect(() => {
    const roundChannel = supabase
      .channel(`room-${roomId}-rounds`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'game_rounds',
          filter: `room_id=eq.${roomId}`,
        },
        () => loadGameRound()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(roundChannel)
    }
  }, [roomId, loadGameRound])

  // ゲームラウンドが変更されたらロール結果とベット情報を読み込む + Realtime購読
  useEffect(() => {
    if (!gameRound) return

    loadRolls()
    loadBets()

    const rollsChannel = supabase
      .channel(`room-${roomId}-rolls-${gameRound.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'player_rolls',
          filter: `game_round_id=eq.${gameRound.id}`,
        },
        () => loadRolls()
      )
      .subscribe()

    const betsChannel = supabase
      .channel(`room-${roomId}-bets-${gameRound.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'round_bets',
          filter: `game_round_id=eq.${gameRound.id}`,
        },
        () => loadBets()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(rollsChannel)
      supabase.removeChannel(betsChannel)
    }
  }, [gameRound, roomId, loadRolls, loadBets])

  return {
    room,
    players,
    gameRound,
    rolls,
    bets,
    gameStatus,
    setGameRound,
    setRolls,
    setBets,
    setGameStatus,
    loadGameRound,
  }
}
