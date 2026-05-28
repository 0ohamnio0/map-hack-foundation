import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BlendFunction, Effect } from 'postprocessing'
import * as THREE from 'three'

// ─── VFX-JS demo shader ported to a postprocessing Effect ───────────────────
// Original: https://amagi.dev/vfx-js (light + shadow + spectrum from mouse).
// In the demo the "occluder" is the h1 text (white pixels). Here we use the
// previous pass's bright pixels — i.e. an HDR mesh like SkyBeyondDoor — as the
// occluder. Ray-marches from each pixel toward the door projection, accumulating
// bright samples; that accumulation drives the rainbow streaks + shadow.
//
// Tunables (all magic numbers inline-commented in the shader below):
//   - LSR_SAMPLES: ray march resolution (perf vs. streak smoothness)
//   - occluder threshold: how bright a pixel must be to count as a light source
//   - light baseline cut: drops the dim halo so dark scenes stay dark
//   - effectMask threshold: how much occluder accumulation triggers the painting
//   - rainbow amplitude/frequency: streak intensity + hue cycling speed
const LSR_FRAGMENT = `
uniform vec2 doorUv;
uniform float intensity;

#define LSR_PI 3.141593
#define LSR_SAMPLES 24.

float lsrHash3(vec3 p) {
  return fract(sin(dot(p, vec3(489., 589., 58.))) * 492.) * 2. - 1.;
}
vec2 lsrRand2(vec3 p) {
  float h = lsrHash3(p);
  return vec2(h, fract(h * 7.31) * 2. - 1.);
}
// Original VFX-JS spectrum — phase-offset cosines per channel.
vec3 lsrSpectrum(float x) {
  return cos((x - vec3(0., .5, 1.)) * vec3(.6, 1., .5) * LSR_PI);
}

// Occluder = bright scene pixel. The 0.9 threshold passes HDR sources (e.g.
// SkyBeyondDoor's [3,3,3] toneMapped-false plane clamps to ~1.0 in SDR) while
// rejecting normally-lit walls (sub-1.0 after lighting).
float lsrOccluder(vec2 uv) {
  vec3 c = texture2D(inputBuffer, uv).rgb;
  return step(0.9, max(max(c.r, c.g), c.b));
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // Pass occluder pixels through unchanged so the light box stays crisp.
  if (lsrOccluder(uv) > 0.5) {
    outputColor = vec4(inputColor.rgb, 1.0);
    return;
  }

  float aspect = resolution.x / resolution.y;
  vec2 p = uv * 2. - 1.;
  p.x *= aspect;

  // Source = projected door position (set per-frame from JS).
  vec2 dp = doorUv * 2. - 1.;
  dp.x *= aspect;

  // Ray march from current pixel toward the door, sampling the occluder.
  vec2 rp = p;
  vec2 d = (dp - p) / LSR_SAMPLES;
  float acc = 0.;
  for (float i = 0.; i < LSR_SAMPLES; i++) {
    rp += d;
    rp += lsrRand2(vec3(rp, i)) * 0.5 / LSR_SAMPLES;
    vec2 uv2 = rp;
    uv2.x /= aspect;
    uv2 = uv2 * 0.5 + 0.5;
    acc += lsrOccluder(uv2) / LSR_SAMPLES;
  }

  float lm = length(p - dp);
  // Raw radial falloff: ~0.6 at the edges (baseline gray on dark scenes).
  float light = smoothstep(0., 1., pow(.1 / lm, .2));
  // Baseline cut — 0.55 below = black, 0.95 above = full. Keeps the dark scene
  // dark and confines the visible halo to the immediate vicinity of the door.
  light = smoothstep(0.55, 0.95, light);

  vec4 c = vec4(light);
  c -= acc;                                          // shadow streaks
  c += vec4(lsrSpectrum(cos(acc * 3.5)), 1.0) * acc * 2.5;  // rainbow (3.5 hue freq, 2.5 amplitude)
  c -= lsrHash3(vec3(uv, 0.0)) * 0.01;               // dither

  // Effect only paints where the ray to the door actually crossed the bright
  // light area (acc > 0). Door closed = ray never hits occluder = no effect.
  // Door cracked open (one vertical slit visible) = only that thin region
  // contributes acc, so only that slit + its shadow gets painted. 0.04 is the
  // smallest 1-sample contribution (1/24 ≈ 0.042) — anything dimmer stays clean.
  float effectMask = smoothstep(0.0, 0.04, acc);
  outputColor.rgb = inputColor.rgb + c.rgb * effectMask * intensity;
  outputColor.a = 1.0;
}
`

export class LightShadowRainbowEffect extends Effect {
  constructor() {
    super('LightShadowRainbowEffect', LSR_FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['doorUv', new THREE.Uniform(new THREE.Vector2(0.5, 0.5))],
        ['intensity', new THREE.Uniform(0.0)],
      ]),
    })
  }

  setDoorUv(x: number, y: number) {
    const u = this.uniforms.get('doorUv')!.value as THREE.Vector2
    u.set(x, y)
  }

  setIntensity(v: number) {
    this.uniforms.get('intensity')!.value = v
  }
}

type Props = {
  /** World-space center of the bright source (e.g. SkyBeyondDoor center). */
  source: THREE.Vector3
  /** 0 → effect off, 1 → full. Typically driven by chapter progress. */
  progress: number
}

/** R3F wrapper: projects the 3D source to screen UV each frame and drives the
 *  intensity uniform from progress. */
export const LightShadowRainbow = forwardRef<LightShadowRainbowEffect, Props>(
  ({ source, progress }, ref) => {
    const effect = useMemo(() => new LightShadowRainbowEffect(), [])
    useImperativeHandle(ref, () => effect, [effect])

    // Per-instance scratch vector — avoids module-level mutable state.
    const tmp = useRef(new THREE.Vector3())

    useFrame(({ camera }) => {
      tmp.current.copy(source).project(camera)
      const x = (tmp.current.x + 1) * 0.5
      const y = (tmp.current.y + 1) * 0.5
      effect.setDoorUv(x, y)
    })

    useEffect(() => {
      effect.setIntensity(progress > 0 ? 1.0 : 0.0)
    }, [effect, progress])

    return <primitive object={effect} />
  },
)
LightShadowRainbow.displayName = 'LightShadowRainbow'
