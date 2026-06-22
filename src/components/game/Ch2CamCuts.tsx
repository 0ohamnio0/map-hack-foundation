/**
 * CH.2 카메라 컷 시스템 — 맵 특정 지점에서 카메라를 고정 시점으로 전환하는 프리셋 묶음.
 *
 * 각 프리셋:
 *  - trigger: 캐릭터가 이 반경에 들어오면 1회성 발동 (store visitedEvents 'ch2_<id>')
 *  - camPos: 카메라가 고정되는 월드 위치 (따라다니지 않음)
 *  - lookLerp: 캐릭터를 추적하는 pan 속도 (작을수록 느긋)
 *  - distance: 캐릭터가 이만큼(=발자국) 걸으면 자동 복귀. 서 있으면 유지.
 *  - slabs: 프레임 가장자리에 걸리는 전경 벽/파라펫 (컷 동안만 렌더)
 *
 * 카메라 소유권: 부모가 Ecctrl에 disableFollowCam={activeId!==null}을 주면 ecctrl이
 * 그 동안 camera.position/lookAt을 건드리지 않는다(Ecctrl.js:1675). 그 틈에 직접 구동.
 * 조작은 그대로(disableControl과 무관) — 플레이어는 계속 직접 걷는다.
 *
 * 프리셋 (현재 2종):
 *  - cctv : 맵 후반 H2 가로 골목, 건물 모서리 위 고정 감시카메라 (가장자리 벽 걸림)
 *  - peek : 미로 후반 V3 출구 골목, 벽 틈새로 훔쳐보는 듯한 낮은 시점 (양옆 벽 크랙)
 */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { CustomEcctrlRigidBody } from 'ecctrl'
import { useGameStore } from '@/store/useGameStore'
import { SCALE_X, SCALE_Z } from '@/scenes/ch2Layout'

// base(SCALE 전) → 월드 좌표 헬퍼. x·z는 base*SCALE, y는 월드 그대로.
const w = (bx: number, y: number, bz: number) =>
  new THREE.Vector3(bx * SCALE_X, y, bz * SCALE_Z)

export interface CamSlab {
  pos: THREE.Vector3
  size: [number, number, number]
  rotY: number
  color?: string
}

export interface CamCutPreset {
  id: string
  trigger: { x: number; z: number; radius: number } // 월드
  camPos: THREE.Vector3                              // 월드 (고정)
  lookYOff: number                                   // 조준점 높이 보정
  lookLerp: number                                   // 캐릭터 추적 pan 속도
  distance: number                                   // 복귀까지 걸을 거리(월드 m)
  slabs: CamSlab[]
  handheld?: boolean                                 // true면 카메라에 미세 손떨림(핸드헬드) 부여
  pillarbox?: boolean                                // true면 화면 양옆 블랙바(틈으로 훔쳐보기 페이크) — DOM은 Ch2Scene에서 렌더
}

// 한 발자국 ≈ 0.8m
const STEP_LEN = 0.8

export const CAM_CUTS: CamCutPreset[] = [
  // ① CCTV — H1 가로 골목(동쪽으로 걷는 중반 직선), 북측 벽 위 고정 감시카메라.
  //    북측 벽(z=-30) 근처 위에 마운트, 동진하는 캐릭터를 내려다봄. 동측에 벽 가장자리 걸림.
  {
    id: 'cctv',
    trigger: { x: 9 * SCALE_X, z: -35 * SCALE_Z, radius: 5 * SCALE_X },
    camPos: w(9, 8, -31),
    lookYOff: 0.8,
    lookLerp: 2.5,
    distance: STEP_LEN * 20,
    slabs: [
      // 마운트 동측 건물 벽 가장자리(파라펫) — 프레임 오른쪽에 걸림
      { pos: w(12.5, 5, -32), size: [0.8, 9, 5], rotY: 0, color: '#26262a' },
    ],
  },
  // ② PEEK — V3 출구 골목, 건물 틈에서 측면으로 몰래 보는 아이레벨 시점.
  //    동측 벽 가까이(x≈+6) 캐릭터 눈높이(y≈1.7)에 고정 → 수평 측면 응시(올려보지 않음).
  //    틈 느낌은 3D slab 대신 화면 양옆 pillarbox 블랙바(Ch2Scene)로 페이크 + 핸드헬드 흔들림.
  {
    id: 'peek',
    trigger: { x: 0 * SCALE_X, z: -78 * SCALE_Z, radius: 4 * SCALE_X },
    camPos: w(6.2, 1.7, -82), // 동측, 캐릭터 아이레벨 — 측면 응시
    lookYOff: 0.9,            // 시선 ~수평 (눈높이). 캐릭터 캡슐 중심 기준 살짝 위
    lookLerp: 1.2,            // 느긋한 관음 pan
    distance: STEP_LEN * 15,
    slabs: [],
    handheld: true,
    pillarbox: true,
  },
]

interface Props {
  targetRef: React.RefObject<CustomEcctrlRigidBody | null>
  activeId: string | null
  /** 다른 컷신/모달 없을 때만 트리거 가능 */
  enabled: boolean
  onStart: (id: string) => void
  onEnd: () => void
}

export const Ch2CamCuts: React.FC<Props> = ({ targetRef, activeId, enabled, onStart, onEnd }) => {
  const triggerEvent = useGameStore(s => s.triggerEvent)
  const prevPos = useRef<THREE.Vector3 | null>(null)
  const lookTarget = useRef(new THREE.Vector3())
  const traveled = useRef(0)
  const activeRef = useRef<string | null>(null)
  const endedRef = useRef(false)
  const tmpLook = useRef(new THREE.Vector3())

  useFrame(({ camera, clock }, delta) => {
    const rb = targetRef.current?.group
    if (!rb) return
    const t = rb.translation()
    const px = t.x, py = t.y, pz = t.z

    // 트리거 감지 (아무 컷도 활성 아닐 때만)
    if (!activeId && enabled) {
      for (const c of CAM_CUTS) {
        const ddx = px - c.trigger.x
        const ddz = pz - c.trigger.z
        if (Math.hypot(ddx, ddz) < c.trigger.radius) {
          if (triggerEvent(`ch2_${c.id}`)) { onStart(c.id); break }
        }
      }
    }

    if (activeId) {
      const preset = CAM_CUTS.find(c => c.id === activeId)
      if (preset) {
        const justEntered = activeRef.current !== activeId
        activeRef.current = activeId
        if (justEntered) {
          traveled.current = 0
          endedRef.current = false
          lookTarget.current.set(px, py + preset.lookYOff, pz) // 진입 즉시 조준 (하드컷)
        }

        camera.position.copy(preset.camPos) // 위치 고정
        // 핸드헬드 — 위치에 미세 떨림(레이어드 사인). 손에 든 카메라처럼 천천히 흔들림.
        if (preset.handheld) {
          const t = clock.elapsedTime
          camera.position.x += Math.sin(t * 1.7) * 0.06 + Math.sin(t * 3.9) * 0.028
          camera.position.y += Math.cos(t * 1.3) * 0.052 + Math.sin(t * 4.7) * 0.024
          camera.position.z += Math.sin(t * 2.1 + 1.0) * 0.06
        }
        tmpLook.current.set(px, py + preset.lookYOff, pz)
        lookTarget.current.lerp(tmpLook.current, 1 - Math.exp(-preset.lookLerp * delta))
        camera.lookAt(lookTarget.current)
        // 핸드헬드 — 시선에 미세 roll 추가
        if (preset.handheld) camera.rotateZ(Math.sin(clock.elapsedTime * 0.9) * 0.008)

        if (!justEntered && prevPos.current) {
          traveled.current += Math.hypot(px - prevPos.current.x, pz - prevPos.current.z)
        }
        if (!endedRef.current && traveled.current >= preset.distance) {
          endedRef.current = true
          onEnd()
        }
      }
    } else {
      activeRef.current = null
    }

    if (!prevPos.current) prevPos.current = new THREE.Vector3()
    prevPos.current.set(px, py, pz)
  })

  const preset = activeId ? CAM_CUTS.find(c => c.id === activeId) : null
  if (!preset) return null
  return (
    <>
      {preset.slabs.map((s, i) => (
        <mesh key={i} position={s.pos} rotation={[0, s.rotY, 0]} castShadow>
          <boxGeometry args={s.size} />
          <meshStandardMaterial color={s.color ?? '#26262a'} roughness={0.95} metalness={0.0} />
        </mesh>
      ))}
    </>
  )
}
