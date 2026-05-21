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
import { BokehBlurEffect, type BokehBlurEffectImpl } from './BokehBlurEffect'
import { PixelateEffect, type PixelateEffectImpl } from './PixelateEffect'
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
 * CH.2 NPC positions for proximity blur calculation (REF-15)
 * Special NPC at index 4 (18, -45) gets extra strong bokeh
 */
const CH2_NPC_POS: [number, number][] = [
  [-3, -8], [4, -15], [-2, -25], [18, -38],
  [8, -34], [24, -50], [15, -63], [-4, -72], [2, -80],
]
const SPECIAL_NPC_IDX = 4

/**
 * CH.2 Effects — fog + Vignette + Noise + Bokeh Blur (REF-15)
 * NPC proximity drives real bokeh disc blur
 */
export function Ch2Effects() {
  const bokehRef = useRef<BokehBlurEffectImpl>(null)
  const pixRef = useRef<PixelateEffectImpl>(null)
  // 누적 이동거리 기반 — 시작은 최대 픽셀, FULL_DIST 만큼 걸으면 선명(원본)
  // (뒷부분에 중요 요소 多 → 진행할수록 또렷해짐)
  const PIX_FULL_DIST = 340
  const traveled = useRef(0)
  const lastPos = useRef<[number, number] | null>(null)

  useFrame(({ camera }) => {
    const cx = camera.position.x
    const cz = camera.position.z

    // 누적 이동거리 → 픽셀화 진행도
    if (lastPos.current) {
      const mdx = cx - lastPos.current[0]
      const mdz = cz - lastPos.current[1]
      const step = Math.sqrt(mdx * mdx + mdz * mdz)
      if (step > 0.001 && step < 5) traveled.current += step // 텔레포트/점프 컷 제외
    }
    lastPos.current = [cx, cz]
    pixRef.current?.setProgress(1 - traveled.current / PIX_FULL_DIST)

    if (!bokehRef.current) return

    let maxAmount = 0
    let maxIntensity = 1

    for (let i = 0; i < CH2_NPC_POS.length; i++) {
      const [nx, nz] = CH2_NPC_POS[i]
      const dx = nx - cx
      const dz = nz - cz
      const dist = Math.sqrt(dx * dx + dz * dz)

      if (dist > 12) continue

      const proximity = Math.max(0, 1 - dist / 12)

      if (i === SPECIAL_NPC_IDX && dist < 8) {
        maxAmount = Math.max(maxAmount, 0.2 * proximity)
        maxIntensity = Math.max(maxIntensity, 3.0)
      } else if (dist < 8) {
        const amount = 0.15 * proximity
        maxAmount = Math.max(maxAmount, amount)
        maxIntensity = Math.max(maxIntensity, 1.5 + proximity)
      }
    }

    bokehRef.current.setParams(maxAmount, maxIntensity)
  })

  return (
    <>
      <fog attach="fog" args={['#1a1525', 30, 260]} />
      <EffectComposer>
        <Vignette offset={0.3} darkness={0.8} />
        <Noise
          opacity={0.05}
          blendFunction={BlendFunction.OVERLAY}
        />
        <BokehBlurEffect ref={bokehRef} />
        <PixelateEffect ref={pixRef} />
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

  // Map effect names to shader type indices
  const effectTypeMap: Record<string, number> = {
    desaturate: 0,  // 기분안정제
    blur: 1,        // 항정신병약
    darken: 2,      // 수면제
    anxiolytic: 3,  // 항불안제
    whiteflash: 4,  // 다 먹음
  }

  // Duration per effect type (darken = persistent until next pickup → 9999)
  const effectDuration: Record<string, number> = {
    desaturate: 8,
    blur: 10,
    darken: 8,
    anxiolytic: 6,
    whiteflash: 1.8,
  }
  const medDuration = useRef(6.5)

  // Trigger medication effect when activeEffect changes to a drug type
  useEffect(() => {
    const drugEffects = ['desaturate', 'blur', 'darken', 'anxiolytic', 'whiteflash']
    if (activeEffect && drugEffects.includes(activeEffect)) {
      medElapsed.current = 0
      medActive.current = true
      medDuration.current = effectDuration[activeEffect] ?? 6.5
      if (medRef.current) {
        medRef.current.setEffectType(effectTypeMap[activeEffect] ?? 0)
      }
    } else if (!activeEffect) {
      // activeEffect=null (NPC encounter로 종료) → 효과 즉시 reset
      medActive.current = false
      if (medRef.current) medRef.current.reset()
    }
  }, [activeEffect])

  const overdoseDone = useRef(false)

  // Trigger overdose when cart has 5+ unique meds collected
  // (cartItems duplicates on pickup, so 5+ items = all meds taken)
  useEffect(() => {
    if (cartItems.length >= 5 && !overdoseActive.current && !overdoseDone.current) {
      overdoseElapsed.current = 0
      overdoseActive.current = true
    }
  }, [cartItems])

  // Overdose display duration: 15s of visible effect, then all shaders OFF
  const OVERDOSE_DISPLAY = 15

  useFrame((_, delta) => {
    // Drive MedicationEffect (skip if overdose is done — all shaders off)
    if (medRef.current && medActive.current && !overdoseDone.current) {
      medElapsed.current += delta
      medRef.current.setPhase(medElapsed.current, medDuration.current)
      if (medElapsed.current > medDuration.current) {
        medActive.current = false
        medRef.current.reset()
      }
    }
    // Drive OverdoseEffect — show for OVERDOSE_DISPLAY seconds then kill all
    if (overdoseRef.current && overdoseActive.current && !overdoseDone.current) {
      overdoseElapsed.current += delta
      overdoseRef.current.setPhase(overdoseElapsed.current)

      if (overdoseElapsed.current > OVERDOSE_DISPLAY) {
        // Turn off ALL shaders
        overdoseActive.current = false
        overdoseDone.current = true
        overdoseRef.current.reset()
        if (medRef.current) medRef.current.reset()
        medActive.current = false
      }
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
