/**
 * CH.2 거리 데코 — Sketchfab/photogrammetry 모델 + 한국 거리 소품을 S커브에 분포.
 *
 * 모델은 public/assets/models/*.glb (gltf-transform 파이프라인으로 압축됨).
 * useGLTF는 결과를 캐싱하므로 같은 GLB를 여러 인스턴스로 써도 1회 다운로드.
 */
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { useMemo } from 'react'
import { SCALE_X, SCALE_Z } from '@/scenes/ch2Layout'

const BASE = import.meta.env.BASE_URL

const URL = {
  electricBox:  `${BASE}assets/models/electric-box.glb`,
  trashesKorea: `${BASE}assets/models/trashes-korea.glb`,
  concretePile: `${BASE}assets/models/concrete-pile.glb`,
} as const

useGLTF.preload(URL.electricBox)
useGLTF.preload(URL.trashesKorea)
useGLTF.preload(URL.concretePile)

interface PropDef {
  url: string
  pos: [number, number]   // base [x, z], will be scaled
  y?: number              // height offset (groundFit이면 접지 위 추가 오프셋)
  scale?: number | [number, number, number]
  rotY?: number           // radians
  rotX?: number           // radians (X축 회전 — 눕히기 등)
  groundFit?: boolean     // 바운딩박스 하단을 지면(y=0)에 자동 정렬 (묻힘 방지)
}

// S커브 따라 배치 — z 단조 감소
const PROPS: PropDef[] = [
  // V1
  { url: URL.electricBox,  pos: [-6, -14], y: 0,    scale: 0.012, rotY: Math.PI * 0.5, groundFit: true },
  // V1 → H1 corner
  { url: URL.concretePile, pos: [-5, -36], y: 0,    scale: 1.4, rotY: 0.6, groundFit: true },
  // V2
  { url: URL.electricBox,  pos: [25, -55], y: 0,    scale: 0.012, rotY: -Math.PI * 0.5, groundFit: true },
  // H2 — trashes-korea는 맵 전체 1회만
  { url: URL.trashesKorea, pos: [6,  -70], y: -0.3, scale: 1.4, rotY: 1.0, groundFit: true },
  { url: URL.concretePile, pos: [20, -68], y: 0,    scale: 1.2, rotY: -0.5, groundFit: true },
  // V3
  { url: URL.electricBox,  pos: [-5, -78], y: 0,    scale: 0.012, rotY: Math.PI * 0.5, groundFit: true },
]

const Prop: React.FC<{ def: PropDef }> = ({ def }) => {
  const { scene } = useGLTF(def.url)
  // useGLTF는 동일한 scene 인스턴스를 반환하므로 여러 곳에 mount 시 clone 필요.
  const { cloned, minY } = useMemo(() => {
    const c = scene.clone(true)
    c.traverse(obj => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh
        m.castShadow = true
        m.receiveShadow = true
      }
    })
    // 원본(스케일 전) 바운딩박스 하단 — groundFit 접지용
    const box = new THREE.Box3().setFromObject(c)
    return { cloned: c, minY: box.min.y }
  }, [scene])

  const scale = typeof def.scale === 'number' || def.scale === undefined
    ? def.scale ?? 1
    : def.scale
  // groundFit: 모델 하단을 지면(y=0)에 맞춤 + def.y 추가 오프셋
  const scaleY = typeof scale === 'number' ? scale : scale[1]
  const groundOffset = def.groundFit ? -minY * scaleY : 0
  const worldPos: [number, number, number] = [
    def.pos[0] * SCALE_X,
    (def.y ?? 0) + groundOffset,
    def.pos[1] * SCALE_Z,
  ]

  return (
    <primitive
      object={cloned}
      position={worldPos}
      rotation={[def.rotX ?? 0, def.rotY ?? 0, 0]}
      scale={scale}
    />
  )
}

export const Ch2Decor: React.FC = () => (
  <group name="decor">
    {PROPS.map((def, i) => <Prop key={i} def={def} />)}
  </group>
)
