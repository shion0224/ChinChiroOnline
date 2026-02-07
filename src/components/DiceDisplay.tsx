import './DiceDisplay.css'

interface DiceDisplayProps {
  dice: number[] | null
  rolling?: boolean
}

function DiceDisplay({ dice, rolling = false }: DiceDisplayProps) {
  if (!dice || dice.length !== 3) {
    return (
      <div className="dice-container">
        <div className="dice-placeholder">?</div>
        <div className="dice-placeholder">?</div>
        <div className="dice-placeholder">?</div>
      </div>
    )
  }

  const getDiceEmoji = (value: number): string => {
    const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
    return diceEmojis[value - 1] || '?'
  }

  return (
    <div className={`dice-container ${rolling ? 'rolling' : ''}`}>
      {dice.map((value, index) => (
        <div key={index} className={`dice ${rolling ? 'rolling' : ''}`}>
          <span className="dice-emoji">{getDiceEmoji(value)}</span>
          <span className="dice-number">{value}</span>
        </div>
      ))}
    </div>
  )
}

export default DiceDisplay
