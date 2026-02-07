import { useState, useEffect } from 'react'
import { rollDice as rollDiceApi } from '../lib/gameApi'
import DiceDisplay from './DiceDisplay'
import type { Player, PlayerRoll, RollDiceResponse } from '../types/database'
import './RollingPhase.css'

interface RollingPhaseProps {
  roundId: string
  playerId: string
  parentId: string | null
  currentTurnPlayerId: string | null
  phase: 'parent_rolling' | 'children_rolling'
  players: Player[]
  rolls: PlayerRoll[]
  parentHandType: string | null
  onError?: (message: string) => void
}

function RollingPhase({
  roundId,
  playerId,
  parentId,
  currentTurnPlayerId,
  phase,
  players,
  rolls,
  parentHandType,
  onError,
}: RollingPhaseProps) {
  const [isRolling, setIsRolling] = useState(false)
  const [lastRollResult, setLastRollResult] = useState<RollDiceResponse | null>(
    null
  )

  const isMyTurn = playerId === currentTurnPlayerId
  const currentTurnPlayer = players.find((p) => p.id === currentTurnPlayerId)

  // 自分のロール履歴
  const myRolls = rolls.filter((r) => r.player_id === playerId)
  const myFinalRoll = myRolls.find((r) => r.is_final)
  const myAttempts = myRolls.length

  // 前回の結果が変わったらリセット
  useEffect(() => {
    setLastRollResult(null)
  }, [roundId])

  const handleRoll = async () => {
    if (isRolling || !isMyTurn) return

    setIsRolling(true)
    setLastRollResult(null)

    try {
      // 振るアニメーション用に少し待つ
      await new Promise((resolve) => setTimeout(resolve, 800))
      const result = await rollDiceApi(roundId, playerId)
      setLastRollResult(result)
    } catch (err) {
      onError?.((err as Error).message)
    } finally {
      setIsRolling(false)
    }
  }

  // 各プレイヤーの最終ロールを表示用に整理
  const playerResults = players
    .filter((p) => {
      if (phase === 'parent_rolling') return p.id === parentId
      return p.id !== parentId
    })
    .map((p) => {
      const playerRolls = rolls.filter((r) => r.player_id === p.id)
      const finalRoll = playerRolls.find((r) => r.is_final)
      return {
        ...p,
        rolls: playerRolls,
        finalRoll,
        attempts: playerRolls.length,
      }
    })

  return (
    <div className="rolling-phase">
      <h2>{phase === 'parent_rolling' ? '親のターン' : '子のターン'}</h2>

      <div className="phase-info">
        {parentHandType && (
          <p className="parent-hand">
            親の役: <strong>{parentHandType}</strong>
          </p>
        )}
        <p className="current-turn">
          現在のターン:{' '}
          <strong className={isMyTurn ? 'my-turn' : ''}>
            {currentTurnPlayer?.name ?? '待機中'}
            {isMyTurn && ' (あなた)'}
          </strong>
        </p>
      </div>

      {/* 自分のターンの場合 */}
      {isMyTurn && !myFinalRoll && (
        <div className="roll-section">
          {isRolling ? (
            <div className="rolling-animation">
              <DiceDisplay dice={null} rolling={true} />
              <p>サイコロを振っています...</p>
            </div>
          ) : (
            <>
              {lastRollResult && !lastRollResult.decided && (
                <div className="roll-result bara">
                  <DiceDisplay
                    dice={[
                      lastRollResult.roll.dice1,
                      lastRollResult.roll.dice2,
                      lastRollResult.roll.dice3,
                    ]}
                  />
                  <p className="hand-name">
                    {lastRollResult.hand.displayName}
                  </p>
                  <p className="retry-message">
                    もう一度振れます（{lastRollResult.attempt}/3 回目）
                  </p>
                </div>
              )}
              <p className="attempt-info">振り回数: {myAttempts}/3</p>
              <button
                className="roll-button"
                onClick={handleRoll}
                disabled={isRolling}
              >
                サイコロを振る
              </button>
            </>
          )}
        </div>
      )}

      {/* 自分のロールが確定した場合 */}
      {myFinalRoll && (
        <div className="my-result">
          <h3>あなたの結果</h3>
          <DiceDisplay
            dice={[myFinalRoll.dice1, myFinalRoll.dice2, myFinalRoll.dice3]}
          />
          <p className="hand-name final">{myFinalRoll.hand_type}</p>
          {!isMyTurn && phase === 'children_rolling' && (
            <p className="waiting-others">他のプレイヤーを待っています...</p>
          )}
        </div>
      )}

      {/* 他のプレイヤーのターンを待っている場合 */}
      {!isMyTurn && !myFinalRoll && (
        <div className="waiting-turn">
          <p>
            {currentTurnPlayer?.name ?? '不明'} がサイコロを振っています...
          </p>
        </div>
      )}

      {/* 全プレイヤーの結果一覧 */}
      <div className="results-list">
        <h3>結果</h3>
        {playerResults.map((p) => (
          <div
            key={p.id}
            className={`result-item ${p.id === currentTurnPlayerId ? 'active' : ''} ${p.finalRoll ? 'decided' : ''}`}
          >
            <span className="result-name">
              {p.name}
              {p.id === parentId && ' 👑'}
            </span>
            {p.finalRoll ? (
              <span className="result-hand">
                [{p.finalRoll.dice1}, {p.finalRoll.dice2},{' '}
                {p.finalRoll.dice3}]{' '}
                <strong>{p.finalRoll.hand_type}</strong>
              </span>
            ) : p.attempts > 0 ? (
              <span className="result-rolling">
                振り中... ({p.attempts}/3)
              </span>
            ) : (
              <span className="result-waiting">待機中</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default RollingPhase
