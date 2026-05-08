import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows } from '@react-three/drei'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import { KernelSize } from 'postprocessing'
import * as THREE from 'three'
import { RetroPC } from './RetroPC'

/**
 * CameraRig — animates camera from "inside monitor screen" (t=0) to
 * "product-shot distance" (t=1). Real 3D dolly-out. Parks the CRT fill light
 * at a screen-relative offset each frame.
 */
const CameraRig: React.FC<{
  t: number
  fill: React.RefObject<THREE.PointLight | null>
}> = ({ t, fill }) => {
  const { camera, scene } = useThree()
  const screenCenter = useRef(new THREE.Vector3())
  const ready = useRef(false)

  useEffect(() => {
    const screen = scene.getObjectByName('Screen')
    if (screen) {
      screen.updateWorldMatrix(true, false)
      screen.getWorldPosition(screenCenter.current)
      ready.current = true
    }
  }, [scene])

  useFrame(() => {
    if (!ready.current) {
      const screen = scene.getObjectByName('Screen')
      if (screen) {
        screen.updateWorldMatrix(true, false)
        screen.getWorldPosition(screenCenter.current)
        ready.current = true
      } else {
        return
      }
    }

    const sc = screenCenter.current
    const start = new THREE.Vector3(sc.x, sc.y, sc.z + 0.04)
    const end = new THREE.Vector3(sc.x, sc.y - 0.05, sc.z + 1.9)

    // Phase 1 (t=0→0.5): 정면 dolly-out, lookAt 정면 고정
    // Phase 2 (t=0.5→1): camera 정지, lookAt만 우측으로 이동 → 컴퓨터가 화면 좌측으로 흘러감
    const dollyPhase = t < 0.5 ? t * 2 : 1
    const sidePhase = t < 0.5 ? 0 : (t - 0.5) * 2

    const targetStart = sc
    const targetEnd = new THREE.Vector3(sc.x + 0.55, sc.y, sc.z)

    camera.position.lerpVectors(start, end, dollyPhase)
    const look = new THREE.Vector3().lerpVectors(targetStart, targetEnd, sidePhase)
    camera.lookAt(look)

    // CRT fill light, parked relative to the screen (offset -0.27, +0.4, +0.6)
    if (fill.current) fill.current.position.set(sc.x - 0.27, sc.y + 0.4, sc.z + 0.6)
  })
  return null
}

type Props = {
  /** 0 = inside screen (fullscreen blog), 1 = product shot */
  t: number
  /** html2canvas dataURL of the blog snapshot */
  snapshot: string | null
  /** Opacity of the entire scene (fade in/out control) */
  opacity?: number
}

/**
 * Full 3D scene for CH.5 Scene 5-4 dolly-out ending.
 */
export const RetroPCScene: React.FC<Props> = ({ t, snapshot, opacity = 1 }) => {
  const crtFill = useRef<THREE.PointLight | null>(null)
  return (
    <div style={{
      position: 'fixed', inset: 0,
      pointerEvents: 'none',
      opacity,
      transition: 'opacity 0.4s ease',
      zIndex: 2,
    }}>
      <Canvas
        flat
        shadows
        camera={{ fov: 35, near: 0.001, far: 10 }}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={['#0a0a0c']} />
        {/* 네온 컬러 라이팅 해제 — 중성/warm-white 키 + 약한 fill */}
        <ambientLight intensity={0.55} color="#ffffff" />
        <directionalLight
          castShadow
          position={[-10, 2.6, 3]}
          intensity={1.1}
          color="#fffaf0"
          shadow-mapSize={[2048, 2048]}
          shadow-bias={-0.0005}
          shadow-camera-near={0.1}
          shadow-camera-far={20}
          shadow-camera-left={-1.5}
          shadow-camera-right={1.5}
          shadow-camera-top={1.5}
          shadow-camera-bottom={-1.5}
        />
        <directionalLight position={[-0.5, 4.4, 10]} intensity={0.45} color="#ffe8c8" />
        <pointLight
          ref={crtFill}
          intensity={0.5}
          distance={0.9}
          decay={0.8}
          color="#fff5e0"
        />
        <RetroPC screenDataUrl={snapshot} />
        <ContactShadows
          position={[0, -0.02, 0]}
          opacity={0.4}
          scale={3}
          blur={2.5}
          far={1}
          frames={1}
          color="#ffffff"
        />
        <CameraRig t={t} fill={crtFill} />
        <EffectComposer>
          <Bloom
            intensity={1.2}
            luminanceThreshold={0.6}
            luminanceSmoothing={0.4}
            kernelSize={KernelSize.LARGE}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  )
}
