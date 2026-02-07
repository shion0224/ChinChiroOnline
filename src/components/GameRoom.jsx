import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useRealtimeGame } from '../hooks/useRealtimeGame'
import DiceDisplay from './DiceDisplay'
import PlayerList from './PlayerList'
import './GameRoom.css'

function GameRoom({ roomId, playerId, isHost: initialIsHost, playerName }) {
  const {
    room,
    players,
    gameRound,
    rolls,
    gameStatus,
    setGameRound,
    setRolls,
    setGameStatus,
  } = useRealtimeGame(roomId, playerId)

  const [myRoll, setMyRoll] = useState(null)
  const [isRolling, setIsRolling] = useState(false)
  const [winner, setWinner] = useState(null)
  const [error, setError] = useState('')

  // 現在のプレイヤーがホストかどうかを動的に判定
  const isHost = players.find((p) => p.id === playerId)?.is_host ?? initialIsHost

  // rollsが変更されたら自分のロール結果を更新
  useEffect(() => {
    if (rolls.length > 0) {
      const myRollData = rolls.find((r) => r.player_id === playerId)
      if (myRollData) {
        setMyRoll(myRollData)
      }
    }
  }, [rolls, playerId])

  // ゲームラウンドが finished になったら勝者を取得
  useEffect(() => {
    if (gameRound?.status === 'finished' && gameRound?.winner_player_id) {
      const winnerPlayer = players.find(
        (p) => p.id === gameRound.winner_player_id
      )
      if (winnerPlayer) {
        setWinner(winnerPlayer)
      }
    }
  }, [gameRound, players])

  // ゲーム開始（ホストのみ）
  const startGame = async () => {
    if (!isHost) return

    try {
      setError('')

      const { data, error: fnError } = await supabase.functions.invoke(
        'start-game',
        {
          body: { playerId, roomId },
        }
      )

      if (fnError) throw fnError

      if (data.error) {
        throw new Error(data.error)
      }
    } catch (err) {
      console.error('Error starting game:', err)
      setError(err.message || 'ゲームの開始に失敗しました')
    }
  }

  // サイコロを振る（Edge Function経由）
  const rollDice = async () => {
    if (!gameRound || myRoll || isRolling) return

    setIsRolling(true)
    setError('')

    // サイコロを振るアニメーションのため少し待つ
    await new Promise((resolve) => setTimeout(resolve, 1000))

    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        'roll-dice',
        {
          body: { playerId, gameRoundId: gameRound.id },
        }
      )

      if (fnError) throw fnError

      if (data.error) {
        throw new Error(data.error)
      }

      // サーバーから返された結果をセット
      setMyRoll({
        dice1: data.roll.dice[0],
        dice2: data.roll.dice[1],
        dice3: data.roll.dice[2],
        hand_type: data.roll.handType,
        hand_value: data.roll.handValue,
      })

      // 全員振り終わって勝者が決定された場合
      if (data.allRolled && data.winner) {
        setWinner(data.winner)
      }
    } catch (err) {
      console.error('Error rolling dice:', err)
      setError(err.message || 'サイコロを振るのに失敗しました')
    } finally {
      setIsRolling(false)
    }
  }

  // もう一度プレイ（ホストのみ）
  const resetGame = async () => {
    if (!isHost) return

    try {
      setError('')

      // ルームを待機状態に戻す
      await supabase
        .from('rooms')
        .update({ status: 'waiting' })
        .eq('id', roomId)

      setMyRoll(null)
      setWinner(null)
      setRolls([])
      setGameRound(null)
      setGameStatus('waiting')
    } catch (err) {
      console.error('Error resetting game:', err)
      setError(err.message || 'ゲームのリセットに失敗しました')
    }
  }

  // ルームから退出
  const leaveRoom = async () => {
    try {
      await supabase.functions.invoke('leave-room', {
        body: { playerId, roomId },
      })
    } catch (err) {
      console.error('Error leaving room:', err)
    }
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
            <span className="room-id">
              ID: {roomId.substring(0, 8)}...
            </span>
          </div>
          <button onClick={leaveRoom} className="leave-button">
            退出
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        <PlayerList
          players={players}
          currentPlayerId={playerId}
          rolls={rolls}
        />

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

            {myRoll && (
              <div className="result-section">
                <h2>あなたの結果</h2>
                <DiceDisplay
                  dice={[myRoll.dice1, myRoll.dice2, myRoll.dice3]}
                />
                <div className="hand-result">
                  <span className="hand-type">{myRoll.hand_type}</span>
                  {myRoll.hand_value > 0 && (
                    <span className="hand-value">
                      値: {myRoll.hand_value}
                    </span>
                  )}
                </div>
                {!winner && rolls.length < players.length && (
                  <p>他のプレイヤーを待っています...</p>
                )}
              </div>
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
