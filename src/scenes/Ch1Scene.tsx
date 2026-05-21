import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { EffectComposer, Noise } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import * as THREE from 'three'
import { useGameStore } from '@/store/useGameStore'
import { useDevMode } from '@/hooks/useDevMode'

type LightingTuning = {
  lightX: number
  lightY: number
  lightZ: number
  targetX: number
  targetY: number
  targetZ: number
  ambient: number
  intensityMult: number
  shadowSize: number
  shadowBias: number
  fogNear: number
  fogFar: number
}

const DEFAULT_LIGHTING: LightingTuning = {
  lightX: 20.5,
  lightY: 7.4,
  lightZ: -24.5,
  targetX: -5.3,
  targetY: 5.6,
  targetZ: -4.6,
  ambient: 0.18,
  intensityMult: 8.0,
  shadowSize: 12,
  shadowBias: -0.0005,
  fogNear: 4,
  fogFar: 16,
}

// Reference viewport — lighting was tuned against this aspect.
// Larger viewports get scaled up (contain fit); smaller ones scaled down.
const REF_W = 2517
const REF_H = 1398

/**
 * CH.1 — Lightweight R3F mini room with one rotating door.
 * Inspired by ShaderToy fdVBRw but using plain meshes + standard lighting
 * instead of fullscreen path tracing. Click/key:
 *   - door swings open
 *   - camera dollies toward the door
 *   - white-out → CH.2
 */

const ROOM_COLOR = '#1c1c1c'
const DOOR_COLOR = '#262626'
const HINGE_X = 5
const HINGE_Z = -12.5
const DOOR_W = 1.0
const DOOR_H = 2.6

const Room: React.FC = () => (
  <group>
    {/* floor — receives the light shaft from the door */}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -5]} receiveShadow>
      <planeGeometry args={[10, 20]} />
      <meshStandardMaterial color={ROOM_COLOR} roughness={1} />
    </mesh>
    {/* ceiling */}
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 4, -5]} receiveShadow>
      <planeGeometry args={[10, 20]} />
      <meshStandardMaterial color={ROOM_COLOR} roughness={1} />
    </mesh>
    {/* left wall */}
    <mesh rotation={[0, Math.PI / 2, 0]} position={[-5, 2, -5]} receiveShadow>
      <planeGeometry args={[20, 4]} />
      <meshStandardMaterial color={ROOM_COLOR} roughness={1} />
    </mesh>
    {/* back wall */}
    <mesh position={[0, 2, -15]} receiveShadow>
      <planeGeometry args={[10, 4]} />
      <meshStandardMaterial color={ROOM_COLOR} roughness={1} />
    </mesh>
    {/* front wall (behind camera, closes the box) */}
    <mesh rotation={[0, Math.PI, 0]} position={[0, 2, 5]} receiveShadow>
      <planeGeometry args={[10, 4]} />
      <meshStandardMaterial color={ROOM_COLOR} roughness={1} />
    </mesh>

    {/* right wall — split around the door. Extended way past the room bounds
        on both sides + above so parallel sun rays can't sneak around the wall edges
        and hit the floor directly. The wall acts as an occluder far beyond the room. */}
    {/* segment behind the door — extended z to -30 */}
    <mesh rotation={[0, -Math.PI / 2, 0]} position={[5, 2, -21.25]} castShadow receiveShadow>
      <planeGeometry args={[17.5, 4]} />
      <meshStandardMaterial color={ROOM_COLOR} roughness={1} side={THREE.BackSide} shadowSide={THREE.DoubleSide} />
    </mesh>
    {/* segment in front of door — extended z to +30 */}
    <mesh rotation={[0, -Math.PI / 2, 0]} position={[5, 2, 9.25]} castShadow receiveShadow>
      <planeGeometry args={[41.5, 4]} />
      <meshStandardMaterial color={ROOM_COLOR} roughness={1} side={THREE.BackSide} shadowSide={THREE.DoubleSide} />
    </mesh>
    {/* segment above the door — exactly door width, fills the gap to ceiling */}
    <mesh rotation={[0, -Math.PI / 2, 0]} position={[5, (DOOR_H + 4) / 2, HINGE_Z + DOOR_W / 2]} castShadow receiveShadow>
      <planeGeometry args={[DOOR_W, 4 - DOOR_H]} />
      <meshStandardMaterial color={ROOM_COLOR} roughness={1} side={THREE.BackSide} shadowSide={THREE.DoubleSide} />
    </mesh>
  </group>
)

const Door: React.FC<{ open: number }> = ({ open }) => {
  const hinge = useRef<THREE.Group>(null)
  useFrame(() => {
    if (hinge.current) {
      // 0 = closed (flush with right wall), open swings outward away from camera
      hinge.current.rotation.y = -open * Math.PI * 0.55
    }
  })
  return (
    // Hinge sits at the back edge of the door opening
    <group ref={hinge} position={[HINGE_X, 0, HINGE_Z]}>
      {/* Door panel — pivot at hinge, extends outward along +z (toward door front) */}
      <mesh position={[0, DOOR_H / 2, DOOR_W / 2]} castShadow receiveShadow>
        <boxGeometry args={[0.06, DOOR_H, DOOR_W]} />
        <meshStandardMaterial color={DOOR_COLOR} roughness={0.8} />
      </mesh>
    </group>
  )
}

/** Bright emissive plane fitted exactly to the door hole — sits just behind the
 *  wall so it doesn't peek around the door panel. Color > 1 + toneMapped:false
 *  pushes it above SDR clip → reads as searing light. */
const SkyBeyondDoor: React.FC = () => (
  <mesh rotation={[0, -Math.PI / 2, 0]} position={[5.05, DOOR_H / 2, HINGE_Z + DOOR_W / 2]}>
    <planeGeometry args={[DOOR_W, DOOR_H]} />
    <meshBasicMaterial color={[3.0, 3.0, 3.0]} toneMapped={false} />
  </mesh>
)

const CameraRig: React.FC<{ progress: number }> = ({ progress }) => {
  useFrame(({ camera }) => {
    const zoom = THREE.MathUtils.smoothstep(progress, 0.25, 0.85)
    const startPos = new THREE.Vector3(-2.5, 1.7, -5)
    const endPos = new THREE.Vector3(3.2, DOOR_H / 2, -11.0)
    camera.position.lerpVectors(startPos, endPos, zoom)
    camera.lookAt(HINGE_X + 0.5, DOOR_H / 2, HINGE_Z + DOOR_W / 2)
  })
  return null
}

const Scene: React.FC<{ progress: number; tuning: LightingTuning }> = ({ progress, tuning }) => {
  const open = THREE.MathUtils.smoothstep(progress, 0.0, 0.35)
  const sunIntensity = open * tuning.intensityMult

  return (
    <>
      <fog attach="fog" args={['#000000', tuning.fogNear, tuning.fogFar]} />
      <ambientLight intensity={tuning.ambient} color="#ffffff" />
      <directionalLight
        position={[tuning.lightX, tuning.lightY, tuning.lightZ]}
        target-position={[tuning.targetX, tuning.targetY, tuning.targetZ]}
        intensity={sunIntensity}
        color="#ffffff"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={0.1}
        shadow-camera-far={30}
        shadow-camera-left={-tuning.shadowSize}
        shadow-camera-right={tuning.shadowSize}
        shadow-camera-top={tuning.shadowSize}
        shadow-camera-bottom={-tuning.shadowSize}
        shadow-bias={tuning.shadowBias}
      />
      <Room />
      <SkyBeyondDoor />
      <Door open={open} />
      <CameraRig progress={progress} />
      <EffectComposer>
        <Noise opacity={0.18} blendFunction={BlendFunction.OVERLAY} premultiply />
      </EffectComposer>
    </>
  )
}

export const Ch1Scene: React.FC = () => {
  const goToChapter = useGameStore(s => s.goToChapter)
  const [progress, setProgress] = useState(0)
  const [tuning, setTuning] = useState<LightingTuning>(DEFAULT_LIGHTING)
  const devMode = useDevMode()
  const triggeredRef = useRef(false)
  const rafRef = useRef<number | null>(null)
  const timeoutRef = useRef<number | null>(null)
  const [viewport, setViewport] = useState(() => ({
    w: typeof window === 'undefined' ? REF_W : window.innerWidth,
    h: typeof window === 'undefined' ? REF_H : window.innerHeight,
  }))

  useEffect(() => {
    const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Only activate zoom mode when viewport is taller than the reference.
  // In zoom mode, use cover fit (max of w/h ratios) so we always fill the viewport
  // with no letterbox — overflow may crop edges, never adds black bars.
  const useFixedStage = viewport.h > REF_H
  const scale = useFixedStage ? Math.max(viewport.w / REF_W, viewport.h / REF_H) : 1

  useEffect(() => {
    const trigger = () => {
      // Dev mode → manual progress slider, auto dolly disabled
      if (devMode) return
      if (triggeredRef.current) return
      triggeredRef.current = true
      const start = performance.now()
      const DURATION = 6000
      const step = () => {
        const t = Math.min(1, (performance.now() - start) / DURATION)
        setProgress(t)
        if (t < 1) {
          rafRef.current = requestAnimationFrame(step)
        } else {
          timeoutRef.current = window.setTimeout(() => goToChapter('CH2'), 200)
        }
      }
      rafRef.current = requestAnimationFrame(step)
    }
    const keyHandler = (e: KeyboardEvent) => {
      // P key is reserved for dev panel toggle
      if (e.code === 'KeyP') return
      trigger()
    }
    const clickHandler = (e: MouseEvent) => {
      // Ignore clicks inside the dev panel
      const target = e.target as HTMLElement | null
      if (target?.closest('[data-ch1-tuning-panel]')) return
      trigger()
    }
    window.addEventListener('keydown', keyHandler)
    window.addEventListener('click', clickHandler)
    return () => {
      window.removeEventListener('keydown', keyHandler)
      window.removeEventListener('click', clickHandler)
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      if (timeoutRef.current !== null) clearTimeout(timeoutRef.current)
    }
  }, [goToChapter, devMode])

  const whiteOut = THREE.MathUtils.smoothstep(progress, 0.65, 1.0)

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 100, background: '#000', cursor: 'pointer',
      overflow: 'hidden',
    }}>
      {/* Stage is viewport-100% by default. Only when viewport is taller than the
          reference height do we lock to REF_W×REF_H and scale up to fill — this
          keeps the camera framing consistent with the tuned 2517×1398 reference. */}
      <div style={useFixedStage ? {
        width: REF_W,
        height: REF_H,
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: 'center center',
      } : {
        width: '100%',
        height: '100%',
        position: 'relative',
      }}>
        <Canvas shadows camera={{ position: [-2.5, 1.7, -5], fov: 60, near: 0.1, far: 100 }}>
          <Scene progress={progress} tuning={tuning} />
        </Canvas>
        <div style={{
          position: 'absolute', inset: 0, background: '#ffffff',
          opacity: whiteOut, pointerEvents: 'none',
        }} />
        {progress === 0 && (
          <div style={{
            position: 'absolute',
            bottom: '8%',
            left: 0,
            right: 0,
            textAlign: 'center',
            color: 'rgba(255,255,255,0.45)',
            fontFamily: '"Unifont", monospace',
            fontSize: '0.9rem',
            letterSpacing: 4,
            pointerEvents: 'none',
          }}>
            click or press any key
          </div>
        )}
      </div>
      {devMode && (
        <LightingPanel
          tuning={tuning}
          setTuning={setTuning}
          progress={progress}
          setProgress={setProgress}
        />
      )}
    </div>
  )
}

const SLIDERS: Array<{ key: keyof LightingTuning; min: number; max: number; step: number }> = [
  { key: 'lightX',        min: -50, max: 50,  step: 0.5 },
  { key: 'lightY',        min: -20, max: 30,  step: 0.1 },
  { key: 'lightZ',        min: -50, max: 50,  step: 0.5 },
  { key: 'targetX',       min: -20, max: 20,  step: 0.1 },
  { key: 'targetY',       min: -10, max: 20,  step: 0.1 },
  { key: 'targetZ',       min: -30, max: 20,  step: 0.1 },
  { key: 'ambient',       min: 0,   max: 1,   step: 0.01 },
  { key: 'intensityMult', min: 0,   max: 20,  step: 0.1 },
  { key: 'shadowSize',    min: 1,   max: 30,  step: 0.5 },
  { key: 'shadowBias',    min: -0.005, max: 0.005, step: 0.0001 },
  { key: 'fogNear',       min: 0,   max: 20,  step: 0.5 },
  { key: 'fogFar',        min: 1,   max: 40,  step: 0.5 },
]

const LightingPanel: React.FC<{
  tuning: LightingTuning
  setTuning: React.Dispatch<React.SetStateAction<LightingTuning>>
  progress: number
  setProgress: React.Dispatch<React.SetStateAction<number>>
}> = ({ tuning, setTuning, progress, setProgress }) => (
  <div
    data-ch1-tuning-panel
    style={{
      position: 'absolute',
      top: 16,
      right: 16,
      width: 300,
      padding: 14,
      background: 'rgba(20, 20, 24, 0.88)',
      color: '#e8e8e8',
      font: '11px ui-monospace, monospace',
      borderRadius: 6,
      pointerEvents: 'auto',
      zIndex: 10,
      backdropFilter: 'blur(6px)',
    }}
    onClick={(e) => e.stopPropagation()}
  >
    <div style={{ marginBottom: 8, opacity: 0.7, letterSpacing: 1 }}>CH1 LIGHTING · P to toggle</div>
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.15)' }}>
      <span style={{ flex: '0 0 110px', color: '#ffd070' }}>progress</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={progress}
        onChange={(e) => setProgress(parseFloat(e.target.value))}
        style={{ flex: 1 }}
      />
      <span style={{ flex: '0 0 56px', textAlign: 'right' }}>{progress.toFixed(2)}</span>
    </label>
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
        <span style={{ flex: '0 0 56px', textAlign: 'right' }}>{tuning[key].toFixed(step < 0.01 ? 4 : 2)}</span>
      </label>
    ))}
    <button
      onClick={() => setTuning(DEFAULT_LIGHTING)}
      style={{
        marginTop: 8,
        width: '100%',
        padding: '6px 8px',
        background: 'rgba(255,255,255,0.08)',
        color: '#e8e8e8',
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
