import { useRef, useState, useEffect, useCallback, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Physics, RigidBody, CuboidCollider, type RapierRigidBody } from '@react-three/rapier'
import * as THREE from 'three'

// ============================================================
// 定数
// ============================================================

/** サイコロ1辺の大きさ */
const DICE_SIZE = 0.32
/** 丼の壁コライダー半径 */
const BOWL_WALL_RADIUS = 1.75
/** ションベン判定半径（これより外 = こぼれた） */
const BOWL_SPILL_RADIUS = 1.6

// ============================================================
// サイコロ面テクスチャ生成（Canvas API・軽量128px）
// ============================================================

const DOT_POSITIONS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.5], [0.75, 0.5], [0.25, 0.75], [0.75, 0.75]],
}

function createDiceFaceTexture(value: number): THREE.CanvasTexture {
  const size = 128
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!

  ctx.fillStyle = '#f5f0e8'
  ctx.fillRect(0, 0, size, size)

  ctx.strokeStyle = '#c8b894'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(1, 1, size - 2, size - 2, 8)
  ctx.stroke()

  const dots = DOT_POSITIONS[value] || []
  const dotRadius = size * 0.09
  ctx.fillStyle = '#1a1a2e'
  for (const [dx, dy] of dots) {
    ctx.beginPath()
    ctx.arc(dx * size, dy * size, dotRadius, 0, Math.PI * 2)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// ============================================================
// 面の配置 (+X, -X, +Y, -Y, +Z, -Z)  対面合計=7
// ============================================================

const FACE_VALUES = [3, 4, 2, 5, 1, 6]

/** テクスチャ＆マテリアルをモジュールスコープで1回だけ生成 */
let _diceMaterials: THREE.MeshStandardMaterial[] | null = null
function getDiceMaterials(): THREE.MeshStandardMaterial[] {
  if (!_diceMaterials) {
    _diceMaterials = FACE_VALUES.map((v) => {
      const tex = createDiceFaceTexture(v)
      return new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4, metalness: 0 })
    })
  }
  return _diceMaterials
}

const FACE_NORMALS: [number, THREE.Vector3][] = [
  [3, new THREE.Vector3(1, 0, 0)],
  [4, new THREE.Vector3(-1, 0, 0)],
  [2, new THREE.Vector3(0, 1, 0)],
  [5, new THREE.Vector3(0, -1, 0)],
  [1, new THREE.Vector3(0, 0, 1)],
  [6, new THREE.Vector3(0, 0, -1)],
]

function getTopFace(quaternion: THREE.Quaternion): number {
  const up = new THREE.Vector3(0, 1, 0)
  let bestValue = 1
  let bestDot = -Infinity
  for (const [value, localNormal] of FACE_NORMALS) {
    const worldNormal = localNormal.clone().applyQuaternion(quaternion)
    const d = worldNormal.dot(up)
    if (d > bestDot) { bestDot = d; bestValue = value }
  }
  return bestValue
}

function getRotationForTopFace(value: number) {
  const entry = FACE_NORMALS.find(([v]) => v === value)
  if (!entry) return { x: 0, y: 0, z: 0, w: 1 }
  const q = new THREE.Quaternion()
  q.setFromUnitVectors(entry[1], new THREE.Vector3(0, 1, 0))
  return { x: q.x, y: q.y, z: q.z, w: q.w }
}

// ============================================================
// シーンモード
// ============================================================

export type SceneMode = 'ready' | 'rolling' | 'result'

// ============================================================
// 個別サイコロ
// ============================================================

interface SingleDiceProps {
  targetValue: number | null
  index: number
  mode: SceneMode
  onSettled?: (index: number, spilled: boolean) => void
}

const _boxGeo = new THREE.BoxGeometry(DICE_SIZE, DICE_SIZE, DICE_SIZE)

function SingleDice({ targetValue, index, mode, onSettled }: SingleDiceProps) {
  const rigidRef = useRef<RapierRigidBody>(null)
  const materials = getDiceMaterials()
  const [settled, setSettled] = useState(false)
  const settledFrames = useRef(0)
  const hasCalledSettled = useRef(false)
  const prevMode = useRef<SceneMode>(mode)

  // ── ready: ふわふわ浮遊 ──
  useFrame(({ clock }) => {
    if (mode !== 'ready' || !rigidRef.current) return
    const body = rigidRef.current
    const offsetX = (index - 1) * 0.4
    const bob = Math.sin(clock.elapsedTime * 1.8 + index * 2.1) * 0.1
    const sway = Math.sin(clock.elapsedTime * 1.2 + index * 1.5) * 0.04
    body.setTranslation({ x: offsetX + sway, y: 2.5 + bob, z: -0.3 }, true)

    const t = clock.elapsedTime * 0.5 + index * 2.0
    const euler = new THREE.Euler(Math.sin(t) * 0.3, t * 0.8, Math.cos(t * 0.7) * 0.2)
    const q = new THREE.Quaternion().setFromEuler(euler)
    body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)
    body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    body.setAngvel({ x: 0, y: 0, z: 0 }, true)
  })

  // ── rolling へ遷移 ──
  useEffect(() => {
    if (mode === 'rolling' && prevMode.current !== 'rolling') {
      setSettled(false)
      settledFrames.current = 0
      hasCalledSettled.current = false

      const body = rigidRef.current
      if (body) {
        const offX = (index - 1) * 0.3
        const offZ = (Math.random() - 0.5) * 0.3
        body.setTranslation({ x: offX, y: 4.0 + index * 0.3, z: -2.0 + offZ }, true)

        const euler = new THREE.Euler(
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
          Math.random() * Math.PI * 2,
        )
        const q = new THREE.Quaternion().setFromEuler(euler)
        body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true)

        body.setGravityScale(1, true)
        body.setLinvel({
          x: -offX * 1.2 + (Math.random() - 0.5) * 0.6,
          y: -3.0 + Math.random() * 0.5,
          z: 3.0 + Math.random() * 0.5,
        }, true)
        body.setAngvel({
          x: (Math.random() - 0.5) * 14,
          y: (Math.random() - 0.5) * 14,
          z: (Math.random() - 0.5) * 14,
        }, true)
        body.wakeUp()
      }
    }

    if (mode === 'ready') {
      const body = rigidRef.current
      if (body) {
        body.setGravityScale(0, true)
        body.setLinvel({ x: 0, y: 0, z: 0 }, true)
        body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      }
    }

    prevMode.current = mode
  }, [mode, index])

  // ── 静止判定 ──
  useFrame(() => {
    if (mode !== 'rolling' || settled || !rigidRef.current) return
    const body = rigidRef.current
    const lv = body.linvel()
    const av = body.angvel()
    const speed = Math.sqrt(lv.x ** 2 + lv.y ** 2 + lv.z ** 2)
    const angSpeed = Math.sqrt(av.x ** 2 + av.y ** 2 + av.z ** 2)

    if (speed < 0.05 && angSpeed < 0.1) {
      settledFrames.current++
    } else {
      settledFrames.current = 0
    }

    if (settledFrames.current > 30 && !hasCalledSettled.current) {
      hasCalledSettled.current = true
      setSettled(true)

      // ションベン判定: 丼の外に出たか
      const pos = body.translation()
      const dist = Math.sqrt(pos.x ** 2 + pos.z ** 2)
      const spilled = dist > BOWL_SPILL_RADIUS
      onSettled?.(index, spilled)
    }
  })

  // ── result モード ──
  useEffect(() => {
    if (mode === 'result' && targetValue !== null && rigidRef.current) {
      const body = rigidRef.current
      body.setGravityScale(0, true)
      body.setTranslation({ x: (index - 1) * 0.5, y: -0.8, z: 0 }, true)
      const rotation = getRotationForTopFace(targetValue)
      body.setRotation(rotation, true)
      body.setLinvel({ x: 0, y: 0, z: 0 }, true)
      body.setAngvel({ x: 0, y: 0, z: 0 }, true)
      body.sleep()
    }
  }, [mode, targetValue, index])

  return (
    <RigidBody
      ref={rigidRef}
      colliders="cuboid"
      restitution={0.3}
      friction={0.8}
      mass={0.15}
      linearDamping={0.5}
      angularDamping={0.5}
      gravityScale={0}
      position={[(index - 1) * 0.4, 2.5, -0.3]}
    >
      <mesh geometry={_boxGeo} material={materials} castShadow>
      </mesh>
    </RigidBody>
  )
}

// ============================================================
// 丼メッシュ（大きめ）
// ============================================================

function Bowl() {
  const bowlGeometry = useMemo(() => {
    const points: THREE.Vector2[] = []
    const segments = 20
    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const angle = t * Math.PI * 0.45
      const radius = 0.4 + Math.sin(angle) * 2.0
      const height = -Math.cos(angle) * 1.15 + 0.12
      points.push(new THREE.Vector2(radius, height))
    }
    return new THREE.LatheGeometry(points, 24)
  }, [])

  return (
    <group position={[0, -0.5, 0]}>
      {/* 丼本体 */}
      <mesh geometry={bowlGeometry} receiveShadow castShadow>
        <meshLambertMaterial color="#4a3728" side={THREE.DoubleSide} />
      </mesh>
      {/* 底面ディスク */}
      <mesh position={[0, -1.0, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.5, 16]} />
        <meshLambertMaterial color="#4a3728" />
      </mesh>
      {/* 丼内側の底 */}
      <mesh position={[0, -0.95, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[0.8, 16]} />
        <meshLambertMaterial color="#5c4a3a" />
      </mesh>
    </group>
  )
}

// ============================================================
// 丼コライダー（大きめ・壁12枚）
// ============================================================

function BowlColliders() {
  const walls = useMemo(() => {
    const count = 12
    const result = []
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2
      result.push({
        x: Math.cos(angle) * BOWL_WALL_RADIUS,
        z: Math.sin(angle) * BOWL_WALL_RADIUS,
        angle,
      })
    }
    return result
  }, [])

  return (
    <group position={[0, -0.5, 0]}>
      {/* 底面 */}
      <RigidBody type="fixed" position={[0, -0.95, 0]}>
        <CuboidCollider args={[1.0, 0.05, 1.0]} />
      </RigidBody>
      {/* 壁面 */}
      {walls.map((wall, i) => (
        <RigidBody
          key={i}
          type="fixed"
          position={[wall.x, -0.2, wall.z]}
          rotation={[0, -wall.angle, Math.PI * 0.13]}
        >
          <CuboidCollider args={[0.7, 0.8, 0.05]} />
        </RigidBody>
      ))}
    </group>
  )
}

// ============================================================
// テーブル
// ============================================================

function Table() {
  return (
    <RigidBody type="fixed" position={[0, -1.6, 0]}>
      <CuboidCollider args={[5, 0.1, 5]} />
      <mesh receiveShadow>
        <boxGeometry args={[10, 0.2, 10]} />
        <meshLambertMaterial color="#2d5a27" />
      </mesh>
    </RigidBody>
  )
}

// ============================================================
// メインシーン
// ============================================================

interface SceneContentProps {
  dice: number[] | null
  mode: SceneMode
  onAllSettled?: (spilled: boolean) => void
}

function SceneContent({ dice, mode, onAllSettled }: SceneContentProps) {
  const settledRef = useRef(0)
  const spilledRef = useRef(false)
  const hasNotified = useRef(false)

  useEffect(() => {
    if (mode === 'rolling') {
      settledRef.current = 0
      spilledRef.current = false
      hasNotified.current = false
    }
  }, [mode])

  const handleDiceSettled = useCallback((_index: number, spilled: boolean) => {
    settledRef.current++
    if (spilled) spilledRef.current = true
    if (settledRef.current >= 3 && !hasNotified.current) {
      hasNotified.current = true
      setTimeout(() => onAllSettled?.(spilledRef.current), 300)
    }
  }, [onAllSettled])

  const targetValues = mode === 'result' ? (dice || [null, null, null]) : [null, null, null]

  return (
    <>
      {/* ── ライティング（軽量構成） ── */}
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#b0d4ff', '#3a2a1a', 0.4]} />
      <directionalLight
        position={[3, 8, 4]}
        intensity={1.3}
        castShadow
        shadow-mapSize-width={512}
        shadow-mapSize-height={512}
        shadow-camera-far={15}
        shadow-camera-left={-4}
        shadow-camera-right={4}
        shadow-camera-top={4}
        shadow-camera-bottom={-4}
      />

      {/* ── 物理世界（60Hz で十分） ── */}
      <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60}>
        <Table />
        <Bowl />
        <BowlColliders />

        {[0, 1, 2].map((i) => (
          <SingleDice
            key={i}
            index={i}
            targetValue={targetValues[i]}
            mode={mode}
            onSettled={handleDiceSettled}
          />
        ))}
      </Physics>
    </>
  )
}

// ============================================================
// 公開コンポーネント
// ============================================================

interface DiceScene3DProps {
  dice: number[] | null
  mode?: SceneMode
  onThrow?: () => void
  /** 3つ静止時。spilled=true ならションベン */
  onAllSettled?: (spilled: boolean) => void
  prompt?: string | null
}

export default function DiceScene3D({
  dice,
  mode = 'result',
  onThrow,
  onAllSettled,
  prompt,
}: DiceScene3DProps) {
  const isInteractive = mode === 'ready' && !!onThrow

  const handleClick = () => {
    if (isInteractive) onThrow?.()
  }

  return (
    <div
      style={{
        width: '100%',
        height: 420,
        borderRadius: 12,
        overflow: 'hidden',
        position: 'relative',
        cursor: isInteractive ? 'pointer' : 'default',
      }}
      onClick={handleClick}
    >
      <Canvas
        shadows
        dpr={[1, 1]}
        camera={{ position: [0, 4.5, 3.5], fov: 50, near: 0.1, far: 30 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
        style={{ pointerEvents: isInteractive ? 'none' : 'auto' }}
        onCreated={({ gl, camera }) => {
          gl.setClearColor('#1a1a2e')
          gl.toneMapping = THREE.ACESFilmicToneMapping
          gl.toneMappingExposure = 1.0
          camera.lookAt(0, -0.6, 0)
        }}
      >
        <SceneContent dice={dice} mode={mode} onAllSettled={onAllSettled} />
      </Canvas>

      {/* オーバーレイプロンプト */}
      {prompt && (
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            textAlign: 'center',
            padding: '18px 12px',
            background: 'linear-gradient(transparent, rgba(0,0,0,0.65))',
            pointerEvents: 'none',
          }}
        >
          <span
            style={{
              color: '#fff',
              fontSize: '1.15rem',
              fontWeight: 600,
              textShadow: '0 2px 8px rgba(0,0,0,0.7)',
              animation: isInteractive ? 'dicePulse 2s ease-in-out infinite' : undefined,
            }}
          >
            {prompt}
          </span>
        </div>
      )}
    </div>
  )
}
