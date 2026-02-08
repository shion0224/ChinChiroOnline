import { useState, useEffect } from 'react'
import { useRealtimeGame } from '../hooks/useRealtimeGame'
import {
  startGame as startGameApi,
  leaveRoom as leaveRoomApi,
  setChips as setChipsApi,
  requestLeave as requestLeaveApi,
  voteLeave as voteLeaveApi,
} from '../lib/gameApi'
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
    leaveRequest,
    leaveVotes,
    loadRoomData,
    loadPlayers,
    loadGameRound,
    loadLeaveRequest,
  } = useRealtimeGame(roomId, playerId)

  const [error, setError] = useState('')
  const [chipInput, setChipInput] = useState(1000)
  const [isSavingChips, setIsSavingChips] = useState(false)
  const [isRequestingLeave, setIsRequestingLeave] = useState(false)
  const [isVoting, setIsVoting] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)

  const isHost =
    players.find((p) => p.id === playerId)?.is_host ?? initialIsHost
  const myPlayer = players.find((p) => p.id === playerId)

  // 自分が退出リクエストを出しているか
  const isMyLeaveRequest = leaveRequest?.requester_id === playerId
  // 自分が既に投票済みか
  const myVote = leaveVotes.find((v) => v.voter_id === playerId)
  // リクエスト者の名前
  const requesterName = leaveRequest
    ? players.find((p) => p.id === leaveRequest.requester_id)?.name ?? '不明'
    : ''
  // 投票対象の人数（リクエスト者以外）
  const totalVotersNeeded = leaveRequest
    ? players.filter((p) => p.id !== leaveRequest.requester_id).length
    : 0

  const handleError = (message: string) => {
    setError(message)
    setTimeout(() => setError(''), 5000)
  }

  // --- 残り1人になったら自動でホームに戻る ---
  useEffect(() => {
    // 自分がまだルームにいるか確認
    const stillInRoom = players.some((p) => p.id === playerId)

    if (!stillInRoom && players.length > 0) {
      // 自分が削除された（退出が承認された等）
      sessionStorage.removeItem('chinchiro_session')
      window.location.reload()
      return
    }

    if (players.length === 1 && gameStatus === 'finished' && stillInRoom) {
      // 1人だけ残ってゲーム終了 → 3秒後にホームへ
      const timer = setTimeout(() => {
        sessionStorage.removeItem('chinchiro_session')
        window.location.reload()
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [players, playerId, gameStatus])

  // --- 退出リクエストが承認/却下されたら通知 ---
  useEffect(() => {
    if (!leaveRequest) return
    // approved → リクエスト者はリロードで退出される（上のeffectで検知）
    // rejected → モーダルを閉じてメッセージ表示
  }, [leaveRequest])

  const handleStartGame = async () => {
    if (!isHost) return

    try {
      setError('')
      await startGameApi(roomId, playerId)
      await Promise.all([loadRoomData(), loadGameRound(), loadPlayers()])
    } catch (err) {
      console.error('Error starting game:', err)
      handleError((err as Error).message || 'ゲームの開始に失敗しました')
    }
  }

  // --- 即退出（waiting / finished 時）---
  const leaveRoomImmediate = async () => {
    try {
      await leaveRoomApi(roomId, playerId)
    } catch (err) {
      console.error('Error leaving room:', err)
    }
    sessionStorage.removeItem('chinchiro_session')
    window.location.reload()
  }

  // --- 退出ボタン押下 ---
  const handleLeaveClick = () => {
    if (gameStatus === 'waiting' || gameStatus === 'finished') {
      // 待機中・終了後は即退出
      leaveRoomImmediate()
    } else {
      // ゲーム中は確認ダイアログを表示
      setShowLeaveConfirm(true)
    }
  }

  // --- 退出リクエスト送信 ---
  const handleRequestLeave = async () => {
    setIsRequestingLeave(true)
    try {
      const result = await requestLeaveApi(roomId, playerId)
      if (result.immediate) {
        // 即退出可能（waiting状態だった等）
        await leaveRoomImmediate()
        return
      }
      // リクエスト作成成功 → 投票を待つ
      await loadLeaveRequest()
      setShowLeaveConfirm(false)
    } catch (err) {
      handleError((err as Error).message)
    } finally {
      setIsRequestingLeave(false)
    }
  }

  // --- 退出リクエストへの投票 ---
  const handleVoteLeave = async (approved: boolean) => {
    if (!leaveRequest || isVoting) return
    setIsVoting(true)
    try {
      await voteLeaveApi(leaveRequest.id, playerId, approved)
      await loadLeaveRequest()
      // 承認された場合、プレイヤーリストが更新される
      await loadPlayers()
      await loadRoomData()
    } catch (err) {
      handleError((err as Error).message)
    } finally {
      setIsVoting(false)
    }
  }

  // --- 退出リクエストキャンセル（確認ダイアログを閉じる） ---
  const handleCancelLeaveConfirm = () => {
    setShowLeaveConfirm(false)
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
          <button onClick={handleLeaveClick} className="leave-button">
            退出
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {/* --- 退出確認ダイアログ（ゲーム中） --- */}
        {showLeaveConfirm && (
          <div className="leave-modal-overlay">
            <div className="leave-modal">
              <h3>退出の確認</h3>
              <p>ゲーム中に退出するには、他のプレイヤー全員の同意が必要です。</p>
              <p>退出リクエストを送信しますか？</p>
              <div className="leave-modal-buttons">
                <button
                  className="leave-modal-confirm"
                  onClick={handleRequestLeave}
                  disabled={isRequestingLeave}
                >
                  {isRequestingLeave ? '送信中...' : 'リクエストを送信'}
                </button>
                <button
                  className="leave-modal-cancel"
                  onClick={handleCancelLeaveConfirm}
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        )}

        {/* --- 退出リクエスト通知バナー --- */}
        {leaveRequest && leaveRequest.status === 'pending' && (
          <div className="leave-request-banner">
            {isMyLeaveRequest ? (
              <div className="leave-request-mine">
                <p>退出リクエストを送信しました。他のプレイヤーの同意を待っています...</p>
                <p className="leave-vote-progress">
                  同意: {leaveVotes.filter((v) => v.approved).length} / {totalVotersNeeded}
                </p>
              </div>
            ) : (
              <div className="leave-request-other">
                <p>
                  <strong>{requesterName}</strong> が退出を希望しています
                </p>
                {myVote ? (
                  <p className="leave-vote-done">
                    {myVote.approved ? '同意しました' : '拒否しました'}
                  </p>
                ) : (
                  <div className="leave-vote-buttons">
                    <button
                      className="leave-vote-approve"
                      onClick={() => handleVoteLeave(true)}
                      disabled={isVoting}
                    >
                      {isVoting ? '...' : '同意する'}
                    </button>
                    <button
                      className="leave-vote-reject"
                      onClick={() => handleVoteLeave(false)}
                      disabled={isVoting}
                    >
                      {isVoting ? '...' : '拒否する'}
                    </button>
                  </div>
                )}
                <p className="leave-vote-progress">
                  同意: {leaveVotes.filter((v) => v.approved).length} / {totalVotersNeeded}
                </p>
              </div>
            )}
          </div>
        )}

        {/* --- 1人残り → ゲーム終了通知 --- */}
        {players.length === 1 && gameStatus === 'finished' && (
          <div className="alone-notice">
            <h2>対戦相手がいなくなりました</h2>
            <p>まもなくホームに戻ります...</p>
          </div>
        )}

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

            {isHost ? (
              <>
                <div className="chips-setting">
                  <h3>初期チップ額（全員共通）</h3>
                  <div className="chips-input-row">
                    <input
                      type="number"
                      value={chipInput}
                      onChange={(e) => setChipInput(Math.max(100, Number(e.target.value)))}
                      min={100}
                      max={1000000}
                      step={100}
                    />
                    <button
                      className="save-chips-button"
                      onClick={async () => {
                        setIsSavingChips(true)
                        try {
                          await setChipsApi(roomId, playerId, chipInput)
                          await loadPlayers()
                        } catch (err) {
                          handleError((err as Error).message)
                        } finally {
                          setIsSavingChips(false)
                        }
                      }}
                      disabled={isSavingChips}
                    >
                      {isSavingChips ? '設定中...' : '設定'}
                    </button>
                  </div>
                  <div className="chips-presets">
                    {[500, 1000, 5000, 10000, 50000].map((v) => (
                      <button
                        key={v}
                        className={chipInput === v ? 'active' : ''}
                        onClick={() => setChipInput(v)}
                      >
                        {v.toLocaleString()}
                      </button>
                    ))}
                  </div>
                  <p className="chips-current">
                    現在の設定: <strong>{(myPlayer?.chips ?? 1000).toLocaleString()}</strong> チップ
                  </p>
                </div>

                {players.length < 2 ? (
                  <p className="min-players-warning">
                    最低2人のプレイヤーが必要です
                  </p>
                ) : (
                  <button onClick={handleStartGame} className="start-button">
                    ゲームを開始
                  </button>
                )}
              </>
            ) : (
              <div className="waiting-host-section">
                <p className="chips-current">
                  初期チップ: <strong>{(myPlayer?.chips ?? 1000).toLocaleString()}</strong> チップ
                </p>
                <p className="waiting-host">
                  ホストがゲームを開始するのを待っています...
                </p>
              </div>
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

        {gameStatus === 'finished' && players.length > 1 && (
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
            <button onClick={leaveRoomImmediate} className="leave-button large">
              ロビーに戻る
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default GameRoom
