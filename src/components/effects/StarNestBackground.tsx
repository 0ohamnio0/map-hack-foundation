/**
 * REF-7: Star Nest — CH.3 엘리베이터 우주 배경
 * StepsLimit 카운팅(0→20→20→0) + tile 화이트아웃
 */
import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform float time;
  uniform vec2 resolution;
  uniform float stepsLimit;
  uniform float formuparam;
  uniform float stepsize;
  uniform float iterationLimit;
  uniform float zoom;
  uniform float tile;
  uniform float speed;
  uniform float ZM;
  uniform float brightness;
  uniform float darkmatter;
  uniform float distfading;
  uniform float saturation;

  void main() {
    vec2 uv = gl_FragCoord.xy / resolution.xy - 0.5;
    uv.y *= resolution.y / resolution.x;
    vec3 dir = vec3(uv * zoom, 1.0);
    float t = time * speed + 0.25;

    float a1 = 0.5;
    float a2 = 0.8;
    mat2 rot1 = mat2(cos(a1), sin(a1), -sin(a1), cos(a1));
    mat2 rot2 = mat2(cos(a2), sin(a2), -sin(a2), cos(a2));
    dir.xz *= rot1;
    dir.xy *= rot2;

    vec3 from = vec3(1.0, 0.5, 0.5);
    from += vec3(0.0, 0.0, t * ZM * -5.0);
    from.xz *= rot1;
    from.xy *= rot2;

    float s = 0.1, fade = 1.0;
    vec3 v = vec3(0.0);

    for (int r = 0; r < 20; r++) {
      if (float(r) > stepsLimit) break;

      vec3 p = from + s * dir * 0.5;
      p = abs(vec3(tile) - mod(p, vec3(tile * 2.0)));

      float pa = 0.0, a = 0.0;
      for (int i = 0; i < 20; i++) {
        if (float(i) > iterationLimit) break;
        p = abs(p) / dot(p, p) - formuparam;
        a += abs(length(p) - pa);
        pa = length(p);
      }

      float dm = max(0.0, darkmatter * 10.0 - a * a * 0.001);
      a *= a * a;
      if (r > 6) fade *= 1.0 - dm;

      v += fade;
      v += vec3(s, s*s, s*s*s*s) * a * brightness * fade;
      fade *= 1.0 - distfading;
      s += stepsize;
    }

    v = mix(vec3(length(v)), v, saturation);
    gl_FragColor = vec4(v * 0.01, 1.0);
  }
`

interface StarNestProps {
  /** Total duration in seconds (default 30) */
  duration?: number
}

export function StarNestBackground({ duration = 30 }: StarNestProps) {
  const { size } = useThree()
  const meshRef = useRef<THREE.Mesh>(null)
  const elapsed = useRef(0)

  const uniforms = useMemo(() => ({
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(size.width, size.height) },
    stepsLimit: { value: 0 },
    formuparam: { value: 0.67 },
    stepsize: { value: 0.12 },
    iterationLimit: { value: 9.0 },
    zoom: { value: 5.71 },
    tile: { value: 1.27 },
    speed: { value: 0.01 },
    ZM: { value: -0.5 },
    brightness: { value: 0.08 },
    darkmatter: { value: 0.41 },
    distfading: { value: 0.64 },
    saturation: { value: 0.85 },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  useFrame((_, delta) => {
    elapsed.current += delta
    const t = elapsed.current
    const inEnd = duration * 0.2    // 6s for 30s
    const outStart = duration * 0.8 // 24s for 30s

    if (t < inEnd) {
      // In: stars appear one by one
      uniforms.stepsLimit.value = Math.min(Math.floor(t / (inEnd / 20)), 20)
    } else if (t < outStart) {
      // Hold: full universe
      uniforms.stepsLimit.value = 20
      uniforms.ZM.value = THREE.MathUtils.lerp(uniforms.ZM.value, 0, delta * 0.1)
    } else if (t < duration) {
      // Out: stars disappear + tile whiteout
      const outProgress = (t - outStart) / (duration - outStart)
      uniforms.stepsLimit.value = Math.max(20 - Math.floor(outProgress * 20), 0)
      uniforms.tile.value = THREE.MathUtils.lerp(1.27, 5.0, outProgress)
    } else {
      uniforms.stepsLimit.value = 0
    }

    uniforms.time.value = t
    uniforms.resolution.value.set(size.width, size.height)
  })

  return (
    <mesh ref={meshRef} renderOrder={-1}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
      />
    </mesh>
  )
}
