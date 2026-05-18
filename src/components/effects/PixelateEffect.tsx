/**
 * CH.2 점진적 픽셀라이즈 — 캐릭터가 걸어갈수록(누적 이동거리) 화면 전체가
 * 점점 블록화 + 색 단순화된다. 스크린 스페이스라 텍스처·캐릭터·소품 전부 적용.
 *
 * progress 0 → 원본, 1 → 최대 블록(MAX_PX) + 최소 색계조(MIN_LEVELS).
 * Ch2Effects의 useFrame에서 setProgress()로 구동 (ref 방식 — prop 비반응 회피).
 */
import { forwardRef, useMemo } from 'react'
import { Effect } from 'postprocessing'
import { Uniform } from 'three'

const MAX_PX = 14        // 최대 픽셀 블록 크기 (screen px)
const MIN_LEVELS = 5     // 최대 진행 시 채널당 색 계조 수

const fragmentShader = /* glsl */ `
  uniform float pixelSize;  // 1 = 무효과, 클수록 블록 큼
  uniform float levels;     // 채널당 색 계조 (>=128 ≈ 무효과)

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec2 res = vec2(textureSize(inputBuffer, 0));
    vec2 cell = max(pixelSize, 1.0) / res;
    vec2 puv = (floor(uv / cell) + 0.5) * cell;
    vec4 c = texture2D(inputBuffer, puv);
    // 색 계조 단순화(포스터라이즈)
    c.rgb = floor(c.rgb * levels + 0.5) / levels;
    outputColor = vec4(c.rgb, inputColor.a);
  }
`

export class PixelateEffectImpl extends Effect {
  constructor() {
    super('PixelateEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['pixelSize', new Uniform(1)],
        ['levels', new Uniform(256)],
      ]),
    })
  }

  /** progress 0..1 — 0:원본, 1:최대 픽셀화 */
  setProgress(p: number) {
    const t = Math.min(Math.max(p, 0), 1)
    // 부드러운 가속(초반 천천히, 후반 급격)
    const e = t * t * (3 - 2 * t)
    ;(this.uniforms.get('pixelSize') as Uniform).value = 1 + (MAX_PX - 1) * e
    ;(this.uniforms.get('levels') as Uniform).value = 256 + (MIN_LEVELS - 256) * e
  }
}

export const PixelateEffect = forwardRef<PixelateEffectImpl>((_, ref) => {
  const effect = useMemo(() => new PixelateEffectImpl(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})
