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
import { useGameStore } from '@/store/useGameStore'
import { useSoundManager } from '@/hooks/useSoundManager'
import { cellToWorld } from '@/utils/mazeGenerator'
import type { WallAABB } from '@/components/game/PlayerController'

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
useGLTF.preload(GHOST_IDLE_URL)
useGLTF.preload(GHOST_MIRROR_URL)

const DRUG_EFFECTS = new Set(['desaturate', 'blur', 'darken', 'anxiolytic', 'whiteflash'])

// Ghost bbox 근사 (scale 2 모델 기준)
const GHOST_HALF_WIDTH = 0.5
const GHOST_HALF_DEPTH = 0.5
const GHOST_MIN_Y = 0
const GHOST_MAX_Y = 3.4

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
}

function SpecialGhostEmployee({
  position,
  showText,
  textOpacity,
  cellSize,
}: {
  position: [number, number, number]
  showText: boolean
  textOpacity: number
  cellSize: number
}) {
  const groupRef = useRef<THREE.Group>(null)
  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([])
  const currentOpacityRef = useRef(0.7)
  const fadeOutRef = useRef(false)  // 대사 모션 2회 끝나면 true → 투명해짐
  const { camera } = useThree()
  const idleGltf = useGLTF(GHOST_IDLE_URL)
  const mirrorGltf = useGLTF(GHOST_MIRROR_URL)

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
    return [...idleClips, ...mirrorClips]
  }, [idleGltf.animations, mirrorGltf.animations])

  const { actions } = useAnimations(animations, groupRef)

  // (발 잘림은 PS1 snap이 원인 → off로 해결. modelY 오프셋은 불필요해 제거)

  // ch.2 스타일 — alpha/transmission 강제 reset, useFrame이 transparent 토글
  useEffect(() => {
    const mats: THREE.MeshStandardMaterial[] = []
    idleGltf.scene.traverse((child) => {
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
  }, [idleGltf.scene])

  // 평상시 idle
  useEffect(() => {
    const idle = actions['idle']
    if (idle && !idle.isRunning()) idle.reset().fadeIn(0.3).play()
  }, [actions])

  // 대사 시 mirror 모션 1회(80% 속도, 느리게) → 모션 끝나면 투명 페이드아웃
  useEffect(() => {
    if (!showText) return
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
  }, [showText, actions])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    const gp = groupRef.current.position
    const dx = camera.position.x - gp.x
    const dz = camera.position.z - gp.z
    const distSq = dx * dx + dz * dz

    if (distSq > 0.01) {
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
      <primitive object={idleGltf.scene} scale={2} />
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

export function ItaewonLayer({ cellWorldPos: _cellWorldPos, cellSize, mazeSize, playerPos: _playerPos, wallAABBs }: ItaewonLayerProps) {
  const { camera } = useThree()
  const activeEffect = useGameStore((s) => s.activeEffect)
  const markGhostEncounter = useGameStore((s) => s.markGhostEncounter)
  const { play } = useSoundManager()
  const [showText, setShowText] = useState(false)
  const [textOpacity, setTextOpacity] = useState(0)
  const [ghostPos, setGhostPos] = useState<[number, number, number] | null>(null)
  const wasInViewRef = useRef(false)
  const prevGhostCellRef = useRef<{ gx: number; gy: number } | null>(null)
  const isFirstSpawnRef = useRef(true)
  const playerPosRef = useRef(_playerPos)

  useEffect(() => {
    playerPosRef.current = _playerPos
  })

  // 스폰 로직 — 시야 270도 안 + 벽에 안 가려진(clear LOS) cell 선택 후 ghostPos 세팅
  const spawnGhost = useCallback(() => {
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

    if (candidates.length === 0) {
      console.warn('[ItaewonLayer] spawn failed — no clear-LOS cell at min distance', { isFirst, pCellX, pCellY })
      return
    }

    // 모두 MIN_CHEB 이상이라 가깝게 안 뜸. 화면 안 우선, 없으면 (먼) 나머지
    const inView = candidates.filter((c) => c.inView)
    const usable = inView.length ? inView : candidates

    // 거리 정렬 후 — 첫 스폰은 먼 절반(드라마틱), 이후는 가까운 절반에서 random
    usable.sort((a, b) => a.dist - b.dist)
    const pool = isFirst
      ? usable.slice(Math.floor(usable.length / 2))
      : usable.slice(0, Math.max(1, Math.ceil(usable.length / 2)))
    const target = pool[Math.floor(Math.random() * pool.length)]

    const world = cellToWorld(target.gx, target.gy, cellSize)
    console.log('[ItaewonLayer] ghost spawn', { gx: target.gx, gy: target.gy, world, pCellX, pCellY, isFirst, candidates: candidates.length })
    setGhostPos([world.x, 0, world.z])
    prevGhostCellRef.current = { gx: target.gx, gy: target.gy }
    isFirstSpawnRef.current = false
    wasInViewRef.current = false
  }, [cellSize, mazeSize, wallAABBs, camera])

  // 약 효과 시작 시 스폰
  useEffect(() => {
    if (!activeEffect || !DRUG_EFFECTS.has(activeEffect)) return
    spawnGhost()
  }, [activeEffect, spawnGhost])

  // 디버그: ?sketch=1 → 약 없이도 마운트 후 ghost 상시 노출
  useEffect(() => {
    if (!SKETCH_DEBUG) return
    const id = setTimeout(() => spawnGhost(), 600)
    return () => clearTimeout(id)
  }, [spawnGhost])

  // 매 프레임 — ghost bbox 8 corner 중 4+개가 frustum 안 → 1회 트리거 (cycle 진행 중 X)
  useFrame(() => {
    if (!ghostPos || showText || wasInViewRef.current) return

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

    if (visible < 4) return

    // Wall occlusion check — camera → ghost (XZ plane line) 어떤 wall AABB와 intersect → 가려짐
    if (wallAABBs && wallAABBs.length > 0) {
      const occluded = wallAABBs.some((w) =>
        lineIntersectsAABB(camera.position.x, camera.position.z, cx, cz, w.minX, w.maxX, w.minZ, w.maxZ)
      )
      if (occluded) return
    }

    wasInViewRef.current = true
    markGhostEncounter() // 약 효과 종료 신호 (minimum duration 후 cleanup)
    setShowText(true)
    play('space') // NPC 발견 순간 space SFX
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
            />
          </Suspense>
        </GhostBoundary>
      )}
    </>
  )
}
