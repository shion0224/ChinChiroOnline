import type { Player, PlayerRoll, RoundBet } from '../types/database'
import './PlayerList.css'

interface PlayerListProps {
  players: Player[]
  currentPlayerId: string
  parentId?: string | null
  currentTurnPlayerId?: string | null
  rolls?: PlayerRoll[]
  bets?: RoundBet[]
}

function PlayerList({
  players,
  currentPlayerId,
  parentId,
  currentTurnPlayerId,
  rolls,
  bets,
}: PlayerListProps) {
  return (
    <div className="player-list">
      <h3>プレイヤー</h3>
      <div className="players">
        {players.map((player) => {
          const isCurrentPlayer = player.id === currentPlayerId
          const isParent = player.id === parentId
          const isCurrentTurn = player.id === currentTurnPlayerId
          const playerBet = bets?.find((b) => b.player_id === player.id)
          const playerFinalRoll = rolls?.find(
            (r) => r.player_id === player.id && r.is_final
          )

          return (
            <div
              key={player.id}
              className={`player-item ${isCurrentPlayer ? 'current' : ''} ${isParent ? 'parent' : ''} ${isCurrentTurn ? 'active-turn' : ''}`}
            >
              <div className="player-info">
                <div className="player-name-row">
                  <span className="player-name">
                    {player.name}
                    {isCurrentPlayer && ' (あなた)'}
                  </span>
                  <div className="player-badges">
                    {player.is_host && (
                      <span className="badge host">HOST</span>
                    )}
                    {isParent && (
                      <span className="badge parent-badge">親</span>
                    )}
                    {isCurrentTurn && (
                      <span className="badge turn-badge">ターン</span>
                    )}
                  </div>
                </div>
                <div className="player-stats">
                  <span className="player-chips">{player.chips} チップ</span>
                  {playerBet && !playerBet.settled && (
                    <span className="player-bet">
                      ベット: {playerBet.amount}
                    </span>
                  )}
                  {playerBet?.settled && playerBet.result_multiplier != null && (
                    <span
                      className={`player-result ${
                        playerBet.result_multiplier > 0
                          ? 'win'
                          : playerBet.result_multiplier < 0
                            ? 'lose'
                            : 'draw'
                      }`}
                    >
                      {playerBet.result_multiplier > 0
                        ? `+${playerBet.amount * playerBet.result_multiplier}`
                        : playerBet.result_multiplier < 0
                          ? `${playerBet.amount * playerBet.result_multiplier}`
                          : '±0'}
                    </span>
                  )}
                </div>
              </div>
              {playerFinalRoll && (
                <div className="player-roll-info">
                  <div className="player-dice">
                    {[
                      playerFinalRoll.dice1,
                      playerFinalRoll.dice2,
                      playerFinalRoll.dice3,
                    ].map((d, i) => (
                      <span key={i} className="dice-mini">
                        {d}
                      </span>
                    ))}
                  </div>
                  <span className="player-hand-type">
                    {playerFinalRoll.hand_type}
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PlayerList
