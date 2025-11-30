import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { rollAndEvaluate } from '../utils/gameLogic'
import DiceDisplay from './DiceDisplay'
import PlayerList from './PlayerList'
import './GameRoom.css'

function GameRoom({ roomId, playerId, isHost, playerName }) {
  const [players, setPlayers] = useState([])
  const [gameRound, setGameRound] = useState(null)
  const [rolls, setRolls] = useState([])
  const [myRoll, setMyRoll] = useState(null)
  const [isRolling, setIsRolling] = useState(false)
  const [room, setRoom] = useState(null)
  const [gameStatus, setGameStatus] = useState('waiting') // waiting, playing, finished
  const [winner, setWinner] = useState(null)

  // ルーム情報とプレイヤー情報を読み込む
  useEffect(() => {
    loadRoomData()
    loadPlayers()

    // Realtime購読
    const playersChannel = supabase
      .channel(`room-${roomId}-players`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'players', filter: `room_id=eq.${roomId}` },
        () => {
          loadPlayers()
        }
      )
      .subscribe()

    const roomChannel = supabase
      .channel(`room-${roomId}-room`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` },
        () => {
          loadRoomData()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(playersChannel)
      supabase.removeChannel(roomChannel)
      // クリーンアップ時にプレイヤーを削除
      if (playerId) {
        supabase.from('players').delete().eq('id', playerId).then(() => {})
      }
    }
  }, [roomId, playerId])

  const loadRoomData = async () => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single()

    if (!error && data) {
      setRoom(data)
      setGameStatus(data.status)
    }
  }

  const loadPlayers = async () => {
    const { data, error } = await supabase
      .from('players')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })

    if (!error && data) {
      setPlayers(data)
    }
  }

  const loadRolls = async () => {
    if (!gameRound) return

    const { data, error } = await supabase
      .from('player_rolls')
      .select('*')
      .eq('game_round_id', gameRound.id)
      .order('rolled_at', { ascending: true })

    if (!error && data) {
      setRolls(data)
      const myRollData = data.find(r => r.player_id === playerId)
      setMyRoll(myRollData)
    }
  }

  // サイコロ結果のRealtime購読
  useEffect(() => {
    if (!gameRound) return

    const rollsChannel = supabase
      .channel(`room-${roomId}-rolls`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'player_rolls' },
        () => {
          loadRolls()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(rollsChannel)
    }
  }, [gameRound, roomId])

  // ゲームラウンドが変更されたらロールを読み込む
  useEffect(() => {
    if (gameRound) {
      loadRolls()
    }
  }, [gameRound])

  // ゲームラウンドを読み込む
  useEffect(() => {
    if (gameStatus === 'playing') {
      loadGameRound()
    }
  }, [gameStatus, roomId])

  const loadGameRound = async () => {
    const { data, error } = await supabase
      .from('game_rounds')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'playing')
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (!error && data) {
      setGameRound(data)
    } else if (error && error.code === 'PGRST116') {
      // ラウンドが存在しない場合は作成
      if (isHost) {
        await createGameRound()
      }
    }
  }

  const createGameRound = async () => {
    const { data, error } = await supabase
      .from('game_rounds')
      .insert({
        room_id: roomId,
        round_number: 1,
        status: 'playing'
      })
      .select()
      .single()

    if (!error && data) {
      setGameRound(data)
    }
  }

  const startGame = async () => {
    if (!isHost) return

    try {
      await supabase
        .from('rooms')
        .update({ status: 'playing' })
        .eq('id', roomId)

      await createGameRound()
    } catch (err) {
      console.error('Error starting game:', err)
    }
  }

  const rollDice = async () => {
    if (!gameRound || myRoll || isRolling) return

    setIsRolling(true)

    // サイコロを振るアニメーションのため少し待つ
    await new Promise(resolve => setTimeout(resolve, 1000))

    const { dice, hand } = rollAndEvaluate()

    try {
      const { data, error } = await supabase
        .from('player_rolls')
        .insert({
          game_round_id: gameRound.id,
          player_id: playerId,
          dice1: dice[0],
          dice2: dice[1],
          dice3: dice[2],
          hand_type: hand.displayName,
          hand_value: hand.handValue || 0
        })
        .select()
        .single()

      if (error) throw error

      setMyRoll(data)
      setIsRolling(false)

      // 全員がサイコロを振ったか確認
      setTimeout(checkAllRolled, 500)
    } catch (err) {
      console.error('Error rolling dice:', err)
      setIsRolling(false)
    }
  }

  const checkAllRolled = async () => {
    if (!gameRound) return

    const { data: allRolls, error } = await supabase
      .from('player_rolls')
      .select('*')
      .eq('game_round_id', gameRound.id)

    if (error) return

    // 全プレイヤーがサイコロを振ったか確認
    if (allRolls.length === players.length && players.length > 0) {
      determineWinner(allRolls)
    }
  }

  const determineWinner = async (allRolls) => {
    if (allRolls.length === 0) return

    // 手の強さで比較
    const sortedRolls = allRolls.sort((a, b) => {
      const aStrength = getHandStrengthFromDB(a)
      const bStrength = getHandStrengthFromDB(b)
      return bStrength - aStrength
    })

    const winnerRoll = sortedRolls[0]
    const winnerPlayer = players.find(p => p.id === winnerRoll.player_id)

    setWinner(winnerPlayer)

    // ゲームラウンドを終了
    if (gameRound) {
      await supabase
        .from('game_rounds')
        .update({ status: 'finished' })
        .eq('id', gameRound.id)
    }
  }

  const getHandStrengthFromDB = (roll) => {
    const handType = roll.hand_type
    const handValue = roll.hand_value || 0

    // ピンゾロ
    if (handType === 'ピンゾロ') return 1000
    
    // ゾロ目（例: "2のゾロ"）
    if (handType.includes('ゾロ')) {
      const zoroValue = parseInt(handType.match(/\d+/)?.[0]) || 0
      return 900 + zoroValue
    }
    
    // シゴロ
    if (handType === 'シゴロ') return 800
    
    // 目なし
    if (handType === '目なし') return 700
    
    // 通常目（例: "2の5"）
    if (handType.includes('の') && handType !== '目なし') {
      return 100 + handValue
    }
    
    // 役なし
    return 0
  }

  const resetGame = async () => {
    if (!isHost) return

    try {
      // ラウンドを削除
      if (gameRound) {
        await supabase.from('game_rounds').delete().eq('id', gameRound.id)
      }

      // プレイヤーのロールを削除
      await supabase.from('player_rolls').delete().eq('game_round_id', gameRound?.id)

      // ルームを待機状態に戻す
      await supabase
        .from('rooms')
        .update({ status: 'waiting' })
        .eq('id', roomId)

      setGameRound(null)
      setRolls([])
      setMyRoll(null)
      setWinner(null)
      setGameStatus('waiting')
    } catch (err) {
      console.error('Error resetting game:', err)
    }
  }

  const leaveRoom = () => {
    window.location.reload()
  }

  return (
    <div className="game-room">
      <div className="game-room-container">
        <div className="game-header">
          <h1>🎲 チンチロオンライン</h1>
          <div className="room-info">
            <span>ルーム: {room?.name || 'Loading...'}</span>
            <span className="room-id">ID: {roomId.substring(0, 8)}...</span>
          </div>
          <button onClick={leaveRoom} className="leave-button">退出</button>
        </div>

        <PlayerList players={players} currentPlayerId={playerId} rolls={rolls} />

        {gameStatus === 'waiting' && (
          <div className="waiting-screen">
            <h2>ゲーム開始を待っています...</h2>
            <p>{players.length}人のプレイヤーが参加しています</p>
            {isHost && (
              <button onClick={startGame} className="start-button">
                ゲームを開始
              </button>
            )}
          </div>
        )}

        {gameStatus === 'playing' && (
          <div className="game-screen">
            {!myRoll && !isRolling && (
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

            {myRoll && (
              <div className="result-section">
                <h2>あなたの結果</h2>
                <DiceDisplay dice={[myRoll.dice1, myRoll.dice2, myRoll.dice3]} />
                <div className="hand-result">
                  <span className="hand-type">{myRoll.hand_type}</span>
                  {myRoll.hand_value && (
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
                <h2>🎉 勝者: {winner.name} 🎉</h2>
                {isHost && (
                  <button onClick={resetGame} className="reset-button">
                    もう一度プレイ
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

