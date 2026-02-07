import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { startGame } from '../lib/gameApi'
import BettingPhase from './BettingPhase'
import RollingPhase from './RollingPhase'
import SettlementPhase from './SettlementPhase'
import PlayerList from './PlayerList'
import './GameRoom.css'

function GameRoom({ roomId, playerId, isHost, playerName }) {
  const [players, setPlayers] = useState([])
  const [gameRound, setGameRound] = useState(null)
  const [rolls, setRolls] = useState([])
  const [bets, setBets] = useState([])
  const [room, setRoom] = useState(null)
  const [gameStatus, setGameStatus] = useState('waiting')
  const [error, setError] = useState('')

  // ---- データ読み込み関数 ----

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

  const loadPlayers = useCallback(async () => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('turn_order', { ascending: true })

    if (!error && data) {
      setPlayers(data)
    }
  }, [roomId])

  const loadCurrentRound = useCallback(async () => {
    const { data, error } = await supabase
      .from('game_rounds')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'playing')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!error && data) {
      setGameRound(data)
    } else {
      setGameRound(null)
    }
  }, [roomId])

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

  const loadBets = useCallback(async () => {
    if (!gameRound) {
      setBets([])
      return
    }

    const { data, error } = await supabase
      .from('round_bets')
      .select('*')
      .eq('game_round_id', gameRound.id)

    if (!error && data) {
      setBets(data)
    }
  }, [gameRound])

  // ---- 初期読み込み ----

  useEffect(() => {
    loadRoomData()
    loadPlayers()
  }, [loadRoomData, loadPlayers])

  // ゲームが playing の時にラウンドを読み込む
  useEffect(() => {
    if (gameStatus === 'playing') {
      loadCurrentRound()
    }
  }, [gameStatus, loadCurrentRound])

  // ラウンドが変わったらロールとベットを読み込む
  useEffect(() => {
    if (gameRound) {
      loadRolls()
      loadBets()
    } else {
      setRolls([])
      setBets([])
    }
  }, [gameRound, loadRolls, loadBets])

  // ---- Realtime サブスクリプション ----

  useEffect(() => {
    // ルーム状態の監視
    const roomChannel = supabase
      .channel(`room-${roomId}-room`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => {
          loadRoomData()
        }
      )
      .subscribe()

    // プレイヤーの参加/退出/更新の監視
    const playersChannel = supabase
      .channel(`room-${roomId}-players`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        () => {
          loadPlayers()
        }
      )
      .subscribe()

    // ゲームラウンドの監視
    const roundsChannel = supabase
      .channel(`room-${roomId}-rounds`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_rounds', filter: `room_id=eq.${roomId}` },
        () => {
          loadCurrentRound()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(roomChannel)
      supabase.removeChannel(playersChannel)
      supabase.removeChannel(roundsChannel)
      // クリーンアップ時にプレイヤーを削除
      if (playerId) {
        supabase.from('players').delete().eq('id', playerId).then(() => {})
      }
    }
  }, [roomId, playerId, loadRoomData, loadPlayers, loadCurrentRound])

  // ロールの監視（ラウンドが変わるたびに再購読）
  useEffect(() => {
    if (!gameRound) return

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
        () => {
          loadRolls()
        }
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
        () => {
          loadBets()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(rollsChannel)
      supabase.removeChannel(betsChannel)
    }
  }, [roomId, gameRound, loadRolls, loadBets])

  // ---- アクション ----

  const handleStartGame = async () => {
    if (!isHost) return

    try {
      setError('')
      await startGame(roomId, playerId)
    } catch (err) {
      console.error('Error starting game:', err)
      setError(err.message || 'ゲーム開始に失敗しました')
    }
  }

  const handleError = (message) => {
    setError(message)
    setTimeout(() => setError(''), 5000)
  }

  const leaveRoom = () => {
    window.location.reload()
  }

  // ---- レンダリング ----

  const currentPhase = gameRound?.phase ?? null

  return (
    <div className="game-room">
      <div className="game-room-container">
        {/* ヘッダー */}
        <div className="game-header">
          <h1>チンチロオンライン</h1>
          <div className="room-info">
            <span>ルーム: {room?.name || 'Loading...'}</span>
            <span className="room-id">ID: {roomId.substring(0, 8)}...</span>
            {gameRound && (
              <span className="round-number">
                ラウンド {gameRound.round_number}
              </span>
            )}
          </div>
          <button onClick={leaveRoom} className="leave-button">
            退出
          </button>
        </div>

        {/* エラー表示 */}
        {error && <div className="error-message">{error}</div>}

        {/* プレイヤーリスト */}
        <PlayerList
          players={players}
          currentPlayerId={playerId}
          parentId={gameRound?.parent_id}
          currentTurnPlayerId={gameRound?.current_turn_player_id}
          rolls={rolls}
          bets={bets}
        />

        {/* ゲーム状態に応じたUI */}

        {/* 待機画面 */}
        {gameStatus === 'waiting' && (
          <div className="waiting-screen">
            <h2>ゲーム開始を待っています...</h2>
            <p>{players.length}人のプレイヤーが参加しています</p>
            {players.length < 2 && (
              <p className="min-players-warning">
                最低2人のプレイヤーが必要です
              </p>
            )}
            {isHost && players.length >= 2 && (
              <button onClick={handleStartGame} className="start-button">
                ゲームを開始
              </button>
            )}
            {!isHost && (
              <p className="waiting-host">ホストがゲームを開始するのを待っています</p>
            )}
          </div>
        )}

        {/* ベットフェーズ */}
        {gameStatus === 'playing' && currentPhase === 'betting' && gameRound && (
          <BettingPhase
            roundId={gameRound.id}
            playerId={playerId}
            parentId={gameRound.parent_id}
            players={players}
            bets={bets}
            onError={handleError}
          />
        )}

        {/* 親/子のロールフェーズ */}
        {gameStatus === 'playing' &&
          (currentPhase === 'parent_rolling' ||
            currentPhase === 'children_rolling') &&
          gameRound && (
            <RollingPhase
              roundId={gameRound.id}
              playerId={playerId}
              parentId={gameRound.parent_id}
              currentTurnPlayerId={gameRound.current_turn_player_id}
              phase={currentPhase}
              players={players}
              rolls={rolls}
              parentHandType={gameRound.parent_hand_type}
              onError={handleError}
            />
          )}

        {/* 精算フェーズ */}
        {gameStatus === 'playing' && currentPhase === 'settlement' && gameRound && (
          <SettlementPhase
            roundId={gameRound.id}
            playerId={playerId}
            parentId={gameRound.parent_id}
            players={players}
            rolls={rolls}
            bets={bets}
            parentHandType={gameRound.parent_hand_type}
            isHost={isHost}
            onError={handleError}
          />
        )}

        {/* ゲーム終了 */}
        {gameStatus === 'finished' && (
          <div className="game-finished-screen">
            <h2>ゲーム終了!</h2>
            <div className="final-standings">
              <h3>最終結果</h3>
              {[...players]
                .sort((a, b) => b.chips - a.chips)
                .map((p, index) => (
                  <div key={p.id} className={`standing-item rank-${index + 1}`}>
                    <span className="rank">#{index + 1}</span>
                    <span className="standing-name">
                      {p.name}
                      {p.id === playerId && ' (あなた)'}
                    </span>
                    <span className="standing-chips">{p.chips} チップ</span>
                  </div>
                ))}
            </div>
            <button onClick={leaveRoom} className="leave-button large">
              ロビーに戻る
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default GameRoom
