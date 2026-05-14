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
  pack6431:     `${BASE}assets/models/pack-6431.glb`,
  pack8b5b:     `${BASE}assets/models/pack-8b5b.glb`,
  pack2:        `${BASE}assets/models/pack2.glb`,
} as const

useGLTF.preload(URL.electricBox)
useGLTF.preload(URL.trashesKorea)
useGLTF.preload(URL.concretePile)
useGLTF.preload(URL.pack6431)
useGLTF.preload(URL.pack8b5b)
useGLTF.preload(URL.pack2)

interface PropDef {
  url: string
  pos: [number, number]   // base [x, z], will be scaled
  y?: number              // height offset
  scale?: number | [number, number, number]
  rotY?: number           // radians
}

// S커브 따라 배치 — z 단조 감소
const PROPS: PropDef[] = [
  // V1
  { url: URL.electricBox,  pos: [-6, -14], y: 0,    scale: 0.012, rotY: Math.PI * 0.5 },
  { url: URL.trashesKorea, pos: [5,  -25], y: 0,    scale: 1.6 },
  // V1 → H1 corner
  { url: URL.concretePile, pos: [-5, -36], y: 0,    scale: 1.4, rotY: 0.6 },
  { url: URL.pack8b5b,     pos: [10, -35], y: 0,    scale: 0.9, rotY: -0.3 },
  // H1 → V2
  { url: URL.pack6431,     pos: [22, -38], y: 0,    scale: 0.7, rotY: 1.2 },
  // V2
  { url: URL.electricBox,  pos: [25, -55], y: 0,    scale: 0.012, rotY: -Math.PI * 0.5 },
  // H2
  { url: URL.trashesKorea, pos: [3,  -65], y: 0,    scale: 1.4, rotY: 1.0 },
  { url: URL.concretePile, pos: [20, -68], y: 0,    scale: 1.2, rotY: -0.5 },
  // V3
  { url: URL.electricBox,  pos: [-5, -78], y: 0,    scale: 0.012, rotY: Math.PI * 0.5 },

  // 항공 뷰(pack2): 거리에서 멀리 띄워 액센트 (지붕이 위에서 보이는 형태) — 톤만 살짝
  { url: URL.pack2, pos: [40, -45], y: 18,  scale: 0.04, rotY: 0 },
]

const Prop: React.FC<{ def: PropDef }> = ({ def }) => {
  const { scene } = useGLTF(def.url)
  // useGLTF는 동일한 scene 인스턴스를 반환하므로 여러 곳에 mount 시 clone 필요.
  const cloned = useMemo(() => {
    const c = scene.clone(true)
    c.traverse(obj => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh
        m.castShadow = true
        m.receiveShadow = true
      }
    })
    return c
  }, [scene])

  const worldPos: [number, number, number] = [
    def.pos[0] * SCALE_X,
    def.y ?? 0,
    def.pos[1] * SCALE_Z,
  ]
  const scale = typeof def.scale === 'number' || def.scale === undefined
    ? def.scale ?? 1
    : def.scale

  return (
    <primitive
      object={cloned}
      position={worldPos}
      rotation={[0, def.rotY ?? 0, 0]}
      scale={scale}
    />
  )
}

export const Ch2Decor: React.FC = () => (
  <group name="decor">
    {PROPS.map((def, i) => <Prop key={i} def={def} />)}
  </group>
)
