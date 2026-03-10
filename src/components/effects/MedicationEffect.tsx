/**
 * REF-8: Per-medicine visual effects
 * Each drug type has a unique GLSL shader:
 * - 기분안정제 (desaturate): grayscale + grid overlay
 * - 항정신병약 (blur): gaussian blur + vignette
 * - 수면제 (darken): chromatic aberration + dimming
 * - 항불안제 (anxiolytic): wave distortion + color shift
 * - 다 먹음 (whiteflash): screen whiteout
 *
 * Phase: in(1.5s) → hold(duration-3s) → out(1.5s)
 */
import { forwardRef, useMemo } from 'react'
import { Effect } from 'postprocessing'
import { Uniform } from 'three'

const fragmentShader = /* glsl */ `
  uniform float intensity;
  uniform float effectType; // 0=desaturate, 1=blur, 2=darken, 3=anxiolytic, 4=whiteflash

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    int etype = int(effectType + 0.5);

    if (etype == 0) {
      // 기분안정제: desaturate + grid overlay
      float gray = dot(inputColor.rgb, vec3(0.299, 0.587, 0.114));
      vec3 desaturated = mix(inputColor.rgb, vec3(gray), 0.7 * intensity);
      float gridX = step(0.97, fract(uv.x * 40.0));
      float gridY = step(0.97, fract(uv.y * 40.0));
      vec3 result = desaturated * (1.0 - (gridX + gridY) * 0.2 * intensity);
      outputColor = vec4(result, inputColor.a);

    } else if (etype == 1) {
      // 항정신병약: 9-tap blur + vignette
      vec2 texel = vec2(1.0) / vec2(textureSize(inputBuffer, 0));
      vec3 col = vec3(0.0);
      for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
          col += texture2D(inputBuffer, uv + vec2(float(x), float(y)) * texel * 4.0 * intensity).rgb;
        }
      }
      col /= 9.0;
      float d = distance(uv, vec2(0.5));
      col *= 1.0 - d * 1.4 * intensity;
      outputColor = vec4(mix(inputColor.rgb, col, intensity), 1.0);

    } else if (etype == 2) {
      // 수면제: chromatic aberration + dimming
      float offset = 0.004 * intensity;
      float r = texture2D(inputBuffer, uv + vec2(offset, 0.0)).r;
      float g = texture2D(inputBuffer, uv).g;
      float b = texture2D(inputBuffer, uv - vec2(offset, 0.0)).b;
      vec3 col = vec3(r, g, b) * (1.0 - 0.45 * intensity);
      outputColor = vec4(col, 1.0);

    } else if (etype == 3) {
      // 항불안제: wave distortion + warm color shift
      float wave = sin(uv.y * 30.0 + intensity * 10.0) * 0.003 * intensity;
      vec2 distorted = uv + vec2(wave, wave * 0.5);
      vec4 col = texture2D(inputBuffer, distorted);
      col.r *= 1.0 + 0.15 * intensity;
      col.b *= 1.0 - 0.1 * intensity;
      outputColor = vec4(mix(inputColor.rgb, col.rgb, intensity), 1.0);

    } else {
      // 다 먹음: whiteflash
      outputColor = vec4(mix(inputColor.rgb, vec3(1.0), intensity), 1.0);
    }
  }
`

export class MedicationEffectImpl extends Effect {
  constructor() {
    super('MedicationEffect', fragmentShader, {
      uniforms: new Map([
        ['intensity', new Uniform(0)],
        ['effectType', new Uniform(0)],
      ]),
    })
  }

  /** Set the drug effect type: 0=desaturate, 1=blur, 2=darken, 3=anxiolytic, 4=whiteflash */
  setEffectType(type: number) {
    this.uniforms.get('effectType')!.value = type
  }

  /** Drive the in→hold→out envelope */
  setPhase(t: number, totalDuration = 6.5) {
    const fadeIn = 1.5
    const fadeOut = 1.5
    const holdEnd = totalDuration - fadeOut
    const u = this.uniforms

    if (t < fadeIn) {
      u.get('intensity')!.value = t / fadeIn
    } else if (t < holdEnd) {
      u.get('intensity')!.value = 1.0
    } else if (t < totalDuration) {
      u.get('intensity')!.value = 1 - (t - holdEnd) / fadeOut
    } else {
      u.get('intensity')!.value = 0
    }
  }

  reset() {
    this.uniforms.get('intensity')!.value = 0
  }
}

export const MedicationEffect = forwardRef<MedicationEffectImpl>((_props, ref) => {
  const effect = useMemo(() => new MedicationEffectImpl(), [])
  return <primitive ref={ref} object={effect} dispose={null} />
})
