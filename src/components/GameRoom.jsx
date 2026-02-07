import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { invokeEdgeFunction } from '../lib/edgeFunctions'
import DiceDisplay from './DiceDisplay'
import PlayerList from './PlayerList'
import './GameRoom.css'

function GameRoom({ roomId, playerId, isHost: initialIsHost, playerName, user }) {
  const [players, setPlayers] = useState([])
  const [gameRound, setGameRound] = useState(null)
  const [rolls, setRolls] = useState([])
  const [myRoll, setMyRoll] = useState(null)
  const [isRolling, setIsRolling] = useState(false)
  const [room, setRoom] = useState(null)
  const [gameStatus, setGameStatus] = useState('waiting')
  const [winner, setWinner] = useState(null)
  const [isHost, setIsHost] = useState(initialIsHost)
  const [roundNumber, setRoundNumber] = useState(0)
  const [error, setError] = useState('')

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

  // プレイヤー情報を読み込む
  const loadPlayers = useCallback(async () => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })

    if (!error && data) {
      setPlayers(data)
      // 自分がホストか再確認（ホスト引き継ぎ対応）
      const me = data.find(p => p.id === playerId)
      if (me) {
        setIsHost(me.is_host)
      }
    }
  }, [roomId, playerId])

  // 現在のゲームラウンドを読み込む
  const loadCurrentGameRound = useCallback(async () => {
    const { data, error } = await supabase
      .from('game_rounds')
      .select('*')
      .eq('room_id', roomId)
      .order('round_number', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error && data) {
      // 新しいラウンドに切り替わった場合、状態をリセット
      if (gameRound && data.id !== gameRound.id) {
        setMyRoll(null)
        setRolls([])
        setWinner(null)
      }

      setGameRound(data)
      setRoundNumber(data.round_number)

      if (data.status === 'finished' && data.winner_id) {
        // 勝者情報を取得
        const winnerPlayer = players.find(p => p.id === data.winner_id)
        setWinner(winnerPlayer || null)
      } else if (data.status === 'playing') {
        setWinner(null)
      }
    }
  }, [roomId, players, gameRound])

  // サイコロ結果を読み込む
  const loadRolls = useCallback(async () => {
    if (!gameRound) return

    const { data, error } = await supabase
      .from('player_rolls')
      .select('*')
      .eq('game_round_id', gameRound.id)
      .order('rolled_at', { ascending: true })

    if (!error && data) {
      setRolls(data)
      const myRollData = data.find(r => r.player_id === playerId)
      setMyRoll(myRollData || null)
    }
  }, [gameRound, playerId])

  // 初期読み込みとRealtime購読
  useEffect(() => {
    loadRoomData()
    loadPlayers()

    // プレイヤー変更を監視
    const playersChannel = supabase
      .channel(`room-${roomId}-players`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        () => {
          loadPlayers()
        }
      )
      .subscribe()

    // ルーム状態変更を監視
    const roomChannel = supabase
      .channel(`room-${roomId}-room`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        (payload) => {
          if (payload.new) {
            setRoom(payload.new)
            setGameStatus(payload.new.status)
          }
        }
      )
      .subscribe()

    // ゲームラウンド変更を監視
    const roundsChannel = supabase
      .channel(`room-${roomId}-rounds`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'game_rounds', filter: `room_id=eq.${roomId}` },
        () => {
          loadCurrentGameRound()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(playersChannel)
      supabase.removeChannel(roomChannel)
      supabase.removeChannel(roundsChannel)
    }
  }, [roomId, loadRoomData, loadPlayers, loadCurrentGameRound])

  // ゲームステータスが playing に変わったらラウンドを読み込む
  useEffect(() => {
    if (gameStatus === 'playing') {
      loadCurrentGameRound()
    }
  }, [gameStatus, loadCurrentGameRound])

  // ゲームラウンドが変更されたらロールを読み込む + Realtime購読
  useEffect(() => {
    if (!gameRound) return

    loadRolls()

    const rollsChannel = supabase
      .channel(`room-${roomId}-rolls-${gameRound.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'player_rolls', filter: `game_round_id=eq.${gameRound.id}` },
        () => {
          loadRolls()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(rollsChannel)
    }
  }, [gameRound?.id, roomId, loadRolls])

  // ゲームラウンドの winner_id が設定されたら勝者を表示
  useEffect(() => {
    if (gameRound?.status === 'finished' && gameRound?.winner_id && players.length > 0) {
      const winnerPlayer = players.find(p => p.id === gameRound.winner_id)
      setWinner(winnerPlayer || null)
    }
  }, [gameRound?.status, gameRound?.winner_id, players])

  // ゲーム開始（Edge Function経由）
  const startGame = async () => {
    if (!isHost) return

    try {
      setError('')
      await invokeEdgeFunction('start-game', { room_id: roomId })
    } catch (err) {
      console.error('Error starting game:', err)
      setError(err.message)
    }
  }

  // サイコロを振る（Edge Function経由 -- サーバー側で乱数生成）
  const rollDice = async () => {
    if (!gameRound || myRoll || isRolling) return

    setIsRolling(true)
    setError('')

    try {
      // サイコロを振るアニメーション用の待ち時間
      const rollPromise = invokeEdgeFunction('roll-dice', {
        room_id: roomId,
        game_round_id: gameRound.id,
      })

      // 最低1秒のアニメーション表示
      const [result] = await Promise.all([
        rollPromise,
        new Promise(resolve => setTimeout(resolve, 1000)),
      ])

      setMyRoll({
        dice1: result.dice[0],
        dice2: result.dice[1],
        dice3: result.dice[2],
        hand_type: result.hand.displayName,
        hand_value: result.hand.handValue,
        player_id: playerId,
      })
    } catch (err) {
      console.error('Error rolling dice:', err)
      setError(err.message)
    } finally {
      setIsRolling(false)
    }
  }

  // 次のラウンド（Edge Function経由）
  const nextRound = async () => {
    if (!isHost) return

    try {
      setError('')
      setMyRoll(null)
      setRolls([])
      setWinner(null)
      await invokeEdgeFunction('next-round', { room_id: roomId })
    } catch (err) {
      console.error('Error starting next round:', err)
      setError(err.message)
    }
  }

  // ルーム退出（Edge Function経由）
  const leaveRoom = async () => {
    try {
      await invokeEdgeFunction('leave-room', { room_id: roomId })
    } catch (err) {
      console.error('Error leaving room:', err)
    }
    window.location.reload()
  }

  return (
    <div className="game-room">
      <div className="game-room-container">
        <div className="game-header">
          <h1>チンチロオンライン</h1>
          <div className="room-info">
            <span>ルーム: {room?.name || 'Loading...'}</span>
            <span className="room-id">ID: {roomId.substring(0, 8)}...</span>
            {roundNumber > 0 && (
              <span className="round-info">ラウンド {roundNumber}</span>
            )}
          </div>
          <button onClick={leaveRoom} className="leave-button">退出</button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <PlayerList players={players} currentPlayerId={playerId} rolls={rolls} />

        {gameStatus === 'waiting' && (
          <div className="waiting-screen">
            <h2>ゲーム開始を待っています...</h2>
            <p>{players.length}人のプレイヤーが参加しています</p>
            {isHost && players.length >= 2 && (
              <button onClick={startGame} className="start-button">
                ゲームを開始
              </button>
            )}
            {isHost && players.length < 2 && (
              <p className="info-text">ゲーム開始には最低2人のプレイヤーが必要です</p>
            )}
          </div>
        )}

        {gameStatus === 'playing' && (
          <div className="game-screen">
            {!myRoll && !isRolling && !winner && (
              <div className="roll-section">
                <h2>サイコロを振ってください</h2>
                <button onClick={rollDice} className="roll-button">
                  サイコロを振る
                </button>
              </div>
            )}

            {isRolling && (
              <div className="rolling-section">
                <h2>サイコロを振っています...</h2>
                <DiceDisplay dice={null} rolling={true} />
              </div>
            )}

            {myRoll && !winner && (
              <div className="result-section">
                <h2>あなたの結果</h2>
                <DiceDisplay dice={[myRoll.dice1, myRoll.dice2, myRoll.dice3]} />
                <div className="hand-result">
                  <span className="hand-type">{myRoll.hand_type}</span>
                  {myRoll.hand_value > 0 && (
                    <span className="hand-value">値: {myRoll.hand_value}</span>
                  )}
                </div>
                {rolls.length < players.length && (
                  <p>他のプレイヤーを待っています...</p>
                )}
              </div>
            )}

            {winner && (
              <div className="winner-section">
                <h2>勝者: {winner.name}</h2>
                {myRoll && (
                  <div className="my-final-result">
                    <DiceDisplay dice={[myRoll.dice1, myRoll.dice2, myRoll.dice3]} />
                    <p>{myRoll.hand_type}</p>
                  </div>
                )}
                {isHost && (
                  <button onClick={nextRound} className="reset-button">
                    次のラウンド
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default GameRoom
