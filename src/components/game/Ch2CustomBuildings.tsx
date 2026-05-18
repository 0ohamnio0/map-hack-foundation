/**
 * CH.2 맞춤 건물/사인 — 절차 생성 BG/FAR 빌딩과 별개로 손배치되는 메시.
 *
 *  1) 원경 고층 위쪽 투명 컷아웃 (building-787 / 1777194386697)
 *  2) 코너 건물 — building-814를 정면+우측 면에만 도포, 무왜곡 높이
 *  3) 중간높이 건물 + 상단 코너 래핑 간판 (IMG_0818, 직각 2면)
 *
 * pos는 base 좌표(SCALE 적용 전), y/크기는 월드 m. 클릭 시 콘솔 로그.
 */
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { useMemo } from 'react'
import { SCALE_X, SCALE_Z } from '@/scenes/ch2Layout'
import { FAR_BUILDINGS } from '@/scenes/ch2FarBuildings'

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

// ---------- 1) 원경 고층 위쪽 투명 컷아웃 — FAR_BUILDINGS 정렬 ----------

// FAR_BUILDINGS flat 순서: 동E 0~4 / 서W 5~8 / 북N 9~12 / 남S 13~17
interface SkyCutout {
  id: string
  url: string
  farIndex: number          // 부착할 FAR 빌딩 (단일 출처: ch2FarBuildings.FAR_BUILDINGS)
  face: '+Z' | '-X'         // 도로/플레이어를 향하는 면
  aspect: number            // 원본 h / w
  widthFrac: number         // 빌딩 폭 대비 plane 가로 비율
  topMargin: number         // 빌딩 꼭대기에서 plane 상단까지 여백 (m)
}

const SKY_CUTOUTS: SkyCutout[] = [
  // building-787 (878x1500) — 남S i=4 (idx17), 진입 플레이어 정면(+Z)
  { id: 'sky-787', url: `${TEX}/building/building-787.webp`, farIndex: 17, face: '+Z', aspect: 1500 / 878, widthFrac: 0.92, topMargin: 4 },
  // 1777194386697 (645x741) — 동E i=2 (idx2), 도로쪽(-X)
  { id: 'sky-1777', url: `${TEX}/signs/1777194386697_rtnqj03wua.webp`, farIndex: 2, face: '-X', aspect: 741 / 645, widthFrac: 0.92, topMargin: 4 },
]

const SkyCutoutMesh: React.FC<{ c: SkyCutout }> = ({ c }) => {
  const mat = useCutoutMat(c.url)
  const b = FAR_BUILDINGS[c.farIndex]
  if (!b) return null
  // b.x/b.z = world(SCALE 적용 완료), y∈[0, b.h]
  const planeW = b.w * c.widthFrac
  const planeH = planeW * c.aspect
  const centerY = b.h - c.topMargin - planeH / 2
  const pos: [number, number, number] = c.face === '+Z'
    ? [b.x, centerY, b.z + b.d / 2 + 0.15]
    : [b.x - b.w / 2 - 0.15, centerY, b.z]
  const rotY = c.face === '+Z' ? 0 : -Math.PI / 2
  return (
    <mesh
      position={pos}
      rotation={[0, rotY, 0]}
      material={mat}
      onPointerDown={(e) => { e.stopPropagation(); console.log(`[Custom] ${c.id} farIdx=${c.farIndex} face=${c.face} bH=${b.h.toFixed(1)} planeW=${planeW.toFixed(1)} y=${centerY.toFixed(1)}`) }}
    >
      <planeGeometry args={[planeW, planeH]} />
    </mesh>
  )
}

// ---------- 2) 코너 건물 — building-814 정면+우측 ----------

// boxGeometry material 슬롯: 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z
const CORNER_B = {
  pos: [29, -36] as [number, number], // 동쪽 도로 가장자리(x=27) 바깥, H1/V2 코너
  w: 14, h: 14, d: 14,                 // building-814 ≈정사각(1500x1498) → 무왜곡 큐브
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
      alphaTest: 0.5,
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

// ---------- 3) 중간높이 건물 + 상단 코너 래핑 간판 ----------

const MID_B = {
  pos: [-10, -20] as [number, number], // V1 서측 벽 너머
  w: 10, h: 16, d: 10,                 // 중간높이
}
const SIGN_W = 5
const SIGN_ASPECT = 1154 / 1500       // IMG_0818 h/w
const SIGN_Y = MID_B.h - 3            // 상단 근처

const CornerSignBuilding: React.FC = () => {
  const mat = useCutoutMat(`${TEX}/signs/IMG_0818.webp`)
  const signH = SIGN_W * SIGN_ASPECT
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
      {/* 간판 — +X/+Z 코너(도로·플레이어 방향) 직각 2면, 면에서 0.06 띄움 */}
      <mesh position={[bx + hx + 0.06, SIGN_Y, bz + hz - SIGN_W / 2]} rotation={[0, Math.PI / 2, 0]} material={mat}>
        <planeGeometry args={[SIGN_W, signH]} />
      </mesh>
      <mesh position={[bx + hx - SIGN_W / 2, SIGN_Y, bz + hz + 0.06]} rotation={[0, 0, 0]} material={mat}>
        <planeGeometry args={[SIGN_W, signH]} />
      </mesh>
    </group>
  )
}

export const Ch2CustomBuildings: React.FC = () => (
  <group name="custom-buildings">
    {SKY_CUTOUTS.map((c) => <SkyCutoutMesh key={c.id} c={c} />)}
    <CornerBuilding />
    <CornerSignBuilding />
  </group>
)
