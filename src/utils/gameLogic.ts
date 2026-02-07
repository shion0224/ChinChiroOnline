/**
 * チンチロ ゲームロジック（クライアント表示用）
 *
 * サイコロの生成はサーバー側（Edge Function）で行うため、
 * ここでは表示・判定のヘルパーのみを提供する。
 */

interface HandType {
  name: string
  multiplier: number
  isWin: boolean | null
}

/**
 * 役の強さの順序定義（表示用）
 */
export const HAND_TYPES: Record<string, HandType> = {
  pinzoro: { name: 'ピンゾロ', multiplier: 3, isWin: true },
  zoro: { name: 'ゾロ目', multiplier: 2, isWin: true },
  shigoro: { name: 'シゴロ', multiplier: 1, isWin: true },
  normal: { name: '通常目', multiplier: 1, isWin: null }, // 比較次第
  hifumi: { name: 'ヒフミ', multiplier: 2, isWin: false },
  shonben: { name: 'ションベン', multiplier: 1, isWin: false },
  bara: { name: 'バラ（役なし）', multiplier: 0, isWin: null },
}

/**
 * 役名（displayName）からCSSクラス用の文字列を返す
 */
export function getHandClass(displayName: string | null | undefined): string {
  if (!displayName) return ''
  if (displayName === 'ピンゾロ') return 'hand-pinzoro'
  if (displayName.includes('ゾロ目')) return 'hand-zoro'
  if (displayName === 'シゴロ') return 'hand-shigoro'
  if (displayName === 'ヒフミ') return 'hand-hifumi'
  if (displayName === 'ションベン') return 'hand-shonben'
  if (displayName.includes('の目')) return 'hand-normal'
  return 'hand-bara'
}

/**
 * 精算倍率の表示テキストを生成
 */
export function formatSettlementText(
  multiplier: number,
  betAmount: number
): string {
  if (multiplier === 0) return '引き分け'
  const amount = Math.abs(multiplier * betAmount)
  if (multiplier > 0) return `+${amount} チップ`
  return `-${amount} チップ`
}

/**
 * サイコロの絵文字を取得
 */
export function getDiceEmoji(value: number): string {
  const diceEmojis = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
  return diceEmojis[value - 1] || '?'
}
