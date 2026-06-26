/**
 * STEP 5: Itaewon memorial layer in CH.3 mart
 * - "2022-10-29" date on wall near cell (3,3), visible within 2 cells
 * - 1 ghost employee (Whispering Tide GLB):
 *   첫 약 픽업 전엔 없음 → 약 효과 시작 시 player 근처 0~1셀 random spawn → 그 자리 유지
 *   ch.2 스타일 머티리얼, 평상시 opacity 0.7, 한 발자국 안 0.9
 *   ghost bbox의 50%+가 카메라 frustum 안에 들어오는 순간 → Mirror_Viewing + 대사 (1회, ghost re-spawn 시 reset)
 */
import { useRef, useState, useEffect, useMemo, useCallback, Component, Suspense, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text, useGLTF, useAnimations } from '@react-three/drei'
import * as THREE from 'three'
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { useGameStore } from '@/store/useGameStore'
import { cellToWorld } from '@/utils/mazeGenerator'
import type { WallAABB } from '@/components/game/PlayerController'
import { PoemFragment } from '@/components/game/PoemFragment'
import { NPC_FRAGMENT_IDS } from '@/data/ch3Fragments'

// 디버그: ?sketch=1 → 약 없이도 ghost 상시 노출 (스케치 룩 튜닝용)
const SKETCH_DEBUG = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('sketch') === '1'

// 고스트 GLB 로드가 실패해도 Canvas 전체가 죽지(블랙) 않게 — 실패 시 고스트만 생략
class GhostBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(err: unknown) { console.warn('[ItaewonLayer] ghost load failed — skipping (no crash)', err) }
  render() { return this.state.failed ? null : this.props.children }
}

// 2D line vs AABB (XZ plane) — camera → ghost 사이 벽 occlusion 체크용
function lineIntersectsAABB(
  x0: number, z0: number,
  x1: number, z1: number,
  minX: number, maxX: number, minZ: number, maxZ: number
): boolean {
  const dx = x1 - x0
  const dz = z1 - z0
  let tmin = 0
  let tmax = 1
  if (Math.abs(dx) < 1e-8) {
    if (x0 < minX || x0 > maxX) return false
  } else {
    const t1 = (minX - x0) / dx
    const t2 = (maxX - x0) / dx
    tmin = Math.max(tmin, Math.min(t1, t2))
    tmax = Math.min(tmax, Math.max(t1, t2))
    if (tmin > tmax) return false
  }
  if (Math.abs(dz) < 1e-8) {
    if (z0 < minZ || z0 > maxZ) return false
  } else {
    const t1 = (minZ - z0) / dz
    const t2 = (maxZ - z0) / dz
    tmin = Math.max(tmin, Math.min(t1, t2))
    tmax = Math.min(tmax, Math.max(t1, t2))
    if (tmin > tmax) return false
  }
  return tmax >= 0 && tmin <= 1
}

const UNIFONT_URL = `${import.meta.env.BASE_URL}assets/fonts/unifont-16.0.02.otf`

const GHOST_IDLE_URL = `${import.meta.env.BASE_URL}assets/characters_biped/Whispering_Tide_biped/Meshy_AI_Whispering_Tide_biped_Animation_Idle_4_withSkin.glb`
const GHOST_MIRROR_URL = `${import.meta.env.BASE_URL}assets/characters_biped/Whispering_Tide_biped/Meshy_AI_Whispering_Tide_biped_Animation_Mirror_Viewing_withSkin.glb`
// 흰약 finale lean 고스트용 — 미사용이던 Confused_Scratch 루프
const GHOST_SCRATCH_URL = `${import.meta.env.BASE_URL}assets/characters_biped/Whispering_Tide_biped/Meshy_AI_Whispering_Tide_biped_Animation_Confused_Scratch_withSkin.glb`
useGLTF.preload(GHOST_IDLE_URL)
useGLTF.preload(GHOST_MIRROR_URL)
useGLTF.preload(GHOST_SCRATCH_URL)

const DRUG_EFFECTS = new Set(['desaturate', 'blur', 'darken', 'anxiolytic', 'whiteflash'])
// 흰약(whiteflash, 마지막) 스폰 시 NPC를 시착실 옆면 벽(거울 아님) 바깥에 기대 세움
const GHOST_LEAN_GAP = 1.1   // 옆벽 바깥으로 띄우는 간격 (부스 겹침 방지 — 한 발자국 앞으로)
const GHOST_LEAN_TILT = 0.12 // 벽 쪽으로 기우는 각(rad). 방향 어색하면 부호 반전

// Ghost bbox 근사 (scale 2 모델 기준)
const GHOST_HALF_WIDTH = 0.5
const GHOST_HALF_DEPTH = 0.5
const GHOST_MIN_Y = 0
const GHOST_MAX_Y = 3.4
// 발견 근접 폴백 — 플레이어가 유령에 이만큼 가까우면 화면에 안 들어와도(안 바라봐도) 발견.
// frustum 판정만으론 옆을 지나치면 놓쳐 쪽지 수집이 막히던 문제 대응.
const GHOST_PROXIMITY = 6

const _frustum = new THREE.Frustum()
const _frustumMatrix = new THREE.Matrix4()
const _bboxCorner = new THREE.Vector3()

interface ItaewonLayerProps {
  /** Cell (3,3) world position — 메모리얼 날짜 위치 (ghost와 별개) */
  cellWorldPos: { x: number; z: number }
  cellSize: number
  mazeSize: number
  playerPos: { x: number; z: number }
  /** 벽 occlusion 체크용 (없으면 occlusion 무시) */
  wallAABBs?: WallAABB[]
  /** 시착실 부스 — 흰약 finale 스폰 시 옆벽에 NPC 기대 세움 */
  fittingRoom?: { x: number; z: number; halfW: number }
  /** 빈 네모(전부 수집) 상태 — true가 되면 유령을 시착실 옆벽에 기대 스폰 (whiteflash 이펙트와 독립) */
  emptySquare?: boolean
}

function SpecialGhostEmployee({
  position,
  showText,
  textOpacity,
  cellSize,
  lean,
}: {
  position: [number, number, number]
  showText: boolean
  textOpacity: number
  cellSize: number
  lean?: { rotY: number; rotZ: number } | null
}) {
  const groupRef = useRef<THREE.Group>(null)
  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([])
  const currentOpacityRef = useRef(0.7)
  const fadeOutRef = useRef(false)  // 대사 모션 2회 끝나면 true → 투명해짐
  const { camera } = useThree()
  const idleGltf = useGLTF(GHOST_IDLE_URL)
  const mirrorGltf = useGLTF(GHOST_MIRROR_URL)
  const scratchGltf = useGLTF(GHOST_SCRATCH_URL)

  // per-instance 클론(스켈레톤 포함) — useGLTF 공유 캐시 scene을 <primitive>로 직접 붙이면
  // 스폰마다(key 변경) 리마운트 시 같은 객체가 그래프에서 떨어져 안 보임 → 클론으로 격리.
  // (Ch3Scene 우주 모델과 동일 패턴)
  const model = useMemo(() => skeletonClone(idleGltf.scene), [idleGltf.scene])

  const animations = useMemo(() => {
    const idleClips = idleGltf.animations.map((c) => {
      const clone = c.clone()
      clone.name = 'idle'
      return clone
    })
    const mirrorClips = mirrorGltf.animations.map((c) => {
      const clone = c.clone()
      clone.name = 'mirror'
      return clone
    })
    const scratchClips = scratchGltf.animations.map((c) => {
      const clone = c.clone()
      clone.name = 'scratch'
      return clone
    })
    return [...idleClips, ...mirrorClips, ...scratchClips]
  }, [idleGltf.animations, mirrorGltf.animations, scratchGltf.animations])

  const { actions } = useAnimations(animations, groupRef)

  // (발 잘림은 PS1 snap이 원인 → off로 해결. modelY 오프셋은 불필요해 제거)

  // ch.2 스타일 — alpha/transmission 강제 reset, useFrame이 transparent 토글
  useEffect(() => {
    const mats: THREE.MeshStandardMaterial[] = []
    model.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh || !mesh.material) return
      const m = mesh.material as THREE.MeshStandardMaterial & {
        transmission?: number
        transmissionMap?: THREE.Texture | null
      }
      m.transparent = false
      m.opacity = 1
      m.alphaTest = 0
      m.alphaMap = null
      m.depthWrite = true
      m.depthTest = true
      m.side = THREE.FrontSide
      m.blending = THREE.NormalBlending
      if ('transmission' in m && typeof m.transmission === 'number') m.transmission = 0
      if ('transmissionMap' in m) m.transmissionMap = null
      m.needsUpdate = true
      mats.push(m)
    })
    materialsRef.current = mats
  }, [model])

  // 평상시 idle — finale lean 고스트는 Confused_Scratch 루프
  useEffect(() => {
    const clip = lean ? actions['scratch'] : actions['idle']
    if (clip && !clip.isRunning()) clip.reset().fadeIn(0.3).play()
  }, [actions, lean])

  // 대사 시 mirror 모션 1회(80% 속도, 느리게) → 모션 끝나면 투명 페이드아웃
  // finale lean 고스트(흰약)는 예외 — 페이드아웃 없이 계속 서 있게(scratch 루프 유지)
  useEffect(() => {
    if (!showText || lean) return
    const idle = actions['idle']
    const mirror = actions['mirror']
    if (!idle || !mirror) return
    idle.fadeOut(0.3)
    mirror.reset()
    mirror.setEffectiveTimeScale(0.8)   // 80% 속도
    mirror.setLoop(THREE.LoopOnce, 1)
    mirror.clampWhenFinished = true
    mirror.fadeIn(0.3).play()
    // 모션 끝나면(클립 길이 / 0.8 + 여유) 투명 페이드아웃 — 타이머가 mixer 'finished'보다 확실
    const dur = mirror.getClip().duration || 3 // 클립 길이 비정상 시 3s 기본 (즉시 페이드 방지)
    setTimeout(() => { fadeOutRef.current = true }, (dur / 0.8) * 1000 + 300)
  }, [showText, actions, lean])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    const gp = groupRef.current.position
    const dx = camera.position.x - gp.x
    const dz = camera.position.z - gp.z
    const distSq = dx * dx + dz * dz

    if (lean) {
      // 흰약 finale — 시착실 옆벽에 기댐: 카메라 추적 대신 고정 회전 + 살짝 기울임
      groupRef.current.rotation.y = lean.rotY
      groupRef.current.rotation.z = lean.rotZ
    } else if (distSq > 0.01) {
      groupRef.current.rotation.y = Math.atan2(dx, dz)
    }

    const target = fadeOutRef.current ? 0 : 1  // 평소 불투명, 모션 2회 끝나면 투명
    currentOpacityRef.current = THREE.MathUtils.lerp(currentOpacityRef.current, target, delta * 8)
    let opacity = currentOpacityRef.current
    // 점근만 하고 안 사라지던 문제 → 충분히 낮아지면 완전히 0으로 + 그룹 숨김(깔끔히 사라짐)
    if (fadeOutRef.current && opacity < 0.04) {
      opacity = 0
      groupRef.current.visible = false
    }
    const needTransparent = opacity < 0.99
    for (const m of materialsRef.current) {
      m.opacity = opacity
      if (m.transparent !== needTransparent) {
        m.transparent = needTransparent
        m.needsUpdate = true
      }
    }
  })

  return (
    <group ref={groupRef} position={position}>
      <primitive object={model} scale={2} />
      {showText && (
        <Text
          position={[0, 3.6, 0]}
          fontSize={0.18}
          color="#fff"
          font={UNIFONT_URL}
          anchorX="center"
          anchorY="middle"
          renderOrder={998}
          material-transparent
          material-opacity={textOpacity}
          material-depthTest={false}
        >
          take it all you want
        </Text>
      )}
    </group>
  )
}

export function ItaewonLayer({ cellWorldPos: _cellWorldPos, cellSize, mazeSize, playerPos: _playerPos, wallAABBs, fittingRoom, emptySquare }: ItaewonLayerProps) {
  const { camera } = useThree()
  const activeEffect = useGameStore((s) => s.activeEffect)
  const markGhostEncounter = useGameStore((s) => s.markGhostEncounter)
  const [showText, setShowText] = useState(false)
  const [textOpacity, setTextOpacity] = useState(0)
  const [ghostPos, setGhostPos] = useState<[number, number, number] | null>(null)
  // NPC 등장 시 그 자리에 뜨는 수집형 시 조각 — 스폰 순서(약 순서)대로 ckshp/맹점 매핑
  const [npcFragId, setNpcFragId] = useState<string | null>(null)
  // 흰약 finale일 때만 set — 시착실 옆벽 기댐 회전(없으면 일반 카메라 추적)
  const [ghostLean, setGhostLean] = useState<{ rotY: number; rotZ: number } | null>(null)
  // 빈 네모 피날레 2단계 — 'front'(눈 앞 idle) → 마지막 조각 읽으면 'lean'(시착실 옆벽 기댐, 계속 머묾)
  const [finalePhase, setFinalePhase] = useState<'front' | 'lean' | null>(null)
  const finalePhaseRef = useRef<'front' | 'lean' | null>(null)
  const finaleFragRef = useRef<string | null>(null) // 피날레 마지막 조각 id (읽음 감지용)
  const spawnCountRef = useRef(0)
  const wasInViewRef = useRef(false)
  const prevGhostCellRef = useRef<{ gx: number; gy: number } | null>(null)
  const isFirstSpawnRef = useRef(true)
  const playerPosRef = useRef(_playerPos)
  const fittingRoomRef = useRef(fittingRoom)
  const emptySquareRef = useRef(!!emptySquare)
  const leanedRef = useRef(false) // 빈 네모 피날레 1회만 (중복 방지)

  useEffect(() => {
    playerPosRef.current = _playerPos
    fittingRoomRef.current = fittingRoom
    emptySquareRef.current = !!emptySquare
  })

  // 스폰 로직 — 시야 270도 안 + 벽에 안 가려진(clear LOS) cell 선택 후 ghostPos 세팅
  const spawnGhost = useCallback(() => {
    // finale — 빈 네모(전부 수집/whiteflash) 첫 도착: NPC+마지막 조각을 플레이어 "눈 앞"에 idle 스폰(PHASE A).
    // 그 조각을 읽으면(아래 PHASE B effect) NPC가 시착실 옆벽으로 이동해 계속 기댐.
    const FR = fittingRoomRef.current
    const isFinaleCtx = useGameStore.getState().activeEffect === 'whiteflash' || emptySquareRef.current
    if (isFinaleCtx) {
      if (leanedRef.current || !FR) return // 이미 피날레 처리됨 → normal 스폰으로 빠지지 않게 중단
      const fwd = new THREE.Vector3()
      camera.getWorldDirection(fwd)
      const fl = Math.hypot(fwd.x, fwd.z) || 1
      const ahead = 2.4 * cellSize
      const wmax = mazeSize * cellSize
      const clampW = (v: number) => Math.max(cellSize * 0.5, Math.min(wmax - cellSize * 0.5, v))
      const fx = clampW(camera.position.x + (fwd.x / fl) * ahead)
      const fz = clampW(camera.position.z + (fwd.z / fl) * ahead)
      const fragId = NPC_FRAGMENT_IDS[Math.min(spawnCountRef.current, NPC_FRAGMENT_IDS.length - 1)]
      finaleFragRef.current = fragId
      setNpcFragId(fragId)
      setGhostPos([fx, 0, fz]) // 눈 앞 — lean 없이 idle, 카메라 향함
      setGhostLean(null)
      spawnCountRef.current += 1
      prevGhostCellRef.current = null
      isFirstSpawnRef.current = false
      wasInViewRef.current = false
      leanedRef.current = true
      finalePhaseRef.current = 'front'
      setFinalePhase('front')
      return
    }
    setGhostLean(null)
    const pp = playerPosRef.current
    const pCellX = Math.round(pp.x / cellSize)
    const pCellY = Math.round(pp.z / cellSize)

    const prev = prevGhostCellRef.current
    const isFirst = isFirstSpawnRef.current
    const camFwd = new THREE.Vector3()
    camera.getWorldDirection(camFwd)
    const camLen = Math.hypot(camFwd.x, camFwd.z) || 1
    const fwdX = camFwd.x / camLen
    const fwdZ = camFwd.z / camLen
    const camX = camera.position.x
    const camZ = camera.position.z

    // camera→target 사이 벽 차단 검사. ghost 폭(±GHOST_HALF) 양 끝까지 3광선 전부 통과해야 clear.
    // 풀 wall bounds 사용(inset 없음) — 모서리 스쳐 지나가는 false-clear 방지.
    const hasClearLOS = (tx: number, tz: number): boolean => {
      if (!wallAABBs || wallAABBs.length === 0) return true
      const dx = tx - camX
      const dz = tz - camZ
      const len = Math.hypot(dx, dz) || 1
      const ox = (-dz / len) * GHOST_HALF_WIDTH // sightline 수직 offset (몸통 폭)
      const oz = (dx / len) * GHOST_HALF_WIDTH
      const rays: [number, number][] = [[tx, tz], [tx + ox, tz + oz], [tx - ox, tz - oz]]
      for (const [rx, rz] of rays) {
        const blocked = wallAABBs.some((w) =>
          lineIntersectsAABB(camX, camZ, rx, rz, w.minX, w.maxX, w.minZ, w.maxZ),
        )
        if (blocked) return false
      }
      return true
    }

    // 실제 카메라 가로 시야(FOV) cos 임계 — 이 cone 안이면 화면에 보임. 가장자리 클리핑 방지로 약간 안쪽(*0.8)
    const cam = camera as THREE.PerspectiveCamera
    const halfV = THREE.MathUtils.degToRad(cam.fov || 75) / 2
    const halfH = Math.atan(Math.tan(halfV) * (cam.aspect || 1.6))
    const inViewCos = Math.cos(halfH * 0.8)

    // 결정적 스캔 — 후방 제외 + clear LOS + 최소거리(MIN_CHEB) 하드 제약(가깝게/겹치게 안 뜸). inView = 실제 화면 안
    const MIN_CHEB = 2 // 최소 스폰 거리(셀). 너무 가까우면 ↑(3), 가까워도 되면 ↓
    const MAX_R = 4
    const candidates: { gx: number; gy: number; dist: number; inView: boolean }[] = []
    for (let oy = -MAX_R; oy <= MAX_R; oy++) {
      for (let ox = -MAX_R; ox <= MAX_R; ox++) {
        if (Math.max(Math.abs(ox), Math.abs(oy)) < MIN_CHEB) continue // 본인 셀 + 너무 가까운 셀 제외
        const cx = pCellX + ox
        const cy = pCellY + oy
        if (cx < 0 || cx >= mazeSize || cy < 0 || cy >= mazeSize) continue
        if (prev && prev.gx === cx && prev.gy === cy) continue
        const tw = cellToWorld(cx, cy, cellSize)
        const dxg = tw.x - camX
        const dzg = tw.z - camZ
        const len = Math.hypot(dxg, dzg)
        if (len < 0.001) continue
        const dot = (fwdX * dxg + fwdZ * dzg) / len
        if (dot < -0.707) continue // 완전 후방 제외(폴백 후보로만)
        if (!hasClearLOS(tw.x, tw.z)) continue // 벽에 가려짐
        candidates.push({ gx: cx, gy: cy, dist: Math.hypot(ox, oy), inView: dot >= inViewCos })
      }
    }

    // 선택 — (1) clear-LOS + 화면 안 후보가 있으면 그중 가까운 절반 random (약 먹자마자 시야에 등장)
    //        (2) 없으면(카메라가 벽 봄) 아래 front-fallback이 카메라 정면에 강제 스폰
    const inViewCands = candidates.filter((c) => c.inView)
    let target: { gx: number; gy: number } | undefined
    if (inViewCands.length) {
      inViewCands.sort((a, b) => a.dist - b.dist)
      const pool = inViewCands.slice(0, Math.max(1, Math.ceil(inViewCands.length / 2)))
      target = pool[Math.floor(Math.random() * pool.length)]
    }
    if (!target) {
      // 전방 clear-LOS·화면 안 후보가 없음(벽 마주봄 등) → 과거엔 nearAny[0](화면 밖 옆/뒤 셀)로
      // 떨어져 "유령이 안 보이고 encounter도 안 잡혀 효과가 안 끝나는" 사슬을 만들었다.
      // 대신 finale와 동일하게 카메라 정면(MIN_CHEB+0.5 셀 앞)에 강제 스폰 → 항상 화면 안 등장 → encounter 보장.
      const fwd = new THREE.Vector3()
      camera.getWorldDirection(fwd)
      const fl = Math.hypot(fwd.x, fwd.z) || 1
      const ahead = (MIN_CHEB + 0.5) * cellSize
      const wmax = mazeSize * cellSize
      const clampW = (v: number) => Math.max(cellSize * 0.5, Math.min(wmax - cellSize * 0.5, v))
      const fx = clampW(camX + (fwd.x / fl) * ahead)
      const fz = clampW(camZ + (fwd.z / fl) * ahead)
      console.log('[ItaewonLayer] ghost spawn front-fallback', { fx, fz, pCellX, pCellY })
      setGhostPos([fx, 0, fz])
      setNpcFragId(NPC_FRAGMENT_IDS[Math.min(spawnCountRef.current, NPC_FRAGMENT_IDS.length - 1)])
      spawnCountRef.current += 1
      prevGhostCellRef.current = null
      isFirstSpawnRef.current = false
      wasInViewRef.current = false
      return
    }
    const how = inViewCands.length ? 'inview-near' : 'front-fallback'

    const world = cellToWorld(target.gx, target.gy, cellSize)
    console.log('[ItaewonLayer] ghost spawn', { gx: target.gx, gy: target.gy, world, pCellX, pCellY, isFirst, how, candidates: candidates.length, inView: inViewCands.length })
    setGhostPos([world.x, 0, world.z])
    // 이 스폰에 대응하는 시 조각(약 순서) — ckshp1..3, maengjeom1..2
    setNpcFragId(NPC_FRAGMENT_IDS[Math.min(spawnCountRef.current, NPC_FRAGMENT_IDS.length - 1)])
    spawnCountRef.current += 1
    prevGhostCellRef.current = { gx: target.gx, gy: target.gy }
    isFirstSpawnRef.current = false
    wasInViewRef.current = false
  }, [cellSize, mazeSize, wallAABBs, camera])

  // 약 효과 시작 시 스폰
  useEffect(() => {
    if (!activeEffect || !DRUG_EFFECTS.has(activeEffect)) return
    spawnGhost()
  }, [activeEffect, spawnGhost])

  // 빈 네모(전부 수집) — whiteflash 이펙트 없이도 피날레 유령 스폰 (dev 점프 포함). 1회만.
  useEffect(() => {
    if (emptySquare && !leanedRef.current) spawnGhost()
  }, [emptySquare, spawnGhost])

  // PHASE B — 빈 네모 첫 조각(눈 앞)을 읽으면(visitedEvents) NPC를 시착실 옆벽으로 이동시켜 계속 기댐.
  const finaleFragRead = useGameStore((s) => {
    const fid = finaleFragRef.current
    return !!fid && s.visitedEvents.has(`note_${fid}`)
  })
  useEffect(() => {
    if (finalePhase !== 'front' || !finaleFragRead) return
    const FR = fittingRoomRef.current
    if (!FR) return
    setGhostPos([FR.x - FR.halfW - GHOST_LEAN_GAP, 0, FR.z]) // 좌측 옆벽 바깥 (부스 셀 중심이라 z 정면 정렬)
    setGhostLean({ rotY: -Math.PI / 2, rotZ: GHOST_LEAN_TILT }) // 90° 돌려 옆벽 평행 — 등을 벽에 대고 기댐
    finalePhaseRef.current = 'lean'
    setFinalePhase('lean')
    markGhostEncounter() // 흰약 효과(스케치) 깔끔히 종료 — 안 그러면 store가 encounter 폴링을 계속함
  }, [finalePhase, finaleFragRead, markGhostEncounter])

  // 디버그: ?sketch=1 → 약 없이도 마운트 후 ghost 상시 노출
  useEffect(() => {
    if (!SKETCH_DEBUG) return
    const id = setTimeout(() => spawnGhost(), 600)
    return () => clearTimeout(id)
  }, [spawnGhost])

  // 매 프레임 — ghost bbox 8 corner 중 4+개가 frustum 안 → 1회 트리거 (cycle 진행 중 X)
  useFrame(() => {
    if (!ghostPos || showText || wasInViewRef.current) return
    if (finalePhaseRef.current) return // 피날레 고스트는 "take it all you want" 대사·페이드 없음 (그냥 서 있음)

    _frustumMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    _frustum.setFromProjectionMatrix(_frustumMatrix)

    const cx = ghostPos[0]
    const cz = ghostPos[2]
    let visible = 0
    for (let xi = 0; xi < 2; xi++) {
      for (let yi = 0; yi < 2; yi++) {
        for (let zi = 0; zi < 2; zi++) {
          _bboxCorner.set(
            cx + (xi ? GHOST_HALF_WIDTH : -GHOST_HALF_WIDTH),
            yi ? GHOST_MAX_Y : GHOST_MIN_Y,
            cz + (zi ? GHOST_HALF_DEPTH : -GHOST_HALF_DEPTH)
          )
          if (_frustum.containsPoint(_bboxCorner)) visible++
        }
      }
    }

    // 발견 = (A) bbox 4+ corner가 화면 안  또는  (B) 플레이어가 유령 바로 근처(안 바라봐도)
    const inView = visible >= 4
    const pp = playerPosRef.current
    const nearGhost = Math.hypot(pp.x - cx, pp.z - cz) < GHOST_PROXIMITY
    if (!inView && !nearGhost) return

    // Wall occlusion check — 시야 발견은 camera 기준, 근접 발견은 player 기준 (벽 너머 오발견 방지)
    if (wallAABBs && wallAABBs.length > 0) {
      const ox = inView ? camera.position.x : pp.x
      const oz = inView ? camera.position.z : pp.z
      const occluded = wallAABBs.some((w) =>
        lineIntersectsAABB(ox, oz, cx, cz, w.minX, w.maxX, w.minZ, w.maxZ)
      )
      if (occluded) return
    }

    wasInViewRef.current = true
    markGhostEncounter() // 약 효과 종료 신호 (minimum duration 후 cleanup)
    setShowText(true)
    let opacity = 0
    const fadeIn = setInterval(() => {
      opacity += 0.02
      if (opacity >= 1) {
        opacity = 1
        clearInterval(fadeIn)
        setTimeout(() => {
          const fadeOut = setInterval(() => {
            opacity -= 0.02
            if (opacity <= 0) {
              opacity = 0
              clearInterval(fadeOut)
              setShowText(false)
            }
            setTextOpacity(opacity)
          }, 20)
        }, 6000)  // 대사 유지시간 2배 (기존 3000)
      }
      setTextOpacity(opacity)
    }, 20)
  })

  return (
    <>
      {ghostPos && (
        // key=스폰 위치 → 스폰마다 boundary/Suspense 리셋(이전 로드 실패 시 재시도). Suspense로 로딩 중엔 graceful
        <GhostBoundary key={ghostPos.join(',')}>
          <Suspense fallback={null}>
            <SpecialGhostEmployee
              position={ghostPos}
              showText={showText}
              textOpacity={textOpacity}
              cellSize={cellSize}
              lean={ghostLean}
            />
          </Suspense>
        </GhostBoundary>
      )}

      {/* NPC 발밑 바닥에 놓이는 수집형 시 조각 (ckshp/맹점) — 근접 시 화면 하단 [E] 읽기 (CH.2 쪽지 느낌) */}
      {ghostPos && npcFragId && (
        <Suspense fallback={null}>
          <PoemFragment
            key={npcFragId}
            id={npcFragId}
            paperIdx={(NPC_FRAGMENT_IDS as readonly string[]).indexOf(npcFragId)}
            position={[ghostPos[0], 0.06, ghostPos[2]]}
            lieFlat
          />
        </Suspense>
      )}
    </>
  )
}
