import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import type {
  Room,
  Player,
  GameRound,
  PlayerRoll,
  RoundBet,
  GameStatus,
  LeaveRequest,
  LeaveVote,
} from '../types/database'

interface UseRealtimeGameReturn {
  room: Room | null
  players: Player[]
  gameRound: GameRound | null
  rolls: PlayerRoll[]
  bets: RoundBet[]
  gameStatus: GameStatus
  leaveRequest: LeaveRequest | null
  leaveVotes: LeaveVote[]
  setGameRound: React.Dispatch<React.SetStateAction<GameRound | null>>
  setRolls: React.Dispatch<React.SetStateAction<PlayerRoll[]>>
  setBets: React.Dispatch<React.SetStateAction<RoundBet[]>>
  setGameStatus: React.Dispatch<React.SetStateAction<GameStatus>>
  loadGameRound: () => Promise<void>
  loadRoomData: () => Promise<void>
  loadPlayers: () => Promise<void>
  loadLeaveRequest: () => Promise<void>
  refetchAll: () => Promise<void>
}

/**
 * ゲームルームのリアルタイム状態管理カスタムフック
 * Supabase Realtime を使って rooms, players, game_rounds, player_rolls を購読する
 * Realtime のフォールバックとしてポーリングも行う
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
  const [leaveRequest, setLeaveRequest] = useState<LeaveRequest | null>(null)
  const [leaveVotes, setLeaveVotes] = useState<LeaveVote[]>([])

  // gameRound の ID を ref で保持（useCallback の依存を安定化）
  const gameRoundIdRef = useRef<string | null>(null)
  useEffect(() => {
    gameRoundIdRef.current = gameRound?.id ?? null
  }, [gameRound])

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

  // サイコロ結果を読み込む（gameRound.id を ref 経由で参照し依存を安定化）
  const loadRolls = useCallback(async () => {
    const roundId = gameRoundIdRef.current
    if (!roundId) {
      setRolls([])
      return
    }

    const { data, error } = await supabase
      .from('player_rolls')
      .select('*')
      .eq('game_round_id', roundId)
      .order('rolled_at', { ascending: true })

    if (!error && data) {
      setRolls(data as PlayerRoll[])
    }
  }, [])

  // ベット情報を読み込む（gameRound.id を ref 経由で参照し依存を安定化）
  const loadBets = useCallback(async () => {
    const roundId = gameRoundIdRef.current
    if (!roundId) {
      setBets([])
      return
    }

    const { data, error } = await supabase
      .from('round_bets')
      .select('*')
      .eq('game_round_id', roundId)
      .order('created_at', { ascending: true })

    if (!error && data) {
      setBets(data as RoundBet[])
    }
  }, [])

  // pending の退出リクエストを読み込む
  const loadLeaveRequest = useCallback(async () => {
    const { data, error } = await supabase
      .from('leave_requests')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error) {
      setLeaveRequest(data as LeaveRequest | null)
      // リクエストがあれば投票も取得
      if (data) {
        const { data: votes, error: vErr } = await supabase
          .from('leave_votes')
          .select('*')
          .eq('leave_request_id', data.id)
        if (!vErr && votes) {
          setLeaveVotes(votes as LeaveVote[])
        }
      } else {
        setLeaveVotes([])
      }
    }
  }, [roomId])

  // すべてのデータを再取得する
  const refetchAll = useCallback(async () => {
    await Promise.all([loadRoomData(), loadPlayers(), loadGameRound(), loadLeaveRequest()])
    // loadRolls / loadBets は gameRound 更新後に呼ばれる
  }, [loadRoomData, loadPlayers, loadGameRound, loadLeaveRequest])

  // 初回読み込み + Realtime購読（rooms, players, leave_requests, leave_votes）
  useEffect(() => {
    loadRoomData()
    loadPlayers()
    loadLeaveRequest()

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
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[Realtime] players channel error — ポーリングで補完します')
        }
      })

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
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[Realtime] room channel error — ポーリングで補完します')
        }
      })

    const leaveRequestsChannel = supabase
      .channel(`room-${roomId}-leave-requests`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leave_requests',
          filter: `room_id=eq.${roomId}`,
        },
        () => loadLeaveRequest()
      )
      .subscribe()

    const leaveVotesChannel = supabase
      .channel(`room-${roomId}-leave-votes`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leave_votes',
        },
        () => loadLeaveRequest()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(playersChannel)
      supabase.removeChannel(roomChannel)
      supabase.removeChannel(leaveRequestsChannel)
      supabase.removeChannel(leaveVotesChannel)
    }
  }, [roomId, loadRoomData, loadPlayers, loadLeaveRequest])

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

  // ポーリングフォールバック: Realtime が動作しない場合の保険として定期的にデータを再取得
  useEffect(() => {
    const interval = setInterval(() => {
      loadRoomData()
      loadPlayers()
      loadLeaveRequest()
      if (gameStatus === 'playing' || gameStatus === 'finished') {
        loadGameRound()
        loadRolls()
        loadBets()
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [roomId, gameStatus, loadRoomData, loadPlayers, loadLeaveRequest, loadGameRound, loadRolls, loadBets])

  return {
    room,
    players,
    gameRound,
    rolls,
    bets,
    gameStatus,
    leaveRequest,
    leaveVotes,
    setGameRound,
    setRolls,
    setBets,
    setGameStatus,
    loadGameRound,
    loadRoomData,
    loadPlayers,
    loadLeaveRequest,
    refetchAll,
  }
}
