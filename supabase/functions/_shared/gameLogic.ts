/**
 * チンチロ ゲームロジック（サーバーサイド TypeScript版）
 */

export interface Hand {
  handType: string
  handValue: number | null
  displayName: string
}

export interface RollResult {
  dice: [number, number, number]
  hand: Hand
}

/**
 * サイコロを1つ振る（サーバーサイド - crypto.getRandomValues使用）
 */
export function rollDice(): number {
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return (array[0] % 6) + 1
}

/**
 * 3つのサイコロを振る
 */
export function rollThreeDice(): [number, number, number] {
  const dice = [rollDice(), rollDice(), rollDice()].sort((a, b) => a - b)
  return dice as [number, number, number]
}

/**
 * チンチロの役を判定する
 * @param dice - サイコロの結果 [dice1, dice2, dice3]（昇順ソート済み）
 */
export function evaluateHand(dice: [number, number, number]): Hand {
  const [d1, d2, d3] = dice

  // ピンゾロ（111）
  if (d1 === 1 && d2 === 1 && d3 === 1) {
    return { handType: 'pinzoro', handValue: null, displayName: 'ピンゾロ' }
  }

  // ゾロ目（222, 333, 444, 555, 666）
  if (d1 === d2 && d2 === d3) {
    return { handType: 'zoro', handValue: d1, displayName: `${d1}のゾロ` }
  }

  // シゴロ（456）
  if (d1 === 4 && d2 === 5 && d3 === 6) {
    return { handType: 'shigoro', handValue: null, displayName: 'シゴロ' }
  }

  // 目なし（123, 234, 345）
  if (
    (d1 === 1 && d2 === 2 && d3 === 3) ||
    (d1 === 2 && d2 === 3 && d3 === 4) ||
    (d1 === 3 && d2 === 4 && d3 === 5)
  ) {
    return { handType: 'menashi', handValue: null, displayName: '目なし' }
  }

  // 通常目（2つのサイコロが同じ）
  if (d1 === d2) {
    return { handType: 'normal', handValue: d3, displayName: `${d1}の${d3}` }
  }
  if (d2 === d3) {
    return { handType: 'normal', handValue: d1, displayName: `${d2}の${d1}` }
  }
  if (d1 === d3) {
    return { handType: 'normal', handValue: d2, displayName: `${d1}の${d2}` }
  }

  // 役なし（バラ）
  return { handType: 'bara', handValue: null, displayName: '役なし' }
}

/**
 * 役の強さを数値で比較するための値を取得
 */
export function getHandStrength(hand: Hand): number {
  const { handType, handValue } = hand

  switch (handType) {
    case 'pinzoro':
      return 1000
    case 'zoro':
      return 900 + (handValue || 0)
    case 'shigoro':
      return 800
    case 'menashi':
      return 700
    case 'normal':
      return 100 + (handValue || 0)
    case 'bara':
      return 0
    default:
      return 0
  }
}

/**
 * DB保存されたロールから強さを計算する
 */
export function getHandStrengthFromDB(roll: {
  hand_type: string
  hand_value: number | null
}): number {
  const handType = roll.hand_type
  const handValue = roll.hand_value || 0

  if (handType === 'ピンゾロ') return 1000
  if (handType.includes('ゾロ')) {
    const zoroValue = parseInt(handType.match(/\d+/)?.[0] || '0')
    return 900 + zoroValue
  }
  if (handType === 'シゴロ') return 800
  if (handType === '目なし') return 700
  if (handType.includes('の') && handType !== '目なし') {
    return 100 + handValue
  }
  return 0
}

/**
 * サイコロを振って役を判定する
 */
export function rollAndEvaluate(): RollResult {
  const dice = rollThreeDice()
  const hand = evaluateHand(dice)
  return { dice, hand }
}
