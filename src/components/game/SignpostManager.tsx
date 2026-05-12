/**
 * STEP 1: SignpostManager — directionScore 기반 표지판 텍스트 관리
 * score < -3 → Berlin pool
 * score > 3 → Korea pool
 * else → random mix
 * Near exit (z < -78) → all "→"
 */
import { useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGameStore } from '@/store/useGameStore'
import { Signpost, FloorSign } from './Signpost'
import { SCALE_X, SCALE_Z } from '@/scenes/ch2Layout'

const BERLIN_POOL = ['SchwuZ', 'Kreuzberg', 'Friedrichshain', 'Kottbusser Tor', 'Görlitzer Park']
const KOREA_POOL = ['신림역', '관악구', '이태원', '녹사평', '한남동']
const HANOI_POOL = ['Hoàn Kiếm', 'Phố cổ', 'Ba Đình']
const ALL_POOL = [...BERLIN_POOL, ...KOREA_POOL, ...HANOI_POOL]

const SIGNPOST_POSITIONS_RAW = [
  { x: 0, z: -10, rot: 0 },
  { x: 3, z: -20, rot: 0.3 },
  { x: 5, z: -35, rot: -0.2 },
  { x: 20, z: -45, rot: 0.5 },
  { x: 22, z: -55, rot: -0.3 },
  { x: 10, z: -65, rot: 0.2 },
  { x: -3, z: -75, rot: -0.1 },
  { x: 0, z: -82, rot: 0 },
]
const SIGNPOST_POSITIONS = SIGNPOST_POSITIONS_RAW.map(p => ({ ...p, x: p.x * SCALE_X, z: p.z * SCALE_Z }))

const FLOOR_SIGNS_RAW: { x: number; z: number; text: string }[] = []
const FLOOR_SIGNS = FLOOR_SIGNS_RAW.map(s => ({ ...s, x: s.x * SCALE_X, z: s.z * SCALE_Z }))

const NEAR_EXIT_Z = -78 * SCALE_Z

function pickFromPool(pool: string[], index: number): string {
  return pool[index % pool.length]
}

/** Movement tracker — reads camera position, tracks dx for directionScore */
export function MovementTracker() {
  const prevX = useRef<number | null>(null)
  const addMovement = useGameStore((s) => s.addMovement)

  useFrame(({ camera }) => {
    const cx = camera.position.x
    if (prevX.current !== null) {
      const dx = cx - prevX.current
      if (Math.abs(dx) > 0.001) {
        if (dx < 0) {
          addMovement('left', Math.abs(dx))
        } else {
          addMovement('right', dx)
        }
      }
    }
    prevX.current = cx
  })

  return null
}

export function SignpostManager() {
  const getDirectionScore = useGameStore((s) => s.getDirectionScore)
  const [texts, setTexts] = useState<string[]>(() =>
    SIGNPOST_POSITIONS.map((_, i) => pickFromPool(ALL_POOL, i))
  )
  const lastScore = useRef(0)
  const { camera } = useThree()

  // Update signpost texts when directionScore changes significantly
  useFrame(() => {
    const score = getDirectionScore()
    const nearExit = camera.position.z < NEAR_EXIT_Z

    // Only update when score changes by > 0.5 to avoid constant re-renders
    if (Math.abs(score - lastScore.current) < 0.5 && !nearExit) return
    lastScore.current = score

    const newTexts = SIGNPOST_POSITIONS.map((sp, i) => {
      if (nearExit || sp.z < NEAR_EXIT_Z) return '→'
      if (score < -3) return pickFromPool(BERLIN_POOL, i)
      if (score > 3) return pickFromPool(KOREA_POOL, i)
      return pickFromPool(ALL_POOL, i + Math.floor(Math.abs(score)))
    })

    setTexts(newTexts)
  })

  // Signpost(텍스트가 위치에 따라 바뀌는 가로 보드) 제거 — FloorSign만 유지.
  // texts 상태는 directionScore 추적용으로 남겨두지만 화면엔 출력하지 않음.
  void texts
  return (
    <>
      {FLOOR_SIGNS.map((fs, i) => (
        <FloorSign
          key={`floor-${i}`}
          position={[fs.x, 0, fs.z]}
          text={fs.text}
        />
      ))}
    </>
  )
}
