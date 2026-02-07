import './PlayerList.css'

function PlayerList({ players, currentPlayerId, rolls }) {
  return (
    <div className="player-list">
      <h3>プレイヤー ({players.length}人)</h3>
      <div className="players">
        {players.map((player) => {
          const playerRoll = rolls.find(r => r.player_id === player.id)
          const isCurrentPlayer = player.id === currentPlayerId

          return (
            <div
              key={player.id}
              className={`player-item ${isCurrentPlayer ? 'current' : ''} ${player.is_host ? 'host' : ''}`}
            >
              <div className="player-info">
                <span className="player-name">
                  {player.name}
                  {player.is_host && ' [HOST]'}
                  {isCurrentPlayer && ' (あなた)'}
                </span>
                {playerRoll && (
                  <div className="player-result">
                    <span className="hand-type">{playerRoll.hand_type}</span>
                    {playerRoll.hand_value > 0 && (
                      <span className="hand-value">({playerRoll.hand_value})</span>
                    )}
                  </div>
                )}
              </div>
              {playerRoll && (
                <div className="player-dice">
                  {[playerRoll.dice1, playerRoll.dice2, playerRoll.dice3].map((d, i) => (
                    <span key={i} className="dice-mini">{d}</span>
                  ))}
                </div>
              )}
              {!playerRoll && rolls.length > 0 && (
                <div className="waiting">待機中...</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default PlayerList
