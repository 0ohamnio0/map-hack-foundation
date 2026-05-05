/**
 * CH.2 떨어진 쪽지 — 시 한 편을 담은 인터랙티브 아이템.
 * - 근접(< PROXIMITY_RADIUS) → "[E] 줍기" 오버레이
 * - E 키 → store.openNote(id) → NoteReader 모달
 * - 한 번 읽으면 visitedEvents에 기록 → 월드에서 사라짐 (휘발)
 */
import { useRef, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '@/store/useGameStore'

// 3인칭 카메라가 캐릭터 뒤로 ~3유닛 떨어져 있어, NPC 거리 4유닛 컨벤션과 비슷하게 설정.
const PROXIMITY_RADIUS = 3.0

interface NoteProps {
  noteId: string
  position: [number, number, number]
}

export function Note({ noteId, position }: NoteProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { camera } = useThree()
  const [near, setNear] = useState(false)

  const visited = useGameStore(s => s.visitedEvents.has(`note_${noteId}`))
  const activeNoteId = useGameStore(s => s.activeNoteId)
  const openNote = useGameStore(s => s.openNote)

  const baseY = position[1]

  useFrame(() => {
    if (!groupRef.current || visited) return

    // 미세 부유 + 회전
    const t = performance.now() * 0.001
    groupRef.current.position.y = baseY + Math.sin(t * 1.6) * 0.04
    groupRef.current.rotation.y = t * 0.25

    // 카메라(=플레이어 시점)와의 거리
    const dx = camera.position.x - position[0]
    const dz = camera.position.z - position[2]
    const dist = Math.sqrt(dx * dx + dz * dz)

    // 다른 쪽지가 열려 있으면 hover 표시 비활성
    setNear(dist < PROXIMITY_RADIUS && activeNoteId === null)
  })

  // E 키로 줍기
  useEffect(() => {
    if (!near || visited || activeNoteId !== null) return
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'KeyE') {
        e.preventDefault()
        openNote(noteId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [near, visited, activeNoteId, noteId, openNote])

  if (visited) return null

  return (
    <group ref={groupRef} position={position}>
      {/* 종이 — 바닥에 살짝 누운 상태로 떠 있음 */}
      <mesh rotation={[-Math.PI / 2.3, 0, 0.18]} castShadow>
        <planeGeometry args={[0.32, 0.45]} />
        <meshStandardMaterial
          color="#f3eedd"
          emissive="#fff8d0"
          emissiveIntensity={near ? 0.5 : 0.18}
          side={THREE.DoubleSide}
          roughness={0.9}
        />
      </mesh>

      {/* 근접 시 은은한 발광 */}
      {near && <pointLight color="#fff5c8" intensity={0.7} distance={2.4} decay={2} />}

      {/* "[E] 줍기" 오버레이 */}
      {near && (
        <Html position={[0, 0.55, 0]} center>
          <div style={{
            color: '#f3eedd',
            fontFamily: 'monospace',
            fontSize: 12,
            letterSpacing: 3,
            background: 'rgba(0, 0, 0, 0.65)',
            padding: '4px 12px',
            border: '1px solid rgba(243, 238, 221, 0.35)',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            textShadow: '0 0 6px rgba(0,0,0,0.8)',
            userSelect: 'none',
          }}>
            [E] 줍기
          </div>
        </Html>
      )}
    </group>
  )
}
