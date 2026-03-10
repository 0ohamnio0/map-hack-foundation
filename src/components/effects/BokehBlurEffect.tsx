/**
 * REF-15: Bokeh Disc+ — NPC 시선 밖 보케 블러
 * Dot product mapping:
 *   직면 응시 (dot=1): amount 0, intensity 1 (선명)
 *   시선 빗나감 (dot<0.7): amount 0.05, intensity 1.5
 *   완전 등짐 (dot<0.3): amount 0.15, intensity 2.0
 *   블랙독 특수 NPC: amount 0.2, intensity 3.0
 */
import { forwardRef, useMemo } from 'react'
import { Effect } from 'postprocessing'
import { Uniform } from 'three'

const fragmentShader = /* glsl */ `
  uniform float amount;
  uniform float bokehIntensity;

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    if (amount < 0.001) {
      outputColor = inputColor;
      return;
    }

    vec2 texel = vec2(1.0) / vec2(textureSize(inputBuffer, 0));
    vec3 col = vec3(0.0);
    float totalWeight = 0.0;

    // Bokeh disc sampling — 2 rings
    const int SAMPLES = 16;
    for (int i = 0; i < SAMPLES; i++) {
      float angle = float(i) * 6.28318 / float(SAMPLES);
      // Ring 1
      vec2 offset1 = vec2(cos(angle), sin(angle)) * amount * 8.0;
      vec4 s1 = texture2D(inputBuffer, uv + offset1 * texel);
      float w1 = 1.0 + max(0.0, dot(s1.rgb, vec3(0.299, 0.587, 0.114)) - 0.5) * bokehIntensity;
      col += s1.rgb * w1;
      totalWeight += w1;

      // Ring 2 (half radius)
      vec2 offset2 = vec2(cos(angle), sin(angle)) * amount * 4.0;
      vec4 s2 = texture2D(inputBuffer, uv + offset2 * texel);
      float w2 = 1.0 + max(0.0, dot(s2.rgb, vec3(0.299, 0.587, 0.114)) - 0.5) * bokehIntensity * 0.5;
      col += s2.rgb * w2;
      totalWeight += w2;
    }

    // Center sample
    float wc = 1.0;
    col += inputColor.rgb * wc;
    totalWeight += wc;

    col /= totalWeight;
    outputColor = vec4(col, inputColor.a);
  }
`

export class BokehBlurEffectImpl extends Effect {
  constructor() {
    super('BokehBlurEffect', fragmentShader, {
      uniforms: new Map([
        ['amount', new Uniform(0)],
        ['bokehIntensity', new Uniform(1)],
      ]),
    })
  }

  setParams(amount: number, intensity: number) {
    this.uniforms.get('amount')!.value = amount
    this.uniforms.get('bokehIntensity')!.value = intensity
  }

  reset() {
    this.uniforms.get('amount')!.value = 0
    this.uniforms.get('bokehIntensity')!.value = 1
  }
}

export const BokehBlurEffect = forwardRef<BokehBlurEffectImpl>((_props, ref) => {
  const effect = useMemo(() => new BokehBlurEffectImpl(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})
