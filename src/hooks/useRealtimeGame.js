import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

/**
 * ゲームルームのリアルタイム状態管理カスタムフック
 * Supabase Realtime を使って rooms, players, game_rounds, player_rolls を購読する
 */
export function useRealtimeGame(roomId, playerId) {
  const [room, setRoom] = useState(null)
  const [players, setPlayers] = useState([])
  const [gameRound, setGameRound] = useState(null)
  const [rolls, setRolls] = useState([])
  const [gameStatus, setGameStatus] = useState('waiting')

  // ルーム情報を読み込む
  const loadRoomData = useCallback(async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (!error && data) {
      setRoom(data)
      setGameStatus(data.status)
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
      setPlayers(data)
    }
  }, [roomId])

  // アクティブなゲームラウンドを読み込む
  const loadGameRound = useCallback(async () => {
    const { data, error } = await supabase
      .from('game_rounds')
      .select('*')
      .eq('room_id', roomId)
      .in('status', ['playing', 'finished'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error && data) {
      setGameRound(data)
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
      setRolls(data)
    }
  }, [gameRound])

  // 初回読み込み + Realtime購読（rooms, players）
  useEffect(() => {
    loadRoomData()
    loadPlayers()

    const playersChannel = supabase
      .channel(`room-${roomId}-players`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        () => loadPlayers()
      )
      .subscribe()

    const roomChannel = supabase
      .channel(`room-${roomId}-room`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
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
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'game_rounds', filter: `room_id=eq.${roomId}` },
        () => loadGameRound()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(roundChannel)
    }
  }, [roomId, loadGameRound])

  // ゲームラウンドが変更されたらロール結果を読み込む + Realtime購読
  useEffect(() => {
    if (!gameRound) return

    loadRolls()

    const rollsChannel = supabase
      .channel(`room-${roomId}-rolls-${gameRound.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'player_rolls', filter: `game_round_id=eq.${gameRound.id}` },
        () => loadRolls()
      )
      .subscribe()

    return () => {
      supabase.removeChannel(rollsChannel)
    }
  }, [gameRound, roomId, loadRolls])

  return {
    room,
    players,
    gameRound,
    rolls,
    gameStatus,
    setGameRound,
    setRolls,
    setGameStatus,
    loadGameRound,
  }
}
