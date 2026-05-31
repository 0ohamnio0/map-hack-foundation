import { useRef, useEffect, useMemo } from 'react'
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
import { SketchEffect, type SketchEffectImpl } from './SketchEffect'
import { sketchParams } from './SketchDebugPanel'
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

// 약 효과 중 ghost 만날 때까지 hold하는 타입 (whiteflash는 순간 플래시라 제외)
const HOLD_EFFECTS = ['desaturate', 'blur', 'darken', 'anxiolytic']

/**
 * CH.3 Effects — 마트 형광등 불안정 + 약 복용 GLSL 이펙트
 * Vignette + Noise + MedicationEffect + SketchEffect(Fluoxetine→손그림)
 */
export function Ch3Effects() {
  const medRef = useRef<MedicationEffectImpl>(null)
  const sketchRef = useRef<SketchEffectImpl>(null)
  // 디버그: ?sketch=1 → 스케치 효과를 상시 full로 고정 (룩 확인/튜닝용)
  const sketchDebug = useMemo(
    () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sketch') === '1',
    [],
  )
  const debugTime = useRef(0)
  const activeEffect = useGameStore((s) => s.activeEffect)

  const medElapsed = useRef(0)
  const medActive = useRef(false)
  const medReleasing = useRef(false)
  const medReleaseElapsed = useRef(0)
  const medEffectName = useRef<string | null>(null)

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
    whiteflash: 6,  // 스케치 변환 — 잉크 손그림이 충분히 보이도록 (fade 1.5 + hold 3 + fade 1.5)
  }
  const medDuration = useRef(6.5)

  // Trigger medication effect when activeEffect changes to a drug type
  useEffect(() => {
    const drugEffects = ['desaturate', 'blur', 'darken', 'anxiolytic', 'whiteflash']
    if (activeEffect && drugEffects.includes(activeEffect)) {
      medElapsed.current = 0
      medActive.current = true
      medReleasing.current = false
      medReleaseElapsed.current = 0
      medEffectName.current = activeEffect
      medDuration.current = effectDuration[activeEffect] ?? 6.5
      if (medRef.current) {
        medRef.current.setEffectType(effectTypeMap[activeEffect] ?? 0)
      }
    } else if (!activeEffect) {
      // activeEffect=null (NPC encounter로 종료) → hold 효과는 1.5s fade out 시작
      if (medActive.current && !medReleasing.current) {
        medReleasing.current = true
        medReleaseElapsed.current = 0
      }
    }
  }, [activeEffect])

  useFrame((_, delta) => {
    // Drive MedicationEffect
    if (medRef.current && medActive.current) {
      medElapsed.current += delta
      const isHold = !!medEffectName.current && HOLD_EFFECTS.includes(medEffectName.current)
      if (isHold) {
        // ghost 만날 때까지 full hold → 만나면(medReleasing) 1.5s fade out
        medRef.current.setHoldPhase(medElapsed.current, medReleasing.current, medReleaseElapsed.current)
        if (medReleasing.current) {
          medReleaseElapsed.current += delta
          if (medReleaseElapsed.current > 1.5) {
            medActive.current = false
            medRef.current.reset()
          }
        } else if (medElapsed.current > medDuration.current + 20) {
          // 안전장치: ghost spawn 실패 등으로 영영 안 끝나는 것 방지
          medReleasing.current = true
          medReleaseElapsed.current = 0
        }
      } else {
        // whiteflash 등 — 기존 고정 엔벨로프(in→hold→out)
        medRef.current.setPhase(medElapsed.current, medDuration.current)
        // Fluoxetine(흰 약): 화이트아웃 대신 화면을 손그림 스케치로 — 같은 엔벨로프로 progress 구동
        if (medEffectName.current === 'whiteflash' && sketchRef.current) {
          const tt = medElapsed.current
          const dur = medDuration.current
          const fade = 1.5
          let p: number
          if (tt < fade) p = tt / fade
          else if (tt < dur - fade) p = 1
          else if (tt < dur) p = 1 - (tt - (dur - fade)) / fade
          else p = 0
          sketchRef.current.setProgress(p)
          sketchRef.current.setTime(medElapsed.current)
        }
        if (medElapsed.current > medDuration.current) {
          medActive.current = false
          medRef.current.reset()
          sketchRef.current?.reset()
        }
      }
    }
    // 디버그 오버라이드 — ?sketch=1이면 스케치를 항상 full + 패널 파라미터 라이브 반영
    if (sketchDebug && sketchRef.current) {
      debugTime.current += delta
      sketchRef.current.setParams(sketchParams)
      sketchRef.current.setProgress(1)
      sketchRef.current.setTime(debugTime.current)
    }
  })

  return (
    <EffectComposer>
      <Vignette offset={0.25} darkness={0.7} />
      <Noise
        opacity={0.04}
        blendFunction={BlendFunction.OVERLAY}
      />
      {/* STEP 9: Drug effects (REF-8) */}
      <MedicationEffect ref={medRef} />
      {/* Fluoxetine(흰 약) — 화면을 잉크/종이 손그림으로. 마지막에 둬서 최종 화면을 스케치로 덮음. */}
      <SketchEffect ref={sketchRef} />
    </EffectComposer>
  )
}
