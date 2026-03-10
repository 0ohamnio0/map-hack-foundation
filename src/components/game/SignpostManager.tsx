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

const BERLIN_POOL = ['SchwuZ', 'Kreuzberg', 'Friedrichshain', 'Kottbusser Tor', 'Görlitzer Park']
const KOREA_POOL = ['신림역', '관악구', '이태원', '녹사평', '한남동']
const HANOI_POOL = ['Hoàn Kiếm', 'Phố cổ', 'Ba Đình']
const ALL_POOL = [...BERLIN_POOL, ...KOREA_POOL, ...HANOI_POOL]

const SIGNPOST_POSITIONS = [
  { x: 0, z: -10, rot: 0 },
  { x: 3, z: -20, rot: 0.3 },
  { x: 5, z: -35, rot: -0.2 },
  { x: 20, z: -45, rot: 0.5 },
  { x: 22, z: -55, rot: -0.3 },
  { x: 10, z: -65, rot: 0.2 },
  { x: -3, z: -75, rot: -0.1 },
  { x: 0, z: -82, rot: 0 },
]

const FLOOR_SIGNS = [
  { x: 2, z: -5, text: '일방통행' },
  { x: 15, z: -42, text: '어린이보호구역 30' },
  { x: -2, z: -70, text: '일방통행' },
]

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
    const nearExit = camera.position.z < -78

    // Only update when score changes by > 0.5 to avoid constant re-renders
    if (Math.abs(score - lastScore.current) < 0.5 && !nearExit) return
    lastScore.current = score

    const newTexts = SIGNPOST_POSITIONS.map((sp, i) => {
      if (nearExit || sp.z < -78) return '→'
      if (score < -3) return pickFromPool(BERLIN_POOL, i)
      if (score > 3) return pickFromPool(KOREA_POOL, i)
      return pickFromPool(ALL_POOL, i + Math.floor(Math.abs(score)))
    })

    setTexts(newTexts)
  })

  return (
    <>
      {SIGNPOST_POSITIONS.map((sp, i) => (
        <Signpost
          key={i}
          position={[sp.x, 0, sp.z]}
          text={texts[i]}
          rotation={sp.rot}
        />
      ))}
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
