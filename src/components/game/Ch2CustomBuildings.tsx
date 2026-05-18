/**
 * CH.2 맞춤 건물/사인 — 절차 생성 BG/FAR 빌딩과 별개로 손배치되는 메시.
 *
 *  - 독립 랜드마크/건물 단일 plane (787 벌꿀 / 1777 사랑으로808)
 *  (814는 Ch2Scene에서 실제 WALL 코너 빌딩 면에 직접 매핑)
 *
 * pos는 base 좌표(SCALE 적용 전), y/크기는 월드 m. 클릭 시 콘솔 로그.
 */
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { useMemo } from 'react'
import { SCALE_X, SCALE_Z } from '@/scenes/ch2Layout'

const BASE = import.meta.env.BASE_URL
const TEX = `${BASE}assets/tex`

// ---------- 독립 랜드마크/건물 — 시드 풀 밖, 단일 plane (원비율·지면 고정) ----------
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

// (building-814는 Ch2Scene에서 실제 WALL 코너 빌딩 면에 직접 매핑 — 별도 평면 제거)

export const Ch2CustomBuildings: React.FC = () => (
  <group name="custom-buildings">
    {LANDMARKS.map((m) => <LandmarkMesh key={m.id} m={m} />)}
  </group>
)
