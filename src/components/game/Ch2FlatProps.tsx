/**
 * CH.2 평면 PNG 소품 — 표지판(pole) / 현수막(banner) / 포스터(벽면).
 *
 * 간판(Ch2Signs)·교통표지판 풀(Ch2AihubProps)과 달리 자동 배치/셔플 없이
 * 맵 좌표에 고정 배치되는 알파 컷아웃 평면. pos는 base 좌표(SCALE 적용 전).
 */
import { useLoader } from '@react-three/fiber'
import * as THREE from 'three'
import { useMemo } from 'react'
import { SCALE_X, SCALE_Z } from '@/scenes/ch2Layout'

const BASE = import.meta.env.BASE_URL
const PROPS = `${BASE}assets/tex/props`

const POLE_HEIGHT = 3.0
const POLE_RADIUS = 0.04

interface FlatProp {
  id: string
  src: string          // props 디렉터리 파일명 (확장자 포함)
  pos: [number, number] // base 좌표 [x, z]
  w: number            // plane 가로 (m) — 세로는 텍스처 종횡비로 산출
  aspect: number       // 원본 h / w (리사이즈본 기준)
  y: number            // plane 중심 높이 (m)
  rotY: number
  pole?: boolean
}

const FLAT_PROPS: FlatProp[] = [
  // (mirror-0812 = 도로반사경 → Ch2Scene.Ch2RoofMirror로 이관: 제일 낮은 빌딩 윗면)
  // 현수막 — V1 진입부 상공 가로 배너 (IMG_0813 1500x293)
  { id: 'banner-0813', src: 'IMG_0813.webp', pos: [0, -5], w: 6.0, aspect: 293 / 1500, y: 4.5, rotY: 0 },
  // (poster-0822 IMG_0822 → Ch2Scene.PINNED_SIGNS 'img0822'로 이관: building-219 텍스처 건물)
  // 포스터 — 동측 벽 빌딩 박스 도로면(base x=cx=27.15)에 밀착(-0.02 epsilon), -X 향
  { id: 'poster-0823', src: 'IMG_0823.webp', pos: [27.13, -50], w: 2.4, aspect: 1500 / 1200, y: 2.2, rotY: -Math.PI * 0.5 },
  // 개 출입금지 — V1 동측 벽(cx=7.15) ~5채째, 눈높이(y1.5), 작은 포스터, -X 향
  { id: 'nodog', src: 'nodog.webp', pos: [7.10, -20], w: 0.7, aspect: 612 / 612, y: 1.5, rotY: -Math.PI * 0.5 },
  // (signboard-stack → Ch2Scene.Ch2StackSign으로 이관: TTZZ 건물 좌측면 부착)
]

const FlatPropMesh: React.FC<{ p: FlatProp }> = ({ p }) => {
  const tex = useLoader(THREE.TextureLoader, `${PROPS}/${p.src}`)

  const material = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace
    tex.anisotropy = 8
    return new THREE.MeshStandardMaterial({
      map: tex,
      transparent: true,
      alphaTest: 0.1,
      roughness: 0.85,
      metalness: 0.05,
      side: THREE.DoubleSide,
    })
  }, [tex])

  const h = p.w * p.aspect
  const x = p.pos[0] * SCALE_X
  const z = p.pos[1] * SCALE_Z

  return (
    <group
      position={[x, 0, z]}
      rotation={[0, p.rotY, 0]}
    >
      {p.pole && (
        <mesh position={[0, p.y / 2, 0]} castShadow>
          <cylinderGeometry args={[POLE_RADIUS, POLE_RADIUS, p.y, 12]} />
          <meshStandardMaterial color="#3a3a3a" metalness={0.05} roughness={0.85} />
        </mesh>
      )}
      <mesh position={[0, p.y, 0]} material={material} castShadow>
        <planeGeometry args={[p.w, h]} />
      </mesh>
    </group>
  )
}

export const Ch2FlatProps: React.FC = () => (
  <group name="flat-props">
    {FLAT_PROPS.map((p) => (
      <FlatPropMesh key={p.id} p={p} />
    ))}
  </group>
)
