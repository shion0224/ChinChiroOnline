import { useState, useEffect } from 'react'
import { settleRound } from '../lib/gameApi'
import type {
  Player,
  PlayerRoll,
  RoundBet,
  SettleRoundResponse,
} from '../types/database'
import './SettlementPhase.css'

interface SettlementPhaseProps {
  roundId: string
  playerId: string
  parentId: string | null
  players: Player[]
  rolls: PlayerRoll[]
  bets: RoundBet[]
  parentHandType: string | null
  isHost: boolean
  onError?: (message: string) => void
}

function SettlementPhase({
  roundId,
  playerId,
  parentId,
  players,
  rolls,
  bets,
  parentHandType,
  onError,
}: SettlementPhaseProps) {
  const [isSettling, setIsSettling] = useState(false)
  const [results, setResults] = useState<SettleRoundResponse | null>(null)
  const [settled, setSettled] = useState(false)

  const parentPlayer = players.find((p) => p.id === parentId)

  // 精算済みか確認（betsにsettled=trueがあるか）
  useEffect(() => {
    const anySettled = bets.some((b) => b.settled)
    if (anySettled && !settled) {
      setSettled(true)
    }
  }, [bets, settled])

  const handleSettle = async () => {
    if (isSettling || settled) return

    setIsSettling(true)
    try {
      const data = await settleRound(roundId, playerId)
      setResults(data)
      setSettled(true)
    } catch (err) {
      onError?.((err as Error).message)
    } finally {
      setIsSettling(false)
    }
  }

  // 最終ロール結果の一覧
  const finalRolls = rolls.filter((r) => r.is_final)

  return (
    <div className="settlement-phase">
      <h2>精算フェーズ</h2>

      <div className="parent-result">
        <p>
          親 ({parentPlayer?.name ?? '不明'}) の役:{' '}
          <strong>{parentHandType || '不明'}</strong>
        </p>
      </div>

      {/* 全プレイヤーの最終結果 */}
      <div className="all-results">
        <h3>ロール結果</h3>
        {players.map((p) => {
          const roll = finalRolls.find((r) => r.player_id === p.id)
          const bet = bets.find((b) => b.player_id === p.id)
          const isParent = p.id === parentId

          return (
            <div
              key={p.id}
              className={`result-row ${isParent ? 'parent' : ''}`}
            >
              <div className="result-player">
                <span className="result-player-name">
                  {p.name}
                  {isParent && ' 👑'}
                </span>
                {roll && (
                  <span className="result-dice">
                    [{roll.dice1}, {roll.dice2}, {roll.dice3}]
                  </span>
                )}
              </div>
              <div className="result-details">
                <span className="result-hand-type">
                  {roll?.hand_type ?? (isParent ? parentHandType : '---')}
                </span>
                {!isParent && bet && (
                  <span className="result-bet">
                    ベット: {bet.amount}
                    {bet.settled && bet.result_multiplier != null && (
                      <span
                        className={`result-multiplier ${
                          bet.result_multiplier > 0
                            ? 'win'
                            : bet.result_multiplier < 0
                              ? 'lose'
                              : 'draw'
                        }`}
                      >
                        {bet.result_multiplier > 0
                          ? ` +${bet.amount * bet.result_multiplier}`
                          : bet.result_multiplier < 0
                            ? ` ${bet.amount * bet.result_multiplier}`
                            : ' ±0'}
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* 精算ボタン */}
      {!settled && (
        <button
          className="settle-button"
          onClick={handleSettle}
          disabled={isSettling}
        >
          {isSettling ? '精算中...' : '精算する'}
        </button>
      )}

      {/* 精算結果の表示 */}
      {results && (
        <div className="settlement-results">
          <h3>精算結果</h3>
          {results.results?.map((r) => (
            <div
              key={r.playerId}
              className={`settlement-item ${
                r.chipChange > 0 ? 'win' : r.chipChange < 0 ? 'lose' : 'draw'
              }`}
            >
              <span className="settlement-name">
                {r.playerName}
                {r.isParent && ' 👑'}
              </span>
              <span className="settlement-change">
                {r.chipChange > 0
                  ? `+${r.chipChange}`
                  : r.chipChange < 0
                    ? `${r.chipChange}`
                    : '±0'}{' '}
                チップ
              </span>
            </div>
          ))}

          {results.gameFinished ? (
            <div className="game-finished">
              <h3>ゲーム終了!</h3>
              <p>チップが0になったプレイヤーがいます。</p>
            </div>
          ) : (
            <div className="next-round-info">
              <p>次のラウンドが自動的に開始されます...</p>
            </div>
          )}
        </div>
      )}

      {settled && !results && (
        <div className="already-settled">
          <p>精算済みです。次のラウンドを待っています...</p>
        </div>
      )}
    </div>
  )
}

export default SettlementPhase
