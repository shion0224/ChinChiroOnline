import { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { rollDice as rollDiceApi } from '../lib/gameApi'
import DiceDisplay from './DiceDisplay'
import type { Player, PlayerRoll, RollDiceResponse } from '../types/database'
import type { SceneMode } from './DiceScene3D'
import './RollingPhase.css'

const DiceScene3D = lazy(() => import('./DiceScene3D'))

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

/**
 * サイコロ振りフェーズ
 *
 * UX: 自分のターンで丼 + サイコロが表示される
 *     画面タップでサイコロが丼に落ちる
 *     完全に静止したら結果表示 → 次へ進む
 */
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
  // ─── ステート ───
  const [dicePhase, setDicePhase] = useState<'ready' | 'throwing' | 'show_result'>('ready')
  const [lastResult, setLastResult] = useState<RollDiceResponse | null>(null)

  // API 結果と静止判定を同期させるための ref
  const apiResultRef = useRef<RollDiceResponse | null>(null)
  const diceSettledRef = useRef(false)
  const spilledFlagRef = useRef(false)

  const isMyTurn = playerId === currentTurnPlayerId
  const currentTurnPlayer = players.find((p) => p.id === currentTurnPlayerId)

  // 自分のロール履歴
  const myRolls = rolls.filter((r) => r.player_id === playerId)
  const myFinalRoll = myRolls.find((r) => r.is_final)
  const myAttempts = myRolls.length

  // ラウンドが変わったらリセット
  useEffect(() => {
    setLastResult(null)
    setSpilled(false)
    setDicePhase('ready')
    apiResultRef.current = null
    diceSettledRef.current = false
    spilledFlagRef.current = false
  }, [roundId])

  // ターンが変わったらリセット（他のプレイヤー→自分のターン等）
  useEffect(() => {
    if (isMyTurn && !myFinalRoll) {
      setDicePhase('ready')
      setLastResult(null)
      setSpilled(false)
      apiResultRef.current = null
      diceSettledRef.current = false
      spilledFlagRef.current = false
    }
  }, [isMyTurn, myFinalRoll])

  // ションベンかどうか
  const [spilled, setSpilled] = useState(false)

  // ─── 結果確定処理 ───
  const finishThrow = useCallback((result: RollDiceResponse, wasSpilled: boolean) => {
    setLastResult(result)
    setSpilled(wasSpilled)
    setDicePhase('show_result')

    // バラ（未確定）またはションベン → 少し見せてから再び ready に戻す
    if (!result.decided) {
      setTimeout(() => {
        setDicePhase('ready')
        setSpilled(false)
        apiResultRef.current = null
        diceSettledRef.current = false
        spilledFlagRef.current = false
      }, 2500)
    }
  }, [])

  // ─── タップ → サイコロを振る ───
  const handleThrow = useCallback(async () => {
    if (dicePhase !== 'ready' || !isMyTurn || myFinalRoll) return

    setDicePhase('throwing')
    apiResultRef.current = null
    diceSettledRef.current = false
    spilledFlagRef.current = false

    try {
      const result = await rollDiceApi(roundId, playerId)

      // ターン外等ならサイレントに戻す
      if (result.notYourTurn || result.notYourPhase || result.alreadyFinal) {
        console.log('Roll skipped:', result.message)
        setDicePhase('ready')
        return
      }

      apiResultRef.current = result

      // サイコロがすでに静止していたら即確定
      if (diceSettledRef.current) {
        finishThrow(result, spilledFlagRef.current)
      }
    } catch (err) {
      console.error('Roll error:', err)
      onError?.((err as Error).message)
      setDicePhase('ready')
    }
  }, [dicePhase, isMyTurn, myFinalRoll, roundId, playerId, finishThrow, onError])

  // ─── サイコロ静止コールバック ───
  const handleAllSettled = useCallback((wasSpilled: boolean) => {
    diceSettledRef.current = true
    spilledFlagRef.current = wasSpilled

    // API 結果がすでに来ていたら確定
    if (apiResultRef.current) {
      finishThrow(apiResultRef.current, wasSpilled)
    }
  }, [finishThrow])

  // ─── 3D シーンのモード判定 ───
  const get3DMode = (): SceneMode => {
    if (dicePhase === 'throwing') return 'rolling'
    if (dicePhase === 'show_result') return 'result'
    return 'ready'
  }

  // ─── 結果のサイコロ値 ───
  const getResultDice = (): number[] | null => {
    if (dicePhase === 'show_result' && lastResult?.roll) {
      return [lastResult.roll.dice1, lastResult.roll.dice2, lastResult.roll.dice3]
    }
    return null
  }

  // ─── プロンプト文字 ───
  const getPrompt = (): string | null => {
    if (dicePhase === 'ready') {
      if (myAttempts === 0) return 'タップしてサイコロを振る'
      return 'タップしてもう一度振る'
    }
    if (dicePhase === 'throwing') return 'サイコロを振っています...'
    if (dicePhase === 'show_result' && spilled) return 'ションベン！丼の外に出ました'
    return null
  }

  // ─── 各プレイヤー結果整理 ───
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

      {/* ─── 自分のターン（未確定） ─── */}
      {isMyTurn && !myFinalRoll && (
        <div className="roll-section">
          <Suspense fallback={<DiceDisplay dice={null} rolling={dicePhase === 'throwing'} />}>
            <DiceScene3D
              dice={getResultDice()}
              mode={get3DMode()}
              onThrow={handleThrow}
              onAllSettled={handleAllSettled}
              prompt={getPrompt()}
            />
          </Suspense>

          <p className="attempt-info">振り回数: {myAttempts}/3</p>

          {/* 結果表示（バラ・ションベン等） */}
          {dicePhase === 'show_result' && lastResult?.hand && (
            <div className={`roll-result-overlay ${spilled ? 'spilled' : ''}`}>
              {spilled && (
                <p className="spill-label">ションベン！</p>
              )}
              <p className="hand-name">{lastResult.hand.displayName}</p>
              {!lastResult.decided && (
                <p className="retry-message">
                  もう一度振れます（{lastResult.attempt}/3 回目）
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── 自分のロール確定済み ─── */}
      {myFinalRoll && (
        <div className="my-result">
          <h3>あなたの結果</h3>
          <Suspense fallback={
            <DiceDisplay dice={[myFinalRoll.dice1, myFinalRoll.dice2, myFinalRoll.dice3]} />
          }>
            <DiceScene3D
              dice={[myFinalRoll.dice1, myFinalRoll.dice2, myFinalRoll.dice3]}
              mode="result"
            />
          </Suspense>
          <p className="hand-name final">{myFinalRoll.hand_type}</p>
          {!isMyTurn && phase === 'children_rolling' && (
            <p className="waiting-others">他のプレイヤーを待っています...</p>
          )}
        </div>
      )}

      {/* ─── 他のプレイヤーのターン ─── */}
      {!isMyTurn && !myFinalRoll && (
        <div className="waiting-turn">
          <p>
            {currentTurnPlayer?.name ?? '不明'} がサイコロを振っています...
          </p>
        </div>
      )}

      {/* ─── 全プレイヤー結果一覧 ─── */}
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
