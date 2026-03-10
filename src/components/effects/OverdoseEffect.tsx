/**
 * REF-11: Key Frame Artifacts — 약 과다복용 이펙트
 * 한방향 악화, 회복 없음.
 * intensity 0→1(2s) → numColors 1→0.2(6s) → adaptRate→0(영구)
 */
import { forwardRef, useMemo } from 'react'
import { Effect } from 'postprocessing'
import { Uniform } from 'three'

const fragmentShader = /* glsl */ `
  uniform float adaptRate;
  uniform float numColors;
  uniform float intensity;

  vec3 cround(vec3 r) {
    return vec3(
      fract(r.r) < 0.5 ? floor(r.r) : ceil(r.r),
      fract(r.g) < 0.5 ? floor(r.g) : ceil(r.g),
      fract(r.b) < 0.5 ? floor(r.b) : ceil(r.b)
    );
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec4 glitched = inputColor;

    // posterize by numColors
    if (numColors < 1.0) {
      float sc = max(2.0, floor(pow(2.0, numColors * 8.0)));
      glitched.rgb = cround(glitched.rgb * sc) / sc;
    }

    // frame difference accumulation simulation
    vec2 blockUv = floor(uv * 16.0) / 16.0;
    float hash = fract(sin(dot(blockUv, vec2(12.9898, 78.233))) * 43758.5453);
    float blockShift = (hash - 0.5) * 0.05 * intensity * (1.0 - adaptRate);
    vec4 shifted = texture2D(inputBuffer, uv + vec2(blockShift, blockShift * 0.5));

    // mix shifted blocks with glitched
    glitched = mix(glitched, shifted, intensity * (1.0 - adaptRate));

    // color channel separation on high intensity
    if (intensity > 0.5) {
      float sep = (intensity - 0.5) * 0.02 * (1.0 - adaptRate);
      glitched.r = texture2D(inputBuffer, uv + vec2(sep, 0.0)).r;
      glitched.b = texture2D(inputBuffer, uv - vec2(sep, 0.0)).b;
    }

    // adaptRate blends back toward original
    glitched = mix(glitched, inputColor, adaptRate);

    // final intensity control
    outputColor = mix(inputColor, glitched, intensity);
  }
`

export class OverdoseEffectImpl extends Effect {
  constructor() {
    super('OverdoseEffect', fragmentShader, {
      uniforms: new Map([
        ['adaptRate', new Uniform(0.3)],
        ['numColors', new Uniform(1.0)],
        ['intensity', new Uniform(0.0)],
      ]),
    })
  }

  /** Call each frame with elapsed time since overdose trigger */
  setPhase(t: number) {
    const u = this.uniforms
    if (t < 2) {
      // 0~2s: intensity ramps up
      u.get('intensity')!.value = t / 2
      u.get('numColors')!.value = 1.0
      u.get('adaptRate')!.value = 0.3
    } else if (t < 8) {
      // 2~8s: numColors degrades, adaptRate drops
      u.get('intensity')!.value = 1.0
      u.get('numColors')!.value = 1.0 - ((t - 2) / 6) * 0.8
      u.get('adaptRate')!.value = 0.3 - ((t - 2) / 6) * 0.25
    } else {
      // 8s+: permanent degradation
      u.get('intensity')!.value = 1.0
      u.get('numColors')!.value = 0.2
      u.get('adaptRate')!.value = Math.max(0, 0.05 - (t - 8) * 0.005)
    }
  }

  reset() {
    const u = this.uniforms
    u.get('intensity')!.value = 0
    u.get('numColors')!.value = 1.0
    u.get('adaptRate')!.value = 0.3
  }
}

export const OverdoseEffect = forwardRef<OverdoseEffectImpl>((_props, ref) => {
  const effect = useMemo(() => new OverdoseEffectImpl(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})
