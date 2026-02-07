import { useState } from 'react'
import { placeBet } from '../lib/gameApi'
import type { Player, RoundBet } from '../types/database'
import './BettingPhase.css'

interface BettingPhaseProps {
  roundId: string
  playerId: string
  parentId: string | null
  players: Player[]
  bets: RoundBet[]
  onError?: (message: string) => void
}

function BettingPhase({
  roundId,
  playerId,
  parentId,
  players,
  bets,
  onError,
}: BettingPhaseProps) {
  const [betAmount, setBetAmount] = useState(1)
  const [isPlacing, setIsPlacing] = useState(false)

  const isParent = playerId === parentId
  const currentPlayer = players.find((p) => p.id === playerId)
  const maxBet = currentPlayer?.chips ?? 0
  const myBet = bets.find((b) => b.player_id === playerId)
  const childPlayers = players.filter((p) => p.id !== parentId)
  const betsPlaced = bets.length
  const betsRequired = childPlayers.length

  const handlePlaceBet = async () => {
    if (isPlacing || myBet) return

    setIsPlacing(true)
    try {
      await placeBet(roundId, playerId, betAmount)
    } catch (err) {
      onError?.((err as Error).message)
    } finally {
      setIsPlacing(false)
    }
  }

  const parentPlayer = players.find((p) => p.id === parentId)

  return (
    <div className="betting-phase">
      <h2>ベットフェーズ</h2>
      <div className="phase-info">
        <p className="parent-info">
          親: <strong>{parentPlayer?.name ?? '不明'}</strong>
        </p>
        <p className="bet-progress">
          ベット完了: {betsPlaced} / {betsRequired}
        </p>
      </div>

      {isParent ? (
        <div className="parent-waiting">
          <p>あなたは親です。子プレイヤーのベットを待っています...</p>
        </div>
      ) : myBet ? (
        <div className="bet-placed">
          <p>
            ベット済み: <strong>{myBet.amount}</strong> チップ
          </p>
          <p>他のプレイヤーのベットを待っています...</p>
        </div>
      ) : (
        <div className="bet-controls">
          <div className="bet-input-group">
            <label htmlFor="betAmount">ベット額:</label>
            <input
              id="betAmount"
              type="range"
              min={1}
              max={maxBet}
              step={1}
              value={betAmount}
              onChange={(e) => setBetAmount(Number(e.target.value))}
            />
            <div className="bet-amount-display">
              <input
                type="number"
                min={1}
                max={maxBet}
                step={1}
                value={betAmount}
                onChange={(e) => {
                  const val = Math.min(
                    maxBet,
                    Math.max(1, Number(e.target.value))
                  )
                  setBetAmount(val)
                }}
              />
              <span>/ {maxBet.toLocaleString()} チップ</span>
            </div>
          </div>
          <div className="quick-bets">
            <button onClick={() => setBetAmount(Math.max(1, Math.floor(maxBet * 0.1)))}>
              10%
            </button>
            <button onClick={() => setBetAmount(Math.max(1, Math.floor(maxBet * 0.25)))}>
              25%
            </button>
            <button onClick={() => setBetAmount(Math.max(1, Math.floor(maxBet * 0.5)))}>
              50%
            </button>
            <button onClick={() => setBetAmount(Math.max(1, Math.floor(maxBet * 0.75)))}>
              75%
            </button>
            <button onClick={() => setBetAmount(maxBet)}>ALL IN</button>
          </div>
          <button
            className="place-bet-button"
            onClick={handlePlaceBet}
            disabled={isPlacing || betAmount <= 0 || betAmount > maxBet}
          >
            {isPlacing ? 'ベット中...' : `${betAmount.toLocaleString()} チップをベット`}
          </button>
        </div>
      )}

      {bets.length > 0 && (
        <div className="bet-list">
          <h3>ベット状況</h3>
          {childPlayers.map((child) => {
            const childBet = bets.find((b) => b.player_id === child.id)
            return (
              <div key={child.id} className="bet-item">
                <span className="bet-player-name">{child.name}</span>
                <span
                  className={`bet-status ${childBet ? 'done' : 'waiting'}`}
                >
                  {childBet ? `${childBet.amount} チップ` : '待機中...'}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default BettingPhase
