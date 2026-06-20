/**
 * PoemFragment — CH.3 시 조각 (CH.2 쪽지와 통일).
 * 벽(finale, 세움)·바닥(NPC 발밑, lieFlat) 공용. 종이 텍스처로 작게 놓이고,
 * 근접 시 store.nearFragmentId를 세팅 → Ch3Scene이 화면 하단에 [E] 읽기 프롬프트 표시(조각 위 Html로 가리지 않음).
 * [E] → store.openNote(id) → NoteReader 오버레이. visited(note_<id>)면 사라짐(CH.2 쪽지와 동일).
 *
 * 별도 파일인 이유: Ch3Scene(finale 갤러리)·ItaewonLayer(NPC 스폰) 둘 다 import → 순환 의존 방지.
 */
import React, { useRef, useState, useEffect } from 'react'
import { useFrame, useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useGameStore } from '@/store/useGameStore'

export const FRAG_H = 1.15        // 종이 조각 세로 — CH.2 쪽지급(놓인 상태에선 못 읽을 정도 → [E] 열람 유도)
export const FRAG_PROXIMITY = 6   // [E] 활성 반경
export const FRAG_TINT = '#c2ff33' // 형광 연두 — 종이에 살짝 발광 틴트
export const FRAG_PAPER = (i: number) => `${import.meta.env.BASE_URL ?? '/'}assets/tex/paper/paper-0${(i % 8) + 1}.webp`

export const PoemFragment: React.FC<{
  id: string
  paperIdx: number
  position: [number, number, number]
  rotationY?: number
  bob?: boolean      // 공중 부유 (현재 NPC는 바닥에 놓음 → 미사용 가능)
  lieFlat?: boolean  // true면 바닥에 눕힘 (NPC 발밑, CH.2 쪽지 느낌)
}> = ({ id, paperIdx, position, rotationY = 0, bob = false, lieFlat = false }) => {
  const tex = useLoader(THREE.TextureLoader, FRAG_PAPER(paperIdx))
  const { camera } = useThree()
  const [near, setNear] = useState(false)
  const visited = useGameStore((s) => s.visitedEvents.has(`note_${id}`))
  const activeNoteId = useGameStore((s) => s.activeNoteId)
  const openNote = useGameStore((s) => s.openNote)
  const setNearFragmentId = useGameStore((s) => s.setNearFragmentId)
  const groupRef = useRef<THREE.Group>(null)
  const matRef = useRef<THREE.MeshStandardMaterial>(null)
  const opacityRef = useRef(0)

  useEffect(() => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.needsUpdate = true
  }, [tex])

  useFrame(({ clock }) => {
    opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, 1, 0.06)
    if (matRef.current) {
      matRef.current.opacity = opacityRef.current
      matRef.current.emissiveIntensity = near ? 0.7 : 0.28
    }
    if (bob && groupRef.current) groupRef.current.position.y = position[1] + Math.sin(clock.elapsedTime * 1.6) * 0.12
    const dx = camera.position.x - position[0]
    const dz = camera.position.z - position[2]
    setNear(Math.sqrt(dx * dx + dz * dz) < FRAG_PROXIMITY && activeNoteId === null)
  })

  // 근접 상태를 store로 — Ch3Scene이 하단 [E] 읽기 프롬프트를 띄움 (조각 위에 안 가림)
  useEffect(() => {
    if (visited) return
    if (near) setNearFragmentId(id)
    else if (useGameStore.getState().nearFragmentId === id) setNearFragmentId(null)
    return () => { if (useGameStore.getState().nearFragmentId === id) setNearFragmentId(null) }
  }, [near, visited, id, setNearFragmentId])

  // [E] 열람 — capture + stopImmediatePropagation으로 시착실/출구의 E보다 우선
  useEffect(() => {
    if (visited || !near || activeNoteId !== null) return
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'KeyE') { e.preventDefault(); e.stopImmediatePropagation(); openNote(id) }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [visited, near, activeNoteId, id, openNote])

  if (visited) return null

  const w = FRAG_H * 0.7 // portrait 종이
  // 바닥에 눕힐 땐 살짝 기운 각도(CH.2 쪽지 느낌), 아니면 정면(벽)
  const meshRot: [number, number, number] = lieFlat ? [-Math.PI / 2.3, 0, 0.18] : [0, 0, 0]
  return (
    <group ref={groupRef} position={position} rotation={[0, rotationY, 0]}>
      <mesh rotation={meshRot}>
        <planeGeometry args={[w, FRAG_H]} />
        <meshStandardMaterial
          ref={matRef}
          map={tex}
          color={FRAG_TINT}
          emissive={FRAG_TINT}
          emissiveMap={tex}
          emissiveIntensity={0.28}
          transparent
          opacity={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {near && <pointLight color={FRAG_TINT} intensity={0.8} distance={3.5} decay={2} position={[0, 0.6, 0]} />}
    </group>
  )
}
