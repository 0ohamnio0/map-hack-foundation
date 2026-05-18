/**
 * CH.2 떨어진 쪽지 — 시 한 편을 담은 인터랙티브 아이템.
 * - 근접(< PROXIMITY_RADIUS) → "[E] 줍기" 오버레이
 * - E 키 → store.openNote(id) → NoteReader 모달
 * - 한 번 읽으면 visitedEvents에 기록 → 월드에서 사라짐 (휘발)
 */
import { useRef, useState, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '@/store/useGameStore'

// 종이 텍스처 슬러그 매핑 (소스: Archive/.../tex/paper/)
// FIBER01.webp→paper-01, SB001→paper-02, SB019→paper-03, SB020→paper-04,
// SB036→paper-05, SB050→paper-06, SB052→paper-07, SB053→paper-08
const BASE = import.meta.env.BASE_URL
const PAPER_TEXTURES = [
  `${BASE}assets/tex/paper/paper-01.webp`,
  `${BASE}assets/tex/paper/paper-02.webp`,
  `${BASE}assets/tex/paper/paper-03.webp`,
  `${BASE}assets/tex/paper/paper-04.webp`,
  `${BASE}assets/tex/paper/paper-05.webp`,
  `${BASE}assets/tex/paper/paper-06.webp`,
  `${BASE}assets/tex/paper/paper-07.webp`,
  `${BASE}assets/tex/paper/paper-08.webp`,
] as const

// CH2_NOTES 순서 인덱스 기반 결정적 매핑 (0→paper-01, 1→paper-02, …)
// 쪽지 7개 < 텍스처 8개 이므로 모두 고유 텍스처
const NOTE_TEXTURE_MAP: Record<string, string> = {
  theta:       PAPER_TEXTURES[0],
  entropy:     PAPER_TEXTURES[1],
  'jeju-fire': PAPER_TEXTURES[2],
  bichae:      PAPER_TEXTURES[3],
  'hell-salad':PAPER_TEXTURES[4],
  termination: PAPER_TEXTURES[5],
  highstreamer:PAPER_TEXTURES[6],
}

// 쪽지별 색 — 반짝이/글로우/수집 UI 공용. 시 분위기 기반, 어두운 CH.2 팔레트에서 구분
export const SPARKLE_COLOR: Record<string, string> = {
  theta:       '#6fd3e0', // 뇌파 — 청록
  entropy:     '#b58cff', // 엔트로피 — 보라
  'jeju-fire': '#ff8a4c', // 제주 불 — 잉걸 주황
  bichae:      '#8fe0a0', // 비채 — 연두
  'hell-salad':'#d6e85a', // 헬샐러드 — 산성 옐로우그린
  termination: '#ff6b6b', // 종료 — 창백한 적
  highstreamer:'#ffd27a', // 하이스트리머 — 골드
}
export const DEFAULT_SPARKLE = '#fff5c8'

// 3인칭 카메라가 캐릭터 뒤로 ~3유닛 떨어져 있어, 카메라-노트 거리 기준으로 넉넉하게 설정.
// 캐릭터 기준으로는 노트로부터 약 2~3유닛이면 [E] 줍기가 활성화됨.
const PROXIMITY_RADIUS = 5.5

interface NoteProps {
  noteId: string
  position: [number, number, number]
}

export function Note({ noteId, position }: NoteProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { camera } = useThree()
  const [near, setNear] = useState(false)

  const visited = useGameStore(s => s.visitedEvents.has(`note_${noteId}`))

  // 종이 텍스처 — noteId 기반 결정적 매핑, 1:1 고유 텍스처
  const paperMaterial = useMemo(() => {
    const texturePath = NOTE_TEXTURE_MAP[noteId] ?? PAPER_TEXTURES[0]
    const loader = new THREE.TextureLoader()
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.9,
      side: THREE.DoubleSide,
      transparent: true,
      alphaTest: 0.1,
    })
    let cancelled = false
    loader.load(
      texturePath,
      (tex) => {
        if (cancelled) { tex.dispose(); return }
        tex.colorSpace = THREE.SRGBColorSpace
        tex.wrapS = THREE.ClampToEdgeWrapping
        tex.wrapT = THREE.ClampToEdgeWrapping
        tex.repeat.set(1, 1)
        mat.map = tex
        mat.needsUpdate = true
      },
      undefined,
      (err) => { console.warn('[Note] texture load failed:', texturePath, err) }
    )
    return { mat, cancel: () => { cancelled = true } }
  }, [noteId])

  useEffect(() => {
    return () => {
      paperMaterial.cancel()
      paperMaterial.mat.dispose()
    }
  }, [paperMaterial])

  const activeNoteId = useGameStore(s => s.activeNoteId)
  const openNote = useGameStore(s => s.openNote)

  // near 상태에 따라 emissive 강도 갱신
  useEffect(() => {
    paperMaterial.mat.emissive.set('#fff8d0')
    paperMaterial.mat.emissiveIntensity = near ? 0.5 : 0.18
    paperMaterial.mat.needsUpdate = true
  }, [near, paperMaterial])

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

  // E 키로 줍기 — capture + stopImmediatePropagation으로 출구 진입(같은 E) 차단
  useEffect(() => {
    if (!near || visited || activeNoteId !== null) return
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'KeyE') {
        e.preventDefault()
        e.stopImmediatePropagation()
        openNote(noteId)
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [near, visited, activeNoteId, noteId, openNote])

  if (visited) return null

  return (
    <group ref={groupRef} position={position}>
      {/* 종이 — 바닥에 살짝 누운 상태로 떠 있음 */}
      <mesh rotation={[-Math.PI / 2.3, 0, 0.18]} castShadow>
        <planeGeometry args={[0.48, 0.675]} />
        <primitive
          object={paperMaterial.mat}
          attach="material"
        />
      </mesh>

      {/* 은은한 반짝이 입자 — 멀리서도 종이 위치가 보이도록 (near 게이트 없음) */}
      <Sparkles
        count={14}
        scale={[0.7, 0.5, 0.7]}
        size={near ? 4 : 3}
        speed={0.3}
        color={SPARKLE_COLOR[noteId] ?? DEFAULT_SPARKLE}
        position={[0, 0.12, 0]}
      />

      {/* 근접 시 은은한 발광 */}
      {near && <pointLight color={SPARKLE_COLOR[noteId] ?? DEFAULT_SPARKLE} intensity={0.9} distance={3.6} decay={2} />}

      {/* "[E] 줍기" 오버레이 */}
      {near && (
        <Html position={[0, 0.55, 0]} center>
          <div style={{
            color: '#f3eedd',
            fontFamily: '"Unifont", monospace',
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
