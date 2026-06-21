import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { EffectComposer } from '@react-three/postprocessing'
import { BloomEffect, KernelSize } from 'postprocessing'
import * as THREE from 'three'
import { RetroPC } from './RetroPC'
import { DEFAULT_TUNING, SHUTDOWN_TUNING, type RetroPCTuning } from './retroPCTuning'
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
  /** 셧다운 상태 — SHUTDOWN_TUNING으로 전환 (dev 패널은 활성 튜닝을 편집) */
  shutdownActive?: boolean
  /** 크레딧 사이드 어둡게 vignette 표시 (ending 상태에서만) */
  vignetteEnabled?: boolean
  /** 셧다운 상태에서 본체 클릭 = 전원 끄기 콜백 */
  onPowerOff?: () => void
  /** 전원 off — 모니터 스크린 셰이더·이미지 완전 off (룸·본체는 유지) */
  screenOff?: boolean
}

/**
 * Full 3D scene for CH.5 Scene 5-4 dolly-out ending.
 */
export const RetroPCScene: React.FC<Props> = ({ t, snapshot, opacity = 1, shutdownActive = false, vignetteEnabled = false, onPowerOff, screenOff = false }) => {
  const crtFill = useRef<THREE.PointLight | null>(null)
  const [normalTuning, setNormalTuning] = useState<RetroPCTuning>(DEFAULT_TUNING)
  const [shutdownTuning, setShutdownTuning] = useState<RetroPCTuning>(SHUTDOWN_TUNING)
  const tuning = shutdownActive ? shutdownTuning : normalTuning
  const setTuning = shutdownActive ? setShutdownTuning : setNormalTuning
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
      pointerEvents: (shutdownActive && onPowerOff) ? 'auto' : 'none',
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

        {/* 어슴푸레한 3D 방 — 바닥/벽 살짝 다른 명도로 분리감 (MeshBasic, tone map off) */}
        <mesh position={[0, tuning.floorY, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[8, 8]} />
          <meshBasicMaterial color="#0c0c0c" toneMapped={false} />
        </mesh>
        <mesh position={[0, tuning.wallY, tuning.wallZ]}>
          <planeGeometry args={[8, 4]} />
          <meshBasicMaterial color="#060606" toneMapped={false} />
        </mesh>

        <RetroPC screenDataUrl={snapshot} tuning={tuning} onPowerOff={shutdownActive ? onPowerOff : undefined} screenOff={screenOff} />
        <CameraRig t={t} fill={crtFill} />
        <EffectComposer>
          <primitive object={bloomEffect} dispose={null} />
        </EffectComposer>
      </Canvas>
      {vignetteEnabled && (
        <div
          style={{
            position: 'absolute', inset: 0,
            background: `radial-gradient(ellipse ${tuning.vignetteW}% ${tuning.vignetteH}% at ${tuning.vignetteCx}% 55%, transparent ${tuning.vignetteInner}%, rgba(0,0,0,${tuning.vignetteAlpha}) 90%)`,
            pointerEvents: 'none',
          }}
        />
      )}
      {devMode && (
        <TuningPanel
          tuning={tuning}
          setTuning={setTuning}
          activeLabel={shutdownActive ? 'SHUTDOWN' : 'NORMAL'}
          resetTo={shutdownActive ? SHUTDOWN_TUNING : DEFAULT_TUNING}
        />
      )}
    </div>
  )
}

type SliderDef = { key: keyof RetroPCTuning; min: number; max: number; step: number }

const SliderRow: React.FC<{
  def: SliderDef
  tuning: RetroPCTuning
  setTuning: React.Dispatch<React.SetStateAction<RetroPCTuning>>
}> = ({ def, tuning, setTuning }) => {
  const { key, min, max, step } = def
  const digits = step < 0.001 ? 4 : step < 0.01 ? 3 : 2
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
      <span style={{ flex: '0 0 124px' }}>{key}</span>
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
      <span style={{ flex: '0 0 52px', textAlign: 'right' }}>{tuning[key].toFixed(digits)}</span>
    </label>
  )
}

const BODY_SLIDERS: SliderDef[] = [
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

const CRT_SLIDERS: SliderDef[] = [
  { key: 'crtScale',          min: 0.5,  max: 4,    step: 0.01 },
  { key: 'crtWarpStrength',   min: 0,    max: 2,    step: 0.01 },
  { key: 'crtCenterZoom',     min: 0,    max: 1.5,  step: 0.01 },
  { key: 'crtJitter',         min: 0,    max: 2,    step: 0.01 },
  { key: 'crtAberration',     min: 0,    max: 0.02, step: 0.0005 },
  { key: 'crtAberrationZoom', min: 0,    max: 0.3,  step: 0.005 },
  { key: 'crtScanline',       min: 0,    max: 0.5,  step: 0.005 },
  { key: 'crtGrid',           min: 0,    max: 0.5,  step: 0.005 },
  { key: 'crtVignette',       min: 0.2,  max: 3,    step: 0.01 },
  { key: 'crtDither',         min: 0,    max: 0.5,  step: 0.005 },
  { key: 'crtBrightness',     min: 0,    max: 2,    step: 0.01 },
]

const ROOM_SLIDERS: SliderDef[] = [
  { key: 'floorY', min: -1, max: 0.5, step: 0.01 },
  { key: 'wallZ',  min: -3, max: 0,   step: 0.01 },
  { key: 'wallY',  min: -1, max: 2.5, step: 0.01 },
]

const VIGNETTE_SLIDERS: SliderDef[] = [
  { key: 'vignetteCx',    min: 0,   max: 100, step: 1 },
  { key: 'vignetteW',     min: 10,  max: 200, step: 1 },
  { key: 'vignetteH',     min: 10,  max: 200, step: 1 },
  { key: 'vignetteInner', min: 0,   max: 90,  step: 1 },
  { key: 'vignetteAlpha', min: 0,   max: 1,   step: 0.01 },
]

const TuningPanel: React.FC<{
  tuning: RetroPCTuning
  setTuning: React.Dispatch<React.SetStateAction<RetroPCTuning>>
  activeLabel: string
  resetTo: RetroPCTuning
}> = ({ tuning, setTuning, activeLabel, resetTo }) => {
  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        right: 16,
        width: 300,
        maxHeight: '90vh',
        overflowY: 'auto',
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
      <div style={{ marginBottom: 8, opacity: 0.7, letterSpacing: 1 }}>RETRO-PC · {activeLabel} · P to toggle</div>
      <div style={{ marginTop: 4, marginBottom: 6, opacity: 0.55, fontSize: 10 }}>// BODY · LIGHT · BLOOM</div>
      {BODY_SLIDERS.map((s) => (
        <SliderRow key={s.key} def={s} tuning={tuning} setTuning={setTuning} />
      ))}
      <div style={{ marginTop: 10, marginBottom: 6, opacity: 0.55, fontSize: 10 }}>// CRT SHADER</div>
      {CRT_SLIDERS.map((s) => (
        <SliderRow key={s.key} def={s} tuning={tuning} setTuning={setTuning} />
      ))}
      <div style={{ marginTop: 10, marginBottom: 6, opacity: 0.55, fontSize: 10 }}>// ROOM (floor · wall)</div>
      {ROOM_SLIDERS.map((s) => (
        <SliderRow key={s.key} def={s} tuning={tuning} setTuning={setTuning} />
      ))}
      <div style={{ marginTop: 10, marginBottom: 6, opacity: 0.55, fontSize: 10 }}>// VIGNETTE (크레딧 사이드)</div>
      {VIGNETTE_SLIDERS.map((s) => (
        <SliderRow key={s.key} def={s} tuning={tuning} setTuning={setTuning} />
      ))}
      <button
        onClick={() => setTuning(resetTo)}
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
