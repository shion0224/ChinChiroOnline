/**
 * チンチロ ゲームロジック（サーバーサイド）
 * 伝統的なルール: 親/子システム、3回振り直し、賭け倍率対応
 */

export interface DiceResult {
  dice: [number, number, number]
  hand: HandResult
}

export interface HandResult {
  handType: HandType
  handValue: number | null
  displayName: string
}

export type HandType =
  | 'pinzoro'    // ピンゾロ (111) - 最強、x3倍
  | 'zoro'       // ゾロ目 (222-666) - x2倍
  | 'shigoro'    // シゴロ (456) - x1倍勝ち
  | 'normal'     // 通常目 (2つ同じ + 1つ異なる) - 値で比較
  | 'hifumi'     // ヒフミ (123) - 即負け、x2倍
  | 'shonben'    // ションベン (3回振って役なし) - x1倍負け
  | 'bara'       // バラ (役なし) - 振り直し可能

/**
 * サーバーサイドでサイコロを3つ振る（暗号学的に安全な乱数）
 */
export function rollThreeDice(): [number, number, number] {
  const array = new Uint32Array(3)
  crypto.getRandomValues(array)
  const dice = array.map((v) => (v % 6) + 1) as unknown as [number, number, number]
  return [dice[0], dice[1], dice[2]]
}

/**
 * サイコロの結果をソートする（判定用）
 */
export function sortDice(dice: [number, number, number]): [number, number, number] {
  const sorted = [...dice].sort((a, b) => a - b)
  return [sorted[0], sorted[1], sorted[2]]
}

/**
 * チンチロの役を判定する
 * @param dice - サイコロの結果 [dice1, dice2, dice3]（未ソートでもOK）
 * @param isThirdAttempt - 3回目の振りかどうか（trueかつバラの場合ションベン）
 */
export function evaluateHand(
  dice: [number, number, number],
  isThirdAttempt: boolean = false
): HandResult {
  const sorted = sortDice(dice)
  const [d1, d2, d3] = sorted

  // ピンゾロ（111）
  if (d1 === 1 && d2 === 1 && d3 === 1) {
    return { handType: 'pinzoro', handValue: null, displayName: 'ピンゾロ' }
  }

  // ゾロ目（222-666）
  if (d1 === d2 && d2 === d3) {
    return { handType: 'zoro', handValue: d1, displayName: `${d1}のゾロ目` }
  }

  // シゴロ（456）
  if (d1 === 4 && d2 === 5 && d3 === 6) {
    return { handType: 'shigoro', handValue: null, displayName: 'シゴロ' }
  }

  // ヒフミ（123）- 即負けの特殊役
  if (d1 === 1 && d2 === 2 && d3 === 3) {
    return { handType: 'hifumi', handValue: null, displayName: 'ヒフミ' }
  }

  // 通常目（2つのサイコロが同じ値 → 残り1つが「目」）
  if (d1 === d2 && d2 !== d3) {
    return { handType: 'normal', handValue: d3, displayName: `${d3}の目` }
  }
  if (d2 === d3 && d1 !== d2) {
    return { handType: 'normal', handValue: d1, displayName: `${d1}の目` }
  }
  if (d1 === d3 && d1 !== d2) {
    return { handType: 'normal', handValue: d2, displayName: `${d2}の目` }
  }

  // バラ（役なし）- 3回目ならションベン
  if (isThirdAttempt) {
    return { handType: 'shonben', handValue: null, displayName: 'ションベン' }
  }

  return { handType: 'bara', handValue: null, displayName: 'バラ（役なし）' }
}

/**
 * 役の強さを数値で返す（大きいほど強い）
 */
export function getHandStrength(hand: HandResult): number {
  switch (hand.handType) {
    case 'pinzoro':
      return 1000
    case 'zoro':
      return 900 + (hand.handValue ?? 0)
    case 'shigoro':
      return 800
    case 'normal':
      return 100 + (hand.handValue ?? 0)
    case 'hifumi':
      return -100
    case 'shonben':
      return -200
    case 'bara':
      return -300  // 判定時には使われないはず
    default:
      return -999
  }
}

/**
 * 役が確定した（振り直し不要な）役かどうか
 * バラ以外はすべて確定
 */
export function isHandDecided(hand: HandResult): boolean {
  return hand.handType !== 'bara'
}

/**
 * 親の役が「即決」かどうか（子のロールをスキップして精算に行く）
 * 即決: ピンゾロ、ゾロ目、シゴロ、ヒフミ、ションベン
 */
export function isInstantSettlement(hand: HandResult): boolean {
  return ['pinzoro', 'zoro', 'shigoro', 'hifumi', 'shonben'].includes(hand.handType)
}

/**
 * 賭け倍率を計算する
 * 親の即決役の場合:
 *   - ピンゾロ: x3（親勝ち）
 *   - ゾロ目: x2（親勝ち）
 *   - シゴロ: x1（親勝ち）
 *   - ヒフミ: x2（親負け）
 *   - ションベン: x1（親負け）
 *
 * 子 vs 親の通常目:
 *   - 子がピンゾロ: x3（子勝ち）
 *   - 子がゾロ目: x2（子勝ち）
 *   - 子がシゴロ: x1（子勝ち）
 *   - 子の目 > 親の目: x1（子勝ち）
 *   - 子の目 = 親の目: x0（引き分け）
 *   - 子の目 < 親の目: x1（子負け → 親勝ち）
 *   - 子がヒフミ: x2（子負け）
 *   - 子がションベン: x1（子負け）
 *
 * 戻り値: 正の値 = 子の勝ち、負の値 = 親の勝ち（子の負け）、0 = 引き分け
 */
export function calculateMultiplier(
  parentHand: HandResult,
  childHand: HandResult
): number {
  // 親が即決役の場合
  if (isInstantSettlement(parentHand)) {
    switch (parentHand.handType) {
      case 'pinzoro': return -3  // 親勝ち x3
      case 'zoro': return -2     // 親勝ち x2
      case 'shigoro': return -1  // 親勝ち x1
      case 'hifumi': return 2    // 親負け x2 → 子勝ち
      case 'shonben': return 1   // 親負け x1 → 子勝ち
      default: return 0
    }
  }

  // 子の役で判定
  switch (childHand.handType) {
    case 'pinzoro': return 3     // 子勝ち x3
    case 'zoro': return 2        // 子勝ち x2
    case 'shigoro': return 1     // 子勝ち x1
    case 'hifumi': return -2     // 子負け x2
    case 'shonben': return -1    // 子負け x1
    case 'normal': {
      // 通常目同士の比較
      const parentValue = parentHand.handValue ?? 0
      const childValue = childHand.handValue ?? 0
      if (childValue > parentValue) return 1   // 子勝ち x1
      if (childValue < parentValue) return -1  // 子負け x1
      return 0  // 引き分け
    }
    default:
      return -1  // 予期しないケース → 子負け
  }
}

/**
 * DB の hand_type 文字列からHandResultを復元する
 */
export function parseHandFromDB(handType: string, handValue: number | null): HandResult {
  if (handType === 'ピンゾロ') return { handType: 'pinzoro', handValue: null, displayName: 'ピンゾロ' }
  if (handType.includes('ゾロ目')) {
    const val = handValue ?? parseInt(handType.match(/\d+/)?.[0] ?? '0')
    return { handType: 'zoro', handValue: val, displayName: handType }
  }
  if (handType === 'シゴロ') return { handType: 'shigoro', handValue: null, displayName: 'シゴロ' }
  if (handType === 'ヒフミ') return { handType: 'hifumi', handValue: null, displayName: 'ヒフミ' }
  if (handType === 'ションベン') return { handType: 'shonben', handValue: null, displayName: 'ションベン' }
  if (handType.includes('の目')) {
    return { handType: 'normal', handValue: handValue, displayName: handType }
  }
  return { handType: 'bara', handValue: null, displayName: 'バラ（役なし）' }
}
