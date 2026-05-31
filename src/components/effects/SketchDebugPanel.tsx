/**
 * SketchDebugPanel — ?sketch=1 일 때 뜨는 dev 슬라이더 패널.
 * SketchEffect의 룩 파라미터를 라이브 조정. 값은 모듈 레벨 `sketchParams`에 기록되고
 * ChapterEffects.Ch3Effects가 매 프레임 이걸 읽어 uniform에 반영한다.
 * 하단 JSON을 복사해 SketchEffect 생성자 기본값으로 baking 하면 됨.
 */
import { useState } from 'react'

export type SketchParams = {
  edgeStrength: number
  edgeLow: number
  edgeHigh: number
  shadeLow: number
  shadeHigh: number
  shadowMul: number
  grain: number
  warp: number
  lineOffset: number
  linePeriod: number
  paper: string
  ink: string
}

// 기본값 — SketchEffectImpl 생성자 uniform 기본값과 동일하게 유지할 것
export const SKETCH_DEFAULTS: SketchParams = {
  edgeStrength: 10.9,
  edgeLow: 0.78,
  edgeHigh: 0.84,
  shadeLow: 0.2,
  shadeHigh: 0.12,
  shadowMul: 0.47,
  grain: 0.15,
  warp: 0.0012,
  lineOffset: 0,
  linePeriod: 30,
  paper: '#eeede7',
  ink: '#343232',
}

// 공유 가변 상태 — 패널이 쓰고, Ch3Effects가 매 프레임 읽음
export const sketchParams: SketchParams = { ...SKETCH_DEFAULTS }

const SLIDERS: Array<{ key: keyof SketchParams; min: number; max: number; step: number }> = [
  { key: 'edgeStrength', min: 0, max: 20, step: 0.1 },
  { key: 'edgeLow', min: 0, max: 1, step: 0.01 },
  { key: 'edgeHigh', min: 0, max: 1, step: 0.01 },
  { key: 'shadeLow', min: 0, max: 1, step: 0.01 },
  { key: 'shadeHigh', min: 0, max: 1, step: 0.01 },
  { key: 'shadowMul', min: 0, max: 1, step: 0.01 },
  { key: 'grain', min: 0, max: 0.2, step: 0.005 },
  { key: 'warp', min: 0, max: 0.01, step: 0.0001 },
  { key: 'lineOffset', min: 0, max: 0.02, step: 0.0005 },
  { key: 'linePeriod', min: 0, max: 120, step: 1 },
]

export const SketchDebugPanel: React.FC = () => {
  const [params, setParams] = useState<SketchParams>({ ...sketchParams })

  const update = (key: keyof SketchParams, value: number | string) => {
    ;(sketchParams as Record<keyof SketchParams, number | string>)[key] = value
    setParams({ ...sketchParams })
  }

  const reset = () => {
    Object.assign(sketchParams, SKETCH_DEFAULTS)
    setParams({ ...sketchParams })
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 16,
        right: 16,
        width: 300,
        padding: 14,
        background: 'rgba(20, 20, 24, 0.88)',
        color: '#e8e8e8',
        font: '11px ui-monospace, monospace',
        borderRadius: 6,
        zIndex: 10000,
        backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ marginBottom: 8, opacity: 0.7, letterSpacing: 1 }}>SKETCH · ?sketch=1</div>
      {SLIDERS.map(({ key, min, max, step }) => (
        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ flex: '0 0 96px' }}>{key}</span>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={params[key] as number}
            onChange={(e) => update(key, parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ flex: '0 0 52px', textAlign: 'right' }}>{(params[key] as number).toFixed(step < 0.01 ? 4 : 2)}</span>
        </label>
      ))}
      {(['paper', 'ink'] as const).map((key) => (
        <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ flex: '0 0 96px' }}>{key}</span>
          <input
            type="color"
            value={params[key] as string}
            onChange={(e) => update(key, e.target.value)}
            style={{ flex: 1, height: 22, background: 'none', border: 'none' }}
          />
          <span style={{ flex: '0 0 52px', textAlign: 'right' }}>{params[key] as string}</span>
        </label>
      ))}
      <button
        onClick={reset}
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
{JSON.stringify(params, null, 2)}
      </pre>
    </div>
  )
}
