import { useState } from 'react'
import { useRealtimeGame } from '../hooks/useRealtimeGame'
import { startGame as startGameApi, leaveRoom as leaveRoomApi } from '../lib/gameApi'
import PlayerList from './PlayerList'
import BettingPhase from './BettingPhase'
import RollingPhase from './RollingPhase'
import SettlementPhase from './SettlementPhase'
import type { User } from '@supabase/supabase-js'
import './GameRoom.css'

interface GameRoomProps {
  roomId: string
  playerId: string
  isHost: boolean
  playerName: string
  user: User | null
}

function GameRoom({
  roomId,
  playerId,
  isHost: initialIsHost,
}: GameRoomProps) {
  const {
    room,
    players,
    gameRound,
    rolls,
    bets,
    gameStatus,
  } = useRealtimeGame(roomId, playerId)

  const [error, setError] = useState('')

  const isHost =
    players.find((p) => p.id === playerId)?.is_host ?? initialIsHost

  const handleError = (message: string) => {
    setError(message)
    // 5秒後にエラーを自動クリア
    setTimeout(() => setError(''), 5000)
  }

  const handleStartGame = async () => {
    if (!isHost) return

    try {
      setError('')
      await startGameApi(roomId, playerId)
    } catch (err) {
      console.error('Error starting game:', err)
      handleError((err as Error).message || 'ゲームの開始に失敗しました')
    }
  }

  const leaveRoom = async () => {
    try {
      await leaveRoomApi(roomId, playerId)
    } catch (err) {
      console.error('Error leaving room:', err)
    }
    window.location.reload()
  }

  const currentPhase = gameRound?.phase ?? null

  return (
    <div className="game-room">
      <div className="game-room-container">
        <div className="game-header">
          <h1>チンチロオンライン</h1>
          <div className="room-info">
            <span>ルーム: {room?.name || 'Loading...'}</span>
            <span className="room-id">
              ID: {room?.room_code ?? roomId.substring(0, 8)}
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
          parentId={gameRound?.parent_id}
          currentTurnPlayerId={gameRound?.current_turn_player_id}
          rolls={rolls}
          bets={bets}
        />

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
              <p className="waiting-host">
                ホストがゲームを開始するのを待っています
              </p>
            )}
          </div>
        )}

        {gameStatus === 'playing' &&
          currentPhase === 'betting' &&
          gameRound && (
            <BettingPhase
              roundId={gameRound.id}
              playerId={playerId}
              parentId={gameRound.parent_id}
              players={players}
              bets={bets}
              onError={handleError}
            />
          )}

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

        {gameStatus === 'playing' &&
          currentPhase === 'settlement' &&
          gameRound && (
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

        {gameStatus === 'finished' && (
          <div className="game-finished-screen">
            <h2>ゲーム終了!</h2>
            <div className="final-standings">
              <h3>最終結果</h3>
              {[...players]
                .sort((a, b) => (b.chips ?? 0) - (a.chips ?? 0))
                .map((p, index) => (
                  <div
                    key={p.id}
                    className={`standing-item rank-${index + 1}`}
                  >
                    <span className="rank">#{index + 1}</span>
                    <span className="standing-name">
                      {p.name}
                      {p.id === playerId && ' (あなた)'}
                    </span>
                    <span className="standing-chips">
                      {p.chips ?? 0} チップ
                    </span>
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
