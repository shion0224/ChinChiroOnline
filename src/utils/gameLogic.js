/**
 * サイコロを1つ振る
 * @returns {number} 1-6のランダムな数字
 */
export function rollDice() {
  return Math.floor(Math.random() * 6) + 1
}

/**
 * 3つのサイコロを振る
 * @returns {number[]} [dice1, dice2, dice3]
 */
export function rollThreeDice() {
  return [rollDice(), rollDice(), rollDice()].sort((a, b) => a - b)
}

/**
 * チンチロの役を判定する
 * @param {number[]} dice - サイコロの結果 [dice1, dice2, dice3]（昇順ソート済み）
 * @returns {Object} { handType: string, handValue: number | null }
 */
export function evaluateHand(dice) {
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
  if ((d1 === 1 && d2 === 2 && d3 === 3) ||
      (d1 === 2 && d2 === 3 && d3 === 4) ||
      (d1 === 3 && d2 === 4 && d3 === 5)) {
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
 * @param {Object} hand - evaluateHand()の戻り値
 * @returns {number} 強さの数値（大きいほど強い）
 */
export function getHandStrength(hand) {
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
 * 2つの役を比較して勝敗を判定
 * @param {Object} hand1 - プレイヤー1の役
 * @param {Object} hand2 - プレイヤー2の役
 * @returns {number} 1ならhand1の勝ち、-1ならhand2の勝ち、0なら引き分け
 */
export function compareHands(hand1, hand2) {
  const strength1 = getHandStrength(hand1)
  const strength2 = getHandStrength(hand2)

  if (strength1 > strength2) return 1
  if (strength1 < strength2) return -1
  return 0
}

/**
 * サイコロを振って役を判定する（完全な結果を返す）
 * @returns {Object} { dice: number[], hand: Object }
 */
export function rollAndEvaluate() {
  const dice = rollThreeDice()
  const hand = evaluateHand(dice)
  return { dice, hand }
}

