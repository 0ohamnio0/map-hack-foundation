/**
 * REF-8: Per-medicine visual effects
 * Each drug type has a unique GLSL shader:
 * - Lithium Carbonate (desaturate slot): Solarize — HSV V 곡선 반전 + grayscale (VIDVOX ISF)
 * - Aripiprazole (blur slot): Random Freeze — random rect만 정상, 외부는 grayscale freeze (VIDVOX ISF simplified, persistent buffer 한계)
 * - Quetiapine Fumarate (darken slot): Replicate Random — 5 random zoom/pan layer averaged (VIDVOX ISF)
 * - Alprazolam (anxiolytic slot): Optical Flow Distort simplified — time-driven fbm flow noise distortion (VIDVOX ISF, multi-pass 원본을 single-pass로 근사)
 * - 다 먹음 (whiteflash): screen whiteout
 *
 * Phase: in(1.5s) → hold(duration-3s) → out(1.5s)
 */
import { forwardRef, useMemo } from 'react'
import { Effect } from 'postprocessing'
import { Uniform } from 'three'

const fragmentShader = /* glsl */ `
  uniform float intensity;
  uniform float effectType; // 0=Lithium Carbonate (Solarize), 1=blur, 2=darken, 3=anxiolytic, 4=whiteflash
  uniform float time;

  vec3 rgb2hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
    vec4 p = c.g < c.b ? vec4(c.bg, K.wz) : vec4(c.gb, K.xy);
    vec4 q = c.r < p.x ? vec4(p.xyw, c.r) : vec4(c.r, p.yzx);
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
  }
  vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
  }

  // Inigo Quilez value noise — for Broken LCD glitch mask
  float vhash(vec2 p, float seed) {
    p = 50.0 * fract(seed * 1.17921 + p * 0.3183099 + vec2(0.71, 0.113));
    return -1.0 + 2.0 * fract(p.x * p.y * (p.x + p.y));
  }
  float vnoise(vec2 p, float seed) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float v1 = mix(mix(vhash(i + vec2(0.0, 0.0), floor(seed)),
                       vhash(i + vec2(1.0, 0.0), floor(seed)), u.x),
                   mix(vhash(i + vec2(0.0, 1.0), floor(seed)),
                       vhash(i + vec2(1.0, 1.0), floor(seed)), u.x), u.y);
    float v2 = mix(mix(vhash(i + vec2(0.0, 0.0), ceil(seed)),
                       vhash(i + vec2(1.0, 0.0), ceil(seed)), u.x),
                   mix(vhash(i + vec2(0.0, 1.0), ceil(seed)),
                       vhash(i + vec2(1.0, 1.0), ceil(seed)), u.x), u.y);
    return mix(v1, v2, fract(seed));
  }
  float vrand(vec2 co) {
    return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
  }
  vec4 vrand4(vec4 co) {
    return vec4(vrand(co.rg), vrand(co.gb), vrand(co.ba), vrand(co.rb));
  }

  // Broken LCD — ISF defaults (해민 세팅 값)
  const float BL_glitchScale = 4.1013;
  const float BL_noiseSeed = 5.0863;
  const float BL_patternSeed = 2.3372;
  const float BL_glitchBrightness = 3.0;
  const float BL_glitchBrightnessCurve = 2.0;
  const float BL_glitchRadius = 0.5;
  const float BL_glitchSmoothness = 0.5;
  const float BL_tintBrightness = 4.0;
  const float BL_tintRadius = 0.226;
  const float BL_tintBrightnessCurve = 1.2606;
  const float BL_tintSeed = 0.0;
  const float BL_tintScale = 4.0;
  const float BL_rowGlitchLevel = 0.01;
  const float BL_rowFlickerLevel = 0.0;
  const float BL_rowGlitchSeed = 0.341;
  // flickerLevel=0, patternStyle=0, hardEdge=true, alphaMode=0 (Original)
  const vec4 BL_tintColor1 = vec4(0.902, 0.251, 0.251, 1.0);
  const vec4 BL_tintColor2 = vec4(0.251, 0.502, 0.902, 1.0);

  // ISF patternForType — 10 enum patterns
  vec4 patternForType(vec2 coord, int pType, vec2 res, vec2 normUV) {
    vec4 returnMe = vec4(0.0);
    int pt = pType;

    if (pt <= 2) {
      vec2 p = coord / res;
      vec2 uv = p * vec2(res.x / res.y, 1.0);
      float f = 0.0;
      if (BL_glitchSmoothness < 1.0) {
        float blockness = vrand(BL_noiseSeed * (floor(uv * (1.0 + BL_glitchScale * 50.0)) / (1.0 + BL_glitchScale * 50.0)));
        if (blockness > BL_glitchSmoothness) {
          uv = floor(uv * (1.0 + BL_glitchScale * 20.0)) / (1.0 + BL_glitchScale * 20.0);
        }
      }
      uv *= BL_glitchScale;
      mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
      f = 0.5 * vnoise(uv, BL_patternSeed); uv = m * uv;
      f += 0.25 * vnoise(uv, BL_patternSeed); uv = m * uv;
      f += 0.125 * vnoise(uv, BL_patternSeed); uv = m * uv;
      f += 0.0625 * vnoise(uv, BL_patternSeed);
      f = pow(max(f, 0.0), 0.5);
      float d = distance(normUV, vec2(0.5));
      if (d > BL_glitchRadius) f = f + (d - BL_glitchRadius);
      if (pt == 0) pt = 5 + int(min(f, 1.0) * 3.99);
      else if (pt == 1) pt = 3 + int(min(f, 1.0) * 3.99);
      else if (pt == 2) pt = 4 + int(f * 5.99);
    }

    if (pt == 3) {
      returnMe = vec4(0.0);
    } else if (pt == 4) {
      vec2 modCoord = res * vec2(vrand(BL_patternSeed * coord), vrand(BL_patternSeed * coord.yx));
      modCoord *= max(1.0 + BL_patternSeed, 1.00001);
      returnMe.r = (mod(modCoord.x + modCoord.y, 4.0) < 2.0) ? 1.0 : 0.0;
      returnMe.g = (mod(modCoord.x + modCoord.y, 5.0) < 2.0) ? 1.0 : 0.0;
      returnMe.b = (mod(modCoord.x + modCoord.y, 7.0) < 2.0) ? 1.0 : 0.0;
      returnMe.a = 1.0;
    } else if (pt == 5) {
      vec2 modCoord = (vrand(vec2(BL_patternSeed, coord.y)) < 0.25) ? coord : coord.yx;
      modCoord *= (1.0 + BL_patternSeed);
      returnMe.r = (mod(modCoord.x, 4.0) < 1.0) ? 1.0 : 0.0;
      returnMe.g = (mod(modCoord.x, 5.0) < 1.0) ? 1.0 : 0.0;
      returnMe.b = (mod(modCoord.x, 7.0) < 1.0) ? 1.0 : 0.0;
      returnMe.a = 1.0;
    } else if (pt == 6) {
      vec2 modCoord = coord;
      modCoord.x *= (1.0 + BL_patternSeed);
      modCoord *= (1.0 + BL_patternSeed);
      modCoord = mod(modCoord, res);
      returnMe.r = (mod(modCoord.x, 4.0) < 1.0) ? 1.0 : 0.0;
      returnMe.g = (mod(modCoord.x, 5.0) < 1.0) ? 1.0 : 0.0;
      returnMe.b = (mod(modCoord.x, 7.0) < 1.0) ? 1.0 : 0.0;
      returnMe.a = 1.0;
    } else if (pt == 7) {
      vec2 modCoord = coord;
      modCoord.y *= (1.0 + BL_patternSeed);
      modCoord = mod(modCoord, res);
      returnMe.r = (mod(modCoord.y, 4.0) < 1.0) ? 1.0 : 0.0;
      returnMe.g = (mod(modCoord.y, 5.0) < 1.0) ? 1.0 : 0.0;
      returnMe.b = (mod(modCoord.y, 7.0) < 1.0) ? 1.0 : 0.0;
      returnMe.a = 1.0;
    } else if (pt == 8) {
      vec2 modCoord = mod(coord * (1.0 + BL_patternSeed), 10.0);
      returnMe = (modCoord.x < 5.0) ? vec4(1.0) : vec4(0.0, 0.0, 0.0, 1.0);
    } else {
      vec2 modCoord = mod(coord * (1.0 + BL_patternSeed), 80.0);
      returnMe = vec4(0.9, 0.9, 0.9, 1.0);
      if ((modCoord.x < 40.0) && (modCoord.y < 40.0)) returnMe = vec4(0.5, 0.5, 0.5, 1.0);
      else if ((modCoord.x > 40.0) && (modCoord.y > 40.0)) returnMe = vec4(0.5, 0.5, 0.5, 1.0);
    }
    return returnMe;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    int etype = int(effectType + 0.5);

    if (etype == 0) {
      // Lithium Carbonate — Solarize (VIDVOX ISF). HSV V 곡선 반전, S 제거(grayscale)
      vec3 hsv = rgb2hsv(inputColor.rgb);
      float powerCurve = 1.0;
      float centerBrightness = 0.5;
      float V = pow(hsv.b, powerCurve);
      V = (V < centerBrightness) ? (1.0 - V / centerBrightness) : (V - centerBrightness) / centerBrightness;
      vec3 solar = hsv2rgb(vec3(hsv.r, 0.0, V));
      outputColor = vec4(mix(inputColor.rgb, solar, intensity), inputColor.a);

    } else if (etype == 1) {
      // Aripiprazole — Random Freeze (VIDVOX ISF) simplified — persistent buffer 없이 random rect만 정상, 외부는 grayscale freeze feel
      // 원본은 lastState PERSISTENT buffer로 진짜 freeze. single-pass에선 rect 안만 컬러 + 외부 dim grayscale로 분위기 근사
      float maxUpdateSize = 0.5;
      vec4 seeds1 = time * vec4(0.2123, 0.34517, 0.53428, 0.7431);
      vec4 randCoords;
      randCoords.r = vrand(seeds1.rg);
      randCoords.g = vrand(seeds1.gb);
      randCoords.b = vrand(seeds1.ba);
      randCoords.a = vrand(seeds1.rb);
      randCoords.zw *= maxUpdateSize;
      if (randCoords.x + randCoords.z > 1.0) randCoords.z = 1.0 - randCoords.x;
      if (randCoords.y + randCoords.w > 1.0) randCoords.w = 1.0 - randCoords.y;
      bool isInShape = (uv.x >= randCoords.x && uv.y >= randCoords.y && uv.x <= randCoords.x + randCoords.z && uv.y <= randCoords.y + randCoords.w);
      vec3 frozen;
      if (isInShape) {
        frozen = inputColor.rgb;
      } else {
        float gray = dot(inputColor.rgb, vec3(0.299, 0.587, 0.114));
        frozen = vec3(gray) * 0.45;
      }
      outputColor = vec4(mix(inputColor.rgb, frozen, intensity), inputColor.a);

    } else if (etype == 2) {
      // Quetiapine Fumarate — Replicate Random (VIDVOX ISF) — randomSeed=0.3316, repetitions=5
      vec2 res = vec2(textureSize(inputBuffer, 0));
      const float RR_randomSeed = 0.3316;
      vec3 sum = vec3(0.0);
      int valid = 0;
      for (int i = 0; i < 5; ++i) {
        float fi = float(i);
        vec2 tmpSeed = vec2((1.12 + fi) * RR_randomSeed + 1.37, (1.92 + fi) * RR_randomSeed + 1.37);
        float minZoomLevel = 4.0 / res.x;
        vec2 zSeed = tmpSeed * vec2(0.128, 9.21) + vec2(1.42, 2.17);
        vec2 cSeed1 = tmpSeed * vec2(0.436, 0.931) + vec2(2.76, 3.779);
        vec2 cSeed2 = tmpSeed * vec2(2.831, 2.173) + vec2(1.73, 6.256);
        float modZoom = 0.9 * vrand(zSeed);
        vec2 modCenter = res * vec2(vrand(cSeed1), vrand(cSeed2));
        float modPad = 0.5 * vrand(tmpSeed);
        modZoom = (modZoom < minZoomLevel) ? minZoomLevel : modZoom;
        // paddedZoomedPosition
        float zoomMult = 1.0 / modZoom;
        vec2 modifiedCenter = 2.0 * (1.0 + modPad) * modCenter / res - (1.0 + modPad);
        vec2 loc = uv;
        loc.x = loc.x * zoomMult + modPad / 2.0 - modifiedCenter.x;
        loc.y = loc.y * zoomMult + modPad / 2.0 - modifiedCenter.y;
        loc.x = mod(loc.x, 1.0 + modPad) - modPad / 2.0;
        loc.y = mod(loc.y, 1.0 + modPad) - modPad / 2.0;
        if (loc.x >= 0.0 && loc.x <= 1.0 && loc.y >= 0.0 && loc.y <= 1.0) {
          sum += texture2D(inputBuffer, loc).rgb;
          valid++;
        }
      }
      vec3 replicated = (valid > 0) ? sum / float(valid) : inputColor.rgb;
      outputColor = vec4(mix(inputColor.rgb, replicated, intensity), inputColor.a);

    } else if (etype == 3) {
      // Alprazolam — Optical Flow Distort (VIDVOX ISF) — simplified single-pass (time-driven fbm flow)
      // amt=0.5, inputScale=2 (ISF defaults). Real motion mask 대신 time-animated fbm noise로 flow 근사
      vec2 flowUV = uv * 4.0 + vec2(time * 0.3, time * 0.21);
      mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
      float nx = 0.5 * vnoise(flowUV, time * 0.1); flowUV = m * flowUV;
      nx += 0.25 * vnoise(flowUV, time * 0.1);
      vec2 flowUV2 = uv * 4.0 + vec2(time * 0.27 + 13.7, time * 0.19 + 7.3);
      float ny = 0.5 * vnoise(flowUV2, time * 0.1 + 5.0); flowUV2 = m * flowUV2;
      ny += 0.25 * vnoise(flowUV2, time * 0.1 + 5.0);
      vec2 blurAmount = vec2(nx, ny) * 2.0; // inputScale=2
      float amt = 0.5;

      vec2 t0 = clamp(uv + blurAmount * amt, 0.0, 1.0);
      vec4 sample0 = texture2D(inputBuffer, t0);
      vec2 t1 = clamp(uv + 0.02 + blurAmount * amt * amt, 0.0, 1.0);
      vec4 sample1 = texture2D(inputBuffer, t1);
      vec4 distorted = (sample0 * 3.0 + sample1) / 4.0;
      outputColor = vec4(mix(inputColor.rgb, distorted.rgb, intensity), inputColor.a);

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
        ['time', new Uniform(0)],
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

    u.get('time')!.value = t

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

  /** Hold envelope — fade in(1.5s) → ghost 만날 때까지 full hold → 만나면 fade out(1.5s).
   *  releasing = encounter 발생, releaseElapsed = encounter 후 경과 초 */
  setHoldPhase(elapsed: number, releasing: boolean, releaseElapsed: number) {
    const fadeIn = 1.5
    const fadeOut = 1.5
    const u = this.uniforms
    u.get('time')!.value = elapsed
    if (releasing) {
      u.get('intensity')!.value = Math.max(1 - releaseElapsed / fadeOut, 0)
    } else {
      u.get('intensity')!.value = Math.min(elapsed / fadeIn, 1)
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
