/**
 * CH.2 AI Hub 71559 도로교통 시설 모델.
 *
 * 소스: OBJ + JPG (public/assets/3d/aihub/) + 표지판 텍스처 풀 (aihub_pool/).
 *
 * pole=true 표지판은 directionScore(좌우 이동 누적) 변화 시에만 텍스처가 풀에서
 * 셔플됨 — Signpost의 텍스트 글리치를 도로 표지판 모양으로 옮긴 매체 변주.
 * 모양 매칭: 표지판/이정표/전광표지 세 그룹은 같은 그룹 안에서만 swap.
 */
import { useLoader, useFrame } from '@react-three/fiber'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import * as THREE from 'three'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SCALE_X, SCALE_Z } from '@/scenes/ch2Layout'

const BASE = import.meta.env.BASE_URL
const AIHUB = `${BASE}assets/3d/aihub`
// 모양별 풀 — OpenCV 자동 크롭 PNG(알파 마스크 포함). 이정표·전광표지는 후속 단계.
const CIRCLE_POOL_BASE = `${BASE}assets/3d/aihub_circle_pool`
const SQUARE_POOL_BASE = `${BASE}assets/3d/aihub_square_pool`
const TRIANGLE_POOL_BASE = `${BASE}assets/3d/aihub_triangle_pool`

type PoolKey = 'circle' | 'triangle' | 'square' | 'direction' | 'banner'

interface AihubPlacement {
  id: string
  pos: [number, number]
  y?: number
  scale?: number
  rotY?: number
  rotX?: number       // 디버그 — X축 회전(누워보이기)
  pole?: boolean
  poolKey?: PoolKey
}

const POLE_HEIGHT = 3.75
const POLE_RADIUS = 0.04

// S자 길 5구간 — V1(x∈[-7,7], z=3→-40) / H1(z=-30~-40) / V2(x∈[13,27], z=-40→-60) /
//                H2(z=-60~-70) / V3(x∈[-7,7], z=-70→-90). 가장자리(±6, 14~26)에 배치.
const PLACEMENTS: AihubPlacement[] = [
  // 표지판 5종 — 모양별 풀로 분류 (square 5장 / triangle 5장 / circle 8장)
  { id: 'RTA0201220727_0040L_02_normalization', pos: [6,  -8],  rotY: -Math.PI * 0.5, pole: true, poolKey: 'square'   },  // V1 시작 우측
  { id: 'RTA0201220726_0076L_02_normalization', pos: [-6, -20], rotY: Math.PI * 0.5,  pole: true, poolKey: 'triangle' },  // V1 중간 좌측
  { id: 'RTA0201220727_0042L_02_normalization', pos: [6,  -32], rotY: -Math.PI * 0.5, pole: true, poolKey: 'square'   },  // V1 끝 / H1 진입
  { id: 'RTA1001220804_0175L_02_normalization', pos: [16, -45], rotY: -Math.PI * 0.5, pole: true, poolKey: 'circle'   },  // V2 진입 좌측
  { id: 'RTA0801220812_0154L_02_normalization', pos: [22, -65], rotY: Math.PI,        pole: true, poolKey: 'square'   },  // V2→H2 코너
  // 전주
  { id: 'RTF3601220720_0428L_01_normalization', pos: [-6, -75], rotY: 0, scale: 22 },  // V3 좌측 — 거대 전주 (25 → 22, 1/8 감소)
  // CCTV — 별도 PoleCCTV 컴포넌트로 거대 전주 상단에 mount (캐릭터 추적 yaw 회전)
  // 우체통 / 공중전화부스
  { id: 'RTF4201220801_0182L_01_normalization', pos: [5,  -85], rotY: Math.PI * 0.5 },   // V3 우측 후반
  // 벤치 / 쓰레기통
  { id: 'RTE3201220730_0254L_01_normalization', pos: [-6, -38], rotY: 0.3 },       // V1 끝 좌측
  { id: 'RTE3001220729_0198L_01_normalization', pos: [14, -58], rotY: -0.3 },      // V2 좌측 끝
  // 도로화분
  { id: 'RTE2901220812_0325L_01_normalization', pos: [20, -67], rotY: 0 },         // H2 우측 — hell-salad 노트가 화분 안에 담김
  // 방호울타리
  { id: 'RTB1601220720_0435L_01_normalization', pos: [-6, -68], rotY: Math.PI * 0.5 },  // H2 좌측
  // 도로반사경
  { id: 'RTB1201220926_0336L_02_normalization', pos: [27, -42], y: 3, rotY: -Math.PI * 0.4 },  // V2 우측 진입 — 도로 거울(건물쪽 + 3m 상승)
]

// ---------- 텍스처 풀 (swap용) ----------

interface PoolEntry { id: string; tex: string }

interface Pool {
  textures: THREE.Texture[]
  entries: PoolEntry[]
}

type PoolMap = Partial<Record<PoolKey, Pool>>

function useTexturePools(): PoolMap {
  const [pools, setPools] = useState<PoolMap>({})
  useEffect(() => {
    let cancelled = false
    // circle/square/triangle 3풀 — 이정표·전광표지는 후속 단계.
    const sources: Array<{ key: PoolKey; base: string; ext: string }> = [
      { key: 'circle',   base: CIRCLE_POOL_BASE,   ext: 'webp' },
      { key: 'square',   base: SQUARE_POOL_BASE,   ext: 'webp' },
      { key: 'triangle', base: TRIANGLE_POOL_BASE, ext: 'webp' },
    ]
    Promise.all(sources.map(({ key, base, ext }) =>
      fetch(`${base}/manifest.json`)
        .then(r => r.json())
        .then((entries: PoolEntry[]) => {
          const loader = new THREE.TextureLoader()
          return Promise.all(entries.map(e => loader.loadAsync(`${base}/${e.id}.${ext}`)))
            .then(textures => {
              textures.forEach(t => { t.colorSpace = THREE.SRGBColorSpace })
              return [key, { entries, textures }] as const
            })
        })
        .catch(err => { console.warn(`[Pool ${key}] failed`, err); return [key, null] as const })
    )).then(results => {
      if (cancelled) return
      const merged: PoolMap = {}
      for (const [key, pool] of results) if (pool) merged[key] = pool
      setPools(merged)
    })
    return () => { cancelled = true }
  }, [])
  return pools
}

// ---------- Prop ----------

interface AihubPropProps {
  p: AihubPlacement
  index: number
  pools: PoolMap
}

const AihubProp: React.FC<AihubPropProps> = ({ p, index, pools }) => {
  const obj = useLoader(OBJLoader, `${AIHUB}/${p.id}.obj`)
  const baseTex = useLoader(THREE.TextureLoader, `${AIHUB}/${p.id}.webp`)

  const myPool = p.poolKey ? pools[p.poolKey] : undefined

  const { cloned, groundOffset } = useMemo(() => {
    baseTex.colorSpace = THREE.SRGBColorSpace
    const objMat = new THREE.MeshStandardMaterial({ map: baseTex, roughness: 0.85, metalness: 0.05 })
    const c = obj.clone(true)
    c.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && m.geometry) {
        m.geometry = m.geometry.clone()
        m.geometry.rotateX(-Math.PI / 2)
        m.material = objMat
        m.castShadow = true
        m.receiveShadow = true
      }
    })
    const box = new THREE.Box3().setFromObject(c)
    return { cloned: c, groundOffset: -box.min.y }
  }, [obj, baseTex])

  const meshRef = useRef<THREE.Mesh>(null)

  // 카메라 이동 거리 누적 기준 — 정지 시 정지, 움직이면 (방향 무관) swap.
  const camLastPos = useRef<THREE.Vector3 | null>(null)
  const traveled = useRef(0)
  const swapStep = useRef(0)
  const lastSwapTime = useRef(-1)
  const TRAVEL_PER_SWAP = 1.5  // m

  useFrame(({ camera, clock }) => {
    if (!p.pole || !p.poolKey || !myPool || myPool.textures.length === 0) return
    if (camLastPos.current) {
      const dx = camera.position.x - camLastPos.current.x
      const dz = camera.position.z - camLastPos.current.z
      traveled.current += Math.sqrt(dx * dx + dz * dz)
    }
    camLastPos.current = camLastPos.current ?? new THREE.Vector3()
    camLastPos.current.copy(camera.position)
    if (traveled.current < TRAVEL_PER_SWAP) return
    traveled.current -= TRAVEL_PER_SWAP
    swapStep.current += 1
    const idx = (swapStep.current * 11 + index * 3) % myPool.textures.length
    const mesh = meshRef.current
    if (mesh) {
      const oldMat = mesh.material as THREE.MeshStandardMaterial
      const newMat = new THREE.MeshStandardMaterial({
        map: myPool.textures[idx],
        transparent: true,
        alphaTest: 0.1,
        roughness: 0.85,
        metalness: 0.05,
        side: THREE.DoubleSide,
      })
      mesh.material = newMat
      if (Array.isArray(oldMat)) oldMat.forEach(m => m.dispose())
      else oldMat.dispose()
    }
    lastSwapTime.current = clock.elapsedTime
  })

  const scale = p.scale ?? 2.5
  const x = p.pos[0] * SCALE_X
  const z = p.pos[1] * SCALE_Z
  // poolKey 케이스(표지판 plane만)에선 OBJ를 안 그리므로 groundOffset 보정 무관.
  // 보정을 살리면 plane이 pole top 위로 떠올라 분리됨.
  const baseY = p.poolKey ? (p.y ?? 0) : (p.y ?? 0) + groundOffset * scale
  const modelY = p.pole ? POLE_HEIGHT + baseY : baseY

  return (
    <group
      position={[x, 0, z]}
      rotation={[p.rotX ?? 0, p.rotY ?? 0, 0]}
      onPointerDown={(e) => {
        e.stopPropagation()
        console.log(
          `[Aihub] #${index}  id=${p.id}  pos=[${p.pos[0]}, ${p.pos[1]}]  poolKey=${p.poolKey ?? '-'}  pole=${!!p.pole}`,
        )
      }}
    >
      {p.pole && (
        <mesh position={[0, POLE_HEIGHT / 2, 0]} castShadow>
          <cylinderGeometry args={[POLE_RADIUS, POLE_RADIUS, POLE_HEIGHT, 12]} />
          <meshStandardMaterial color="#3a3a3a" metalness={0.05} roughness={0.85} />
        </mesh>
      )}
      {p.poolKey ? (
        <mesh ref={meshRef} position={[0, modelY + 0.8, 0]}>
          <planeGeometry args={[1.8, 1.8]} />
          <meshStandardMaterial
            map={myPool && myPool.textures.length > 0 ? myPool.textures[0] : baseTex}
            transparent
            alphaTest={0.1}
            roughness={0.85}
            metalness={0.05}
            side={THREE.DoubleSide}
          />
        </mesh>
      ) : (
        <group position={[0, modelY, 0]} scale={scale}>
          <primitive object={cloned} />
        </group>
      )}
    </group>
  )
}

// 거대 전주 [-6, -75] scale=25 상단 사이드에 CCTV mount. 캐릭터(=카메라) 추적 yaw 회전.
const POLE_CCTV_ID = 'RTF3301220722_0012L_02_normalization'
const POLE_CCTV_POS: [number, number, number] = [-6 * SCALE_X + 0.8, 18, -75 * SCALE_Z]

const PoleCCTV: React.FC = () => {
  const obj = useLoader(OBJLoader, `${AIHUB}/${POLE_CCTV_ID}.obj`)
  const baseTex = useLoader(THREE.TextureLoader, `${AIHUB}/${POLE_CCTV_ID}.webp`)
  const groupRef = useRef<THREE.Group>(null)

  const cloned = useMemo(() => {
    baseTex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.MeshStandardMaterial({ map: baseTex, roughness: 0.85, metalness: 0.05 })
    const c = obj.clone(true)
    c.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh && m.geometry) {
        m.geometry = m.geometry.clone()
        m.geometry.rotateX(-Math.PI / 2)
        m.material = mat
      }
    })
    return c
  }, [obj, baseTex])

  useFrame(({ camera }) => {
    const g = groupRef.current
    if (!g) return
    const dx = camera.position.x - g.position.x
    const dz = camera.position.z - g.position.z
    g.rotation.y = Math.atan2(dx, dz)
  })

  return (
    <group ref={groupRef} position={POLE_CCTV_POS} scale={2.5}>
      <primitive object={cloned} />
    </group>
  )
}

export const Ch2AihubProps: React.FC = () => {
  const pools = useTexturePools()
  return (
    <group name="aihub">
      {PLACEMENTS.map((p, i) => (
        <AihubProp key={`${p.id}-${i}`} p={p} index={i} pools={pools} />
      ))}
      <PoleCCTV />
    </group>
  )
}
