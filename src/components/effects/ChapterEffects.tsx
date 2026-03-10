import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  EffectComposer,
  Bloom,
  Vignette,
  Noise,
  Glitch,
} from '@react-three/postprocessing'
import { GlitchMode, BlendFunction } from 'postprocessing'
import { ChannelShift } from './ChannelShiftEffect'
import { MedicationEffect, type MedicationEffectImpl } from './MedicationEffect'
import { OverdoseEffect, type OverdoseEffectImpl } from './OverdoseEffect'
import { useGameStore } from '@/store/useGameStore'

/**
 * CH.1 Effects — 조증 피크
 * Bloom + Vignette + Sporadic Glitch + Channel Shift (색수차)
 */
export function Ch1Effects() {
  const shiftRef = useRef({ r: [0, 0] as [number, number], b: [0, 0] as [number, number] })
  const elapsed = useRef(0)

  // 조증 진행: 0~3s 초기 → 3~5.5s 심화
  useFrame((_, delta) => {
    elapsed.current += delta
    const t = elapsed.current
    // progress 0→1 over 5.5s
    const progress = Math.min(t / 5.5, 1)

    // 정상→초기→심화→피크
    const rx = -0.15 * progress
    const ry = 0.05 * progress
    const bx = 0.15 * progress
    const by = -0.05 * progress

    shiftRef.current.r = [rx, ry]
    shiftRef.current.b = [bx, by]
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

/**
 * CH.2 Effects — 거리, 끝이 안 보이는 느낌
 * fog + Vignette + subtle Noise
 */
export function Ch2Effects() {
  return (
    <>
      <fog attach="fog" args={['#0a0a0a', 10, 45]} />
      <EffectComposer>
        <Vignette offset={0.3} darkness={0.8} />
        <Noise
          opacity={0.05}
          blendFunction={BlendFunction.OVERLAY}
        />
      </EffectComposer>
    </>
  )
}

/**
 * CH.3 Effects — 마트 형광등 불안정 + 약 복용 GLSL 이펙트
 * Vignette + Noise + MedicationEffect + OverdoseEffect
 */
export function Ch3Effects() {
  const medRef = useRef<MedicationEffectImpl>(null)
  const overdoseRef = useRef<OverdoseEffectImpl>(null)
  const activeEffect = useGameStore((s) => s.activeEffect)
  const cartItems = useGameStore((s) => s.cartItems)

  const medElapsed = useRef(0)
  const medActive = useRef(false)
  const overdoseElapsed = useRef(0)
  const overdoseActive = useRef(false)

  // Trigger medication effect when activeEffect changes to a drug type
  useEffect(() => {
    const drugEffects = ['desaturate', 'blur', 'darken', 'whiteflash']
    if (activeEffect && drugEffects.includes(activeEffect)) {
      medElapsed.current = 0
      medActive.current = true
    }
  }, [activeEffect])

  // Trigger overdose when cart has 5+ items (all taken)
  useEffect(() => {
    if (cartItems.length >= 5 && !overdoseActive.current) {
      overdoseElapsed.current = 0
      overdoseActive.current = true
    }
  }, [cartItems])

  useFrame((_, delta) => {
    // Drive MedicationEffect
    if (medRef.current && medActive.current) {
      medElapsed.current += delta
      medRef.current.setPhase(medElapsed.current)
      if (medElapsed.current > 6.5) {
        medActive.current = false
        medRef.current.reset()
      }
    }
    // Drive OverdoseEffect (no recovery)
    if (overdoseRef.current && overdoseActive.current) {
      overdoseElapsed.current += delta
      overdoseRef.current.setPhase(overdoseElapsed.current)
    }
  })

  return (
    <EffectComposer>
      <Vignette offset={0.25} darkness={0.7} />
      <Noise
        opacity={0.04}
        blendFunction={BlendFunction.OVERLAY}
      />
      {/* STEP 9: Drug effects (REF-8, REF-11) */}
      <MedicationEffect ref={medRef} />
      <OverdoseEffect ref={overdoseRef} />
    </EffectComposer>
  )
}
