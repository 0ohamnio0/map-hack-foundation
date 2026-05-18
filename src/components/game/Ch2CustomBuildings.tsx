/**
 * CH.2 맞춤 건물/사인 — 절차 생성 BG/FAR 빌딩과 별개로 손배치되는 메시.
 *
 *  1) 코너 건물 — building-814를 정면+우측 면에만 도포, 무왜곡 높이
 *  2) 중간높이 건물 + 상단 코너 래핑 간판 (IMG_0818, 직각 2면)
 *  3) 독립 랜드마크 빌딩 (building-787 벌꿀 / 1777 사랑으로 808) — 단일 plane
 *
 * pos는 base 좌표(SCALE 적용 전), y/크기는 월드 m. 클릭 시 콘솔 로그.
 */
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { useMemo } from 'react'
import { SCALE_X, SCALE_Z } from '@/scenes/ch2Layout'

const BASE = import.meta.env.BASE_URL
const TEX = `${BASE}assets/tex`

function useCutoutMat(url: string): THREE.MeshStandardMaterial {
  const tex = useLoader(THREE.TextureLoader, url)
  return useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.5,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    })
  }, [tex])
}

// ---------- 1) 코너 건물 — building-814 정면+우측 ----------

// boxGeometry material 슬롯: 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z
const CORNER_B = {
  pos: [29, -64] as [number, number], // H2 턴(V2→서) 골목 꺾이는 곳, 동측 도로 밖
  w: 21, h: 21, d: 21,                 // 1.5배 (14→21), building-814 ≈정사각 무왜곡
  rotY: 0,
}

const CornerBuilding: React.FC = () => {
  const tex = useLoader(THREE.TextureLoader, `${TEX}/building/building-814.webp`)
  const mats = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    const face = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.9,
      metalness: 0.0,
      transparent: true,
      alphaTest: 0.1,   // lossy webp 알파 열화로 0.5는 빌딩까지 과키잉 → 0.1
      side: THREE.DoubleSide,
    })
    const dark = new THREE.MeshStandardMaterial({ color: '#262626', roughness: 0.95 })
    // 정면 = 도로쪽 -X(슬롯1), 우측 = 진입쪽 +Z(슬롯4)
    return [dark, face, dark, dark, face, dark]
  }, [tex])
  return (
    <mesh
      position={[CORNER_B.pos[0] * SCALE_X, CORNER_B.h / 2, CORNER_B.pos[1] * SCALE_Z]}
      rotation={[0, CORNER_B.rotY, 0]}
      onPointerDown={(e) => { e.stopPropagation(); console.log(`[Custom] corner-814 pos=[${CORNER_B.pos}] w/h/d=${CORNER_B.w}/${CORNER_B.h}/${CORNER_B.d}`) }}
    >
      <boxGeometry args={[CORNER_B.w, CORNER_B.h, CORNER_B.d]} />
      {mats.map((m, i) => <primitive key={i} object={m} attach={`material-${i}`} />)}
    </mesh>
  )
}

// ---------- 2) 중간높이 건물 + 상단 코너 래핑 간판 ----------

const MID_B = {
  pos: [-10, -20] as [number, number], // V1 서측 벽 너머
  w: 10, h: 16, d: 10,                 // 중간높이
}
const SIGN_W = 5
// 코너 2면 분리 이미지 — A: +X면(레이어3 777x1111), B: +Z면(레이어2 738x1127)
const SIGN_ASPECT_A = 1111 / 777
const SIGN_ASPECT_B = 1127 / 738
const SIGN_Y = MID_B.h - 3            // 상단 근처

const CornerSignBuilding: React.FC = () => {
  const matA = useCutoutMat(`${TEX}/signs/IMG_0818_a.webp`)
  const matB = useCutoutMat(`${TEX}/signs/IMG_0818_b.webp`)
  const signHA = SIGN_W * SIGN_ASPECT_A
  const signHB = SIGN_W * SIGN_ASPECT_B
  const bx = MID_B.pos[0] * SCALE_X
  const bz = MID_B.pos[1] * SCALE_Z
  const hx = MID_B.w / 2
  const hz = MID_B.d / 2
  return (
    <group
      onPointerDown={(e) => { e.stopPropagation(); console.log(`[Custom] mid+sign pos=[${MID_B.pos}] h=${MID_B.h}`) }}
    >
      {/* 중간높이 건물 */}
      <mesh position={[bx, MID_B.h / 2, bz]}>
        <boxGeometry args={[MID_B.w, MID_B.h, MID_B.d]} />
        <meshStandardMaterial color="#33312e" roughness={0.95} />
      </mesh>
      {/* 간판 A — +X면 (면에서 0.06 띄움) */}
      <mesh position={[bx + hx + 0.06, SIGN_Y, bz + hz - SIGN_W / 2]} rotation={[0, Math.PI / 2, 0]} material={matA}>
        <planeGeometry args={[SIGN_W, signHA]} />
      </mesh>
      {/* 간판 B — +Z면 */}
      <mesh position={[bx + hx - SIGN_W / 2, SIGN_Y, bz + hz + 0.06]} rotation={[0, 0, 0]} material={matB}>
        <planeGeometry args={[SIGN_W, signHB]} />
      </mesh>
    </group>
  )
}

// ---------- 3) 독립 랜드마크 빌딩 — 시드 풀 밖, fog 가시 범위 내 단일 plane ----------
// (이전 원경 SkyCutout은 fog로 안 보여 폐기 → 잘 보이는 독립 빌딩으로 전환)

interface Landmark {
  id: string
  url: string
  pos: [number, number]   // base [x, z]
  h: number               // 높이(m) — 폭은 aspect로 산출
  aspect: number          // 원본 w / h  (planeW = h * aspect)
  rotY: number            // 도로/플레이어 향
}

const LANDMARKS: Landmark[] = [
  // 벌꿀 빌딩 building-787 (878x1500) — H1→V2 코너 동측, -X 향
  { id: 'bee-787', url: `${TEX}/building/building-787.webp`, pos: [32, -40], h: 28, aspect: 878 / 1500, rotY: -Math.PI / 2 },
  // 사랑으로 808 1777194386697 (645x741) — 서측 원경 backdrop, +X 향
  { id: 'sarang-1777', url: `${TEX}/signs/1777194386697_rtnqj03wua.webp`, pos: [-26, -52], h: 30, aspect: 645 / 741, rotY: Math.PI / 2 },
]

const LandmarkMesh: React.FC<{ m: Landmark }> = ({ m }) => {
  const tex = useLoader(THREE.TextureLoader, m.url)
  const mat = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.92,
      metalness: 0.0,
      transparent: true,
      alphaTest: 0.1,   // lossy webp 알파 안전
      side: THREE.DoubleSide,
    })
  }, [tex])
  const w = m.h * m.aspect
  return (
    <mesh
      position={[m.pos[0] * SCALE_X, m.h / 2, m.pos[1] * SCALE_Z]}
      rotation={[0, m.rotY, 0]}
      material={mat}
      onPointerDown={(e) => { e.stopPropagation(); console.log(`[Custom] ${m.id} pos=[${m.pos}] w/h=${w.toFixed(1)}/${m.h}`) }}
    >
      <planeGeometry args={[w, m.h]} />
    </mesh>
  )
}

export const Ch2CustomBuildings: React.FC = () => (
  <group name="custom-buildings">
    <CornerBuilding />
    <CornerSignBuilding />
    {LANDMARKS.map((m) => <LandmarkMesh key={m.id} m={m} />)}
  </group>
)
