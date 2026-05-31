/**
 * SketchEffect — 게임 화면을 잉크/종이 손그림(NPR)으로 변환하는 후처리.
 * ShaderToy "Sketch" (depth+normal → edge → ink-on-paper)를 실제 씬에 맞춰 적응:
 *  - 원본은 무텍스처 SDF라 normal에서 엣지를 뽑았지만, CH3 미로는 텍스처가 풍부해
 *    화면 휘도(luminance) Sobel로 엣지를 뽑는다 (사이니지·타일 디테일이 잉크 선으로).
 *  - 원본 Image 패스 특성: 같은 엣지를 위상차 3곳에서 떠서 겹치면 손으로 여러 번 그린 듯한
 *    다중 스트로크 아웃라인이 된다 (uLineOffset / uLinePeriod). offset=0이면 단일 선.
 *  - 종이톤 배경 + 휘도 기반 음영 + 잉크 엣지 + 미세 종이 흔들림/그레인.
 *  - progress=0이면 원본 그대로 통과(평상시 무비용), 1이면 완전 스케치. Fluoxetine(흰 약) 효과가 구동.
 *  - 룩 파라미터는 uniform으로 노출 — ?sketch=1 dev 패널(SketchDebugPanel)에서 라이브 조정.
 */
import { forwardRef, useEffect, useMemo } from 'react'
import { useThree } from '@react-three/fiber'
import { Effect } from 'postprocessing'
import { Uniform, Vector2, Color } from 'three'
import type { SketchParams } from './SketchDebugPanel'

const fragmentShader = /* glsl */ `
  uniform float progress;
  uniform float uTime;
  uniform vec2 uTexel;
  uniform float uEdgeStrength;
  uniform float uEdgeLow;
  uniform float uEdgeHigh;
  uniform vec3 uPaper;
  uniform vec3 uInk;
  uniform float uShadeLow;
  uniform float uShadeHigh;
  uniform float uShadowMul;
  uniform float uGrain;
  uniform float uWarp;
  uniform float uLineOffset;
  uniform float uLinePeriod;

  float skLum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  float skHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

  // 한 위치의 휘도 Sobel 엣지 강도 (0..1)
  float skEdgeAt(vec2 uv, vec2 px) {
    float l1 = skLum(texture2D(inputBuffer, uv + vec2(px.x, 0.0)).rgb);
    float l2 = skLum(texture2D(inputBuffer, uv - vec2(px.x, 0.0)).rgb);
    float l3 = skLum(texture2D(inputBuffer, uv + vec2(0.0, px.y)).rgb);
    float l4 = skLum(texture2D(inputBuffer, uv - vec2(0.0, px.y)).rgb);
    float l5 = skLum(texture2D(inputBuffer, uv + px).rgb);
    float l6 = skLum(texture2D(inputBuffer, uv - px).rgb);
    float l7 = skLum(texture2D(inputBuffer, uv + vec2(px.x, -px.y)).rgb);
    float l8 = skLum(texture2D(inputBuffer, uv + vec2(-px.x, px.y)).rgb);
    float e = abs(l1 - l2) + abs(l3 - l4) + abs(l5 - l6) + abs(l7 - l8);
    e = clamp(e * uEdgeStrength, 0.0, 1.0);
    return smoothstep(uEdgeLow, uEdgeHigh, e);
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    if (progress <= 0.001) { outputColor = inputColor; return; }

    // 종이 흔들림 — 16fps 계단 시간으로 손그림 떨림
    float t = floor(uTime * 16.0) / 16.0;
    vec2 warp = vec2(sin(uv.y * 70.0 + t * 3.0) * uWarp, sin(uv.x * 70.0 + t * 4.1) * uWarp);
    vec2 suv = uv + warp;
    vec2 px = uTexel;

    // 다중 스트로크 — 같은 엣지를 위상차 3곳에서 떠서 겹친다 (손으로 여러 번 그은 윤곽).
    float jit = (skHash(uv * 900.0 + t) - 0.5) * uLineOffset;
    vec2 o0 = vec2(uLineOffset * sin(uLinePeriod * uv.y + 0.000) + jit, uLineOffset * sin(uLinePeriod * uv.x + 0.000) + jit);
    vec2 o1 = vec2(uLineOffset * sin(uLinePeriod * uv.y + 1.047) + jit, uLineOffset * sin(uLinePeriod * uv.x + 3.142) + jit);
    vec2 o2 = vec2(uLineOffset * sin(uLinePeriod * uv.y + 2.094) + jit, uLineOffset * sin(uLinePeriod * uv.x + 1.571) + jit);
    float e0 = skEdgeAt(suv + o0, px);
    float e1 = skEdgeAt(suv + o1, px);
    float e2 = skEdgeAt(suv + o2, px);
    float edge = max(max(e0, e1), e2);   // 세 스트로크 합집합 → 겹친 다중 라인 (offset=0이면 단일)

    // --- 스케치 음영: 종이색 위에 휘도로 연필 톤 ---
    float l = skLum(texture2D(inputBuffer, suv).rgb);
    float shade = smoothstep(uShadeLow, uShadeHigh, l);
    vec3 toned = mix(uPaper * uShadowMul, uPaper, shade);
    float grain = (skHash(floor(uv / max(px.x, 1e-5) * 0.5) + t) - 0.5) * uGrain;
    toned += grain;

    vec3 sketch = mix(toned, uInk, edge);
    outputColor = vec4(mix(inputColor.rgb, sketch, progress), inputColor.a);
  }
`

export class SketchEffectImpl extends Effect {
  constructor() {
    super('SketchEffect', fragmentShader, {
      uniforms: new Map<string, Uniform>([
        ['progress', new Uniform(0)],
        ['uTime', new Uniform(0)],
        ['uTexel', new Uniform(new Vector2(1 / 1280, 1 / 720))],
        ['uEdgeStrength', new Uniform(10.9)],
        ['uEdgeLow', new Uniform(0.78)],
        ['uEdgeHigh', new Uniform(0.84)],
        ['uPaper', new Uniform(new Color('#eeede7'))],
        ['uInk', new Uniform(new Color('#343232'))],
        ['uShadeLow', new Uniform(0.2)],
        ['uShadeHigh', new Uniform(0.12)],
        ['uShadowMul', new Uniform(0.47)],
        ['uGrain', new Uniform(0.15)],
        ['uWarp', new Uniform(0.0012)],
        ['uLineOffset', new Uniform(0)],
        ['uLinePeriod', new Uniform(30)],
      ]),
    })
  }

  setProgress(v: number) { this.uniforms.get('progress')!.value = v }
  setTime(t: number) { this.uniforms.get('uTime')!.value = t }
  setTexel(x: number, y: number) { (this.uniforms.get('uTexel')!.value as Vector2).set(x, y) }

  /** dev 패널에서 라이브 조정한 룩 파라미터를 uniform에 반영 */
  setParams(p: SketchParams) {
    const u = this.uniforms
    u.get('uEdgeStrength')!.value = p.edgeStrength
    u.get('uEdgeLow')!.value = p.edgeLow
    u.get('uEdgeHigh')!.value = p.edgeHigh
    u.get('uShadeLow')!.value = p.shadeLow
    u.get('uShadeHigh')!.value = p.shadeHigh
    u.get('uShadowMul')!.value = p.shadowMul
    u.get('uGrain')!.value = p.grain
    u.get('uWarp')!.value = p.warp
    u.get('uLineOffset')!.value = p.lineOffset
    u.get('uLinePeriod')!.value = p.linePeriod
    ;(u.get('uPaper')!.value as Color).set(p.paper)
    ;(u.get('uInk')!.value as Color).set(p.ink)
  }

  reset() { this.uniforms.get('progress')!.value = 0 }
}

export const SketchEffect = forwardRef<SketchEffectImpl>((_props, ref) => {
  const effect = useMemo(() => new SketchEffectImpl(), [])
  const size = useThree((s) => s.size)
  useEffect(() => {
    effect.setTexel(1 / size.width, 1 / size.height)
  }, [effect, size])
  return <primitive ref={ref} object={effect} dispose={null} />
})
SketchEffect.displayName = 'SketchEffect'
