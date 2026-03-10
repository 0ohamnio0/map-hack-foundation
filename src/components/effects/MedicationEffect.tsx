/**
 * REF-8: Glitch Morph + Dither — 일반 약 복용 이펙트
 * in(1.5s) → hold(3s) → out(2s) 사이클
 */
import { forwardRef, useMemo } from 'react'
import { Effect } from 'postprocessing'
import { Uniform } from 'three'

const fragmentShader = /* glsl */ `
  uniform float amount;
  uniform float strength;
  uniform float xGain;
  uniform float yGain;
  uniform float errorCarry;
  uniform float colorize;
  uniform float ditherMix;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    // --- Layer 1: Glitch Morph ---
    vec4 ca = inputColor;
    vec2 oa;
    oa.x = ((ca.r + ca.b) - 1.0) * xGain;
    oa.y = ((ca.g + ca.b) - 1.0) * yGain;
    oa *= strength;
    vec4 morphed = texture2D(inputBuffer, uv + oa * amount);
    vec4 glitched = mix(ca, morphed, amount);

    // --- Layer 2: Dither ---
    float gray = dot(glitched.rgb, vec3(0.2126, 0.7152, 0.0722));
    float px = floor(gl_FragCoord.x / 2.0) + floor(gl_FragCoord.y / 2.0);
    float threshold = fract(sin(px * 12.9898) * 43758.5453);
    threshold = mix(0.5, threshold, errorCarry);
    float bit = gray >= threshold ? 1.0 : 0.0;
    vec4 dithered = vec4(bit, bit, bit, 1.0);
    dithered = mix(dithered, glitched * dithered, colorize);

    // --- Mix ---
    outputColor = mix(glitched, dithered, ditherMix);
  }
`

export class MedicationEffectImpl extends Effect {
  constructor() {
    super('MedicationEffect', fragmentShader, {
      uniforms: new Map([
        ['amount', new Uniform(0)],
        ['strength', new Uniform(0.15)],
        ['xGain', new Uniform(1.0)],
        ['yGain', new Uniform(1.0)],
        ['errorCarry', new Uniform(0.3)],
        ['colorize', new Uniform(0.0)],
        ['ditherMix', new Uniform(0.0)],
      ]),
    })
  }

  setPhase(t: number) {
    const u = this.uniforms
    if (t < 1.5) {
      // in: 0~1.5s
      const p = t / 1.5
      u.get('amount')!.value = p * 0.8
      u.get('strength')!.value = p * 0.15
      u.get('ditherMix')!.value = p * 0.6
      u.get('errorCarry')!.value = p * 0.4
    } else if (t < 4.5) {
      // hold: 1.5~4.5s
      u.get('amount')!.value = 0.8
      u.get('ditherMix')!.value = 0.6
      u.get('errorCarry')!.value = 0.4
    } else if (t < 6.5) {
      // out: 4.5~6.5s
      const p = 1 - (t - 4.5) / 2
      u.get('amount')!.value = p * 0.8
      u.get('ditherMix')!.value = p * 0.6
      u.get('errorCarry')!.value = p * 0.4
    } else {
      // done
      u.get('amount')!.value = 0
      u.get('ditherMix')!.value = 0
      u.get('errorCarry')!.value = 0
    }
  }

  reset() {
    const u = this.uniforms
    u.get('amount')!.value = 0
    u.get('ditherMix')!.value = 0
    u.get('errorCarry')!.value = 0
  }
}

export const MedicationEffect = forwardRef<MedicationEffectImpl>((_props, ref) => {
  const effect = useMemo(() => new MedicationEffectImpl(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})
