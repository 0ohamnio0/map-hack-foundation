/**
 * INTRO Scene — mania buildup
 * Canvas with ChannelShift + Glitch + FlashbackHeightfield behind title overlay.
 * Auto-transitions to CH.1 after 5s.
 */
import React, { useEffect, useState, useRef } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import {
  EffectComposer,
  Bloom,
  Vignette,
  Glitch,
} from '@react-three/postprocessing'
import { GlitchMode } from 'postprocessing'
import { ChannelShift } from '@/components/effects/ChannelShiftEffect'
import { FlashbackHeightfield } from '@/components/effects/FlashbackHeightfield'
import { useGameStore } from '@/store/useGameStore'
import { useSoundManager } from '@/hooks/useSoundManager'

/** Intro post-processing: ChannelShift builds from 0→peak over 5s */
function IntroEffects() {
  const shiftRef = useRef({ r: [0, 0] as [number, number], b: [0, 0] as [number, number] })
  const elapsed = useRef(0)

  useFrame((_, delta) => {
    elapsed.current += delta
    const progress = Math.min(elapsed.current / 30, 1)

    shiftRef.current.r = [-0.15 * progress, 0.05 * progress]
    shiftRef.current.b = [0.15 * progress, -0.05 * progress]
  })

  return (
    <EffectComposer>
      <Bloom luminanceThreshold={0.4} luminanceSmoothing={0.9} intensity={1.2} />
      <Vignette offset={0.4} darkness={0.9} />
      <Glitch
        delay={[1.5, 3.5] as unknown as import('three').Vector2}
        duration={[0.1, 0.3] as unknown as import('three').Vector2}
        strength={[0.05, 0.2] as unknown as import('three').Vector2}
        mode={GlitchMode.SPORADIC}
      />
      <ChannelShift shiftR={shiftRef.current.r} shiftB={shiftRef.current.b} />
    </EffectComposer>
  )
}

/** Minimal 3D content for effects to process */
function IntroContent() {
  return (
    <>
      <ambientLight intensity={0.15} color="#ff2200" />
      <pointLight position={[0, 2, 0]} intensity={0.8} color="#ff0000" />
      {/* Dark room feel — floor and walls */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#0a0a0a" />
      </mesh>
      <FlashbackHeightfield opacity={0.3} />
      <IntroEffects />
    </>
  )
}

export const IntroScene: React.FC = () => {
  const goToChapter = useGameStore((s) => s.goToChapter)
  const { play } = useSoundManager()
  const [titleVisible, setTitleVisible] = useState(false)

  useEffect(() => {
    play('intro_ambient')
    const t1 = setTimeout(() => setTitleVisible(true), 15000)
    const t2 = setTimeout(() => goToChapter('CH1'), 30000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [goToChapter, play])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100 }}>
      <Canvas camera={{ fov: 75, position: [0, 1.6, 0] }} style={{ background: '#000' }}>
        <IntroContent />
      </Canvas>
      {/* Title overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <h1
          style={{
            fontFamily: 'monospace',
            color: '#fff',
            fontSize: '3rem',
            letterSpacing: '0.3em',
            opacity: titleVisible ? 1 : 0,
            transition: 'opacity 2s ease',
          }}
        >
          Map Hack
        </h1>
      </div>
    </div>
  )
}
