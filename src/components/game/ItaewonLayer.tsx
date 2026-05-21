/**
 * STEP 5: Itaewon memorial layer in CH.3 mart
 * - "2022-10-29" date on wall near cell (3,3), visible within 2 cells
 * - 1 ghost employee (Whispering Tide GLB):
 *   첫 약 픽업 전엔 없음 → 약 효과 시작 시 player 근처 0~1셀 random spawn → 그 자리 유지
 *   ch.2 스타일 머티리얼, 평상시 opacity 0.7, 한 발자국 안 0.9
 *   ghost bbox의 50%+가 카메라 frustum 안에 들어오는 순간 → Mirror_Viewing + 대사 (1회, ghost re-spawn 시 reset)
 */
import { useRef, useState, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text, useGLTF, useAnimations } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '@/store/useGameStore'
import { cellToWorld } from '@/utils/mazeGenerator'
import type { WallAABB } from '@/components/game/PlayerController'

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

  useEffect(() => {
    const idle = actions['idle']
    const mirror = actions['mirror']
    if (!idle || !mirror) return
    if (showText) {
      idle.fadeOut(0.5)
      mirror.reset().fadeIn(0.5).play()
    } else {
      mirror.fadeOut(0.5)
      idle.reset().fadeIn(0.5).play()
    }
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

    const dist = Math.sqrt(distSq)
    const NEAR = cellSize
    const FAR = cellSize * 2
    const OVERLAP = 1.0  // 거리 < 1m → opacity 0 (player와 같은 위치 겹침)
    let target: number
    if (dist < OVERLAP) {
      target = 0
    } else if (dist <= NEAR) {
      // OVERLAP ~ NEAR: 0 → 0.9 fade in
      target = 0.9 * (dist - OVERLAP) / (NEAR - OVERLAP)
    } else if (dist <= FAR) {
      const t = (dist - NEAR) / (FAR - NEAR)
      target = 0.9 - 0.2 * t
    } else {
      target = 0.7
    }
    currentOpacityRef.current = THREE.MathUtils.lerp(currentOpacityRef.current, target, delta * 6)
    const opacity = currentOpacityRef.current
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
          position={[0, 1.5, 0]}
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

  // Spawn ghost when a drug effect starts — 0~1셀 random offset (in-bounds), reset edge detection
  useEffect(() => {
    if (!activeEffect || !DRUG_EFFECTS.has(activeEffect)) return

    const pp = playerPosRef.current
    const pCellX = Math.round(pp.x / cellSize)
    const pCellY = Math.round(pp.z / cellSize)

    let target: { gx: number; gy: number } | null = null
    const prev = prevGhostCellRef.current
    const isFirst = isFirstSpawnRef.current
    const camFwd = new THREE.Vector3()
    camera.getWorldDirection(camFwd)
    const camX = camera.position.x
    const camZ = camera.position.z
    const WALL_PAD = 0.3 // wall AABB inset — corner edge 살짝 통과 허용

    // Strict only — 시야 270도 + wall 안 가려짐 둘 다 통과만
    for (let attempt = 0; attempt < 200; attempt++) {
      const angle = Math.random() * Math.PI * 2
      const dist = isFirst ? 3 : Math.random()
      const offX = Math.round(Math.cos(angle) * dist)
      const offY = Math.round(Math.sin(angle) * dist)
      if (offX === 0 && offY === 0) continue
      const cx = pCellX + offX
      const cy = pCellY + offY
      if (cx < 0 || cx >= mazeSize || cy < 0 || cy >= mazeSize) continue
      if (prev && prev.gx === cx && prev.gy === cy) continue
      const targetWorld = cellToWorld(cx, cy, cellSize)
      const dxg = targetWorld.x - camX
      const dzg = targetWorld.z - camZ
      const len = Math.sqrt(dxg * dxg + dzg * dzg)
      if (len < 0.001) continue
      const dot = (camFwd.x * dxg + camFwd.z * dzg) / len
      if (dot < -0.707) continue // 시야 270도 밖
      if (wallAABBs && wallAABBs.length > 0) {
        const occluded = wallAABBs.some((w) =>
          lineIntersectsAABB(
            camX, camZ, targetWorld.x, targetWorld.z,
            w.minX + WALL_PAD, w.maxX - WALL_PAD,
            w.minZ + WALL_PAD, w.maxZ - WALL_PAD,
          ),
        )
        if (occluded) continue
      }
      target = { gx: cx, gy: cy }
      break
    }
    if (!target) {
      console.warn('[ItaewonLayer] spawn failed — strict 200 attempts', { activeEffect, isFirst, pCellX, pCellY })
      return
    }

    const world = cellToWorld(target.gx, target.gy, cellSize)
    console.log('[ItaewonLayer] ghost spawn', { gx: target.gx, gy: target.gy, world, pCellX, pCellY, isFirst })
    setGhostPos([world.x, 0, world.z])
    prevGhostCellRef.current = target
    isFirstSpawnRef.current = false
    wasInViewRef.current = false
  }, [activeEffect, cellSize, mazeSize, wallAABBs, camera])

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
        }, 3000)
      }
      setTextOpacity(opacity)
    }, 20)
  })

  return (
    <>
      {ghostPos && (
        <SpecialGhostEmployee
          position={ghostPos}
          showText={showText}
          textOpacity={textOpacity}
          cellSize={cellSize}
        />
      )}
    </>
  )
}
