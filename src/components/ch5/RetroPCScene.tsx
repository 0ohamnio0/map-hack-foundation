import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import { BloomEffect, KernelSize } from 'postprocessing'
import * as THREE from 'three'
import { RetroPC } from './RetroPC'
import { DEFAULT_TUNING, type RetroPCTuning } from './retroPCTuning'
import { useDevMode } from '../../hooks/useDevMode'

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
  const [tuning, setTuning] = useState<RetroPCTuning>(DEFAULT_TUNING)
  const devMode = useDevMode()

  // Build the BloomEffect ourselves so we can mutate intensity directly.
  // @react-three/postprocessing's <Bloom ref=...> blows up (KawaseBlurPass.resolution
  // is a circular structure that React tries to JSON.stringify) — use primitive attach.
  const bloomEffect = useMemo(
    () =>
      new BloomEffect({
        intensity: DEFAULT_TUNING.screenGlow,
        luminanceThreshold: 0.35,
        luminanceSmoothing: 0.4,
        kernelSize: KernelSize.LARGE,
        mipmapBlur: true,
      }),
    [],
  )

  useEffect(() => {
    bloomEffect.intensity = tuning.screenGlow
  }, [tuning.screenGlow, bloomEffect])

  return (
    <div style={{
      position: 'fixed', inset: 0,
      pointerEvents: 'none',
      opacity,
      transition: 'opacity 0.4s ease',
      zIndex: 2,
      background: '#000000',
    }}>
      <Canvas
        flat
        camera={{ fov: 35, near: 0.001, far: 10 }}
        gl={{ antialias: true, alpha: true }}
      >
        {/* PC body는 자체 셰이더라 standard light 무시. 라이팅은 future use용 최소 유지 */}
        <ambientLight intensity={0.95} color="#ffffff" />
        <pointLight
          ref={crtFill}
          intensity={0.25}
          distance={0.9}
          decay={0.8}
          color="#fff5e0"
        />

        <RetroPC screenDataUrl={snapshot} tuning={tuning} />
        <CameraRig t={t} fill={crtFill} />
        <EffectComposer>
          <primitive object={bloomEffect} dispose={null} />
        </EffectComposer>
      </Canvas>
      {devMode && <TuningPanel tuning={tuning} setTuning={setTuning} />}
    </div>
  )
}

const SLIDERS: Array<{ key: keyof RetroPCTuning; min: number; max: number; step: number }> = [
  { key: 'gradientTop',    min: 0.5, max: 2.0, step: 0.01 },
  { key: 'gradientBottom', min: 0.0, max: 1.5, step: 0.01 },
  { key: 'lightAmbient',   min: 0.0, max: 1.5, step: 0.01 },
  { key: 'lightIntensity', min: 0.0, max: 1.5, step: 0.01 },
  { key: 'lightDirX',      min: -1,  max: 1,   step: 0.01 },
  { key: 'lightDirY',      min: -1,  max: 1,   step: 0.01 },
  { key: 'lightDirZ',      min: -1,  max: 1,   step: 0.01 },
  { key: 'saturation',     min: 0,   max: 1.5, step: 0.01 },
  { key: 'screenGlow',     min: 0,   max: 2.5, step: 0.01 },
]

const TuningPanel: React.FC<{
  tuning: RetroPCTuning
  setTuning: React.Dispatch<React.SetStateAction<RetroPCTuning>>
}> = ({ tuning, setTuning }) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        width: 280,
        padding: 14,
        background: 'rgba(20, 16, 40, 0.86)',
        color: '#e8e0ff',
        font: '11px ui-monospace, monospace',
        borderRadius: 6,
        pointerEvents: 'auto',
        zIndex: 10,
        backdropFilter: 'blur(6px)',
      }}
    >
      <div style={{ marginBottom: 8, opacity: 0.7, letterSpacing: 1 }}>RETRO-PC · P to toggle</div>
      {SLIDERS.map(({ key, min, max, step }) => (
        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ flex: '0 0 110px' }}>{key}</span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={tuning[key]}
            onChange={(e) => {
              const v = parseFloat(e.target.value)
              setTuning((prev) => ({ ...prev, [key]: v }))
            }}
            style={{ flex: 1 }}
          />
          <span style={{ flex: '0 0 44px', textAlign: 'right' }}>{tuning[key].toFixed(2)}</span>
        </label>
      ))}
      <button
        onClick={() => setTuning(DEFAULT_TUNING)}
        style={{
          marginTop: 8,
          width: '100%',
          padding: '6px 8px',
          background: 'rgba(255,255,255,0.08)',
          color: '#e8e0ff',
          border: '1px solid rgba(255,255,255,0.18)',
          borderRadius: 4,
          cursor: 'pointer',
          font: 'inherit',
        }}
      >
        Reset
      </button>
      <pre style={{ marginTop: 8, padding: 6, background: 'rgba(0,0,0,0.35)', borderRadius: 4, fontSize: 10, overflow: 'auto' }}>
{JSON.stringify(tuning, null, 2)}
      </pre>
    </div>
  )
}
