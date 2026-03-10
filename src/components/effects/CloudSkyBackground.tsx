/**
 * REF-9: 2D Clouds+ — CH.2 프로시저럴 구름 하늘 배경
 * FBM simplex noise 구름. skycolor props로 분위기 전환.
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
  uniform float cloudscale;
  uniform float cloudcover;
  uniform float cloudlight;
  uniform float clouddark;
  uniform float cloudalpha;
  uniform float skytint;
  uniform vec3 skycolor1;
  uniform vec3 skycolor2;
  uniform float detail;
  uniform float warp;

  const float speed = 0.03;
  const mat2 m = mat2(1.6, 1.2, -1.2, 1.6);

  vec2 hash(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise(vec2 p) {
    const float K1 = 0.366025404;
    const float K2 = 0.211324865;
    vec2 i = floor(p + (p.x + p.y) * K1);
    vec2 a = p - i + (i.x + i.y) * K2;
    vec2 o = (a.x > a.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
    vec2 b = a - o + K2;
    vec2 c = a - 1.0 + 2.0 * K2;
    vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
    vec3 n = h * h * h * h * vec3(dot(a, hash(i)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
    return dot(n, vec3(70.0));
  }

  float fbm(vec2 n) {
    float total = 0.0, amplitude = 0.1;
    for (int i = 0; i < 8; i++) {
      if (float(i) > detail * 8.0) break;
      total += noise(n) * amplitude;
      n = m * n;
      amplitude *= 0.4;
    }
    return total;
  }

  void main() {
    float cs = (1.0 - cloudscale + 0.001) * 40.0;
    float cc = cloudcover * 8.0;
    float cd = 1.0 - clouddark;
    float ca = cloudalpha * 80.0;

    vec2 p = gl_FragCoord.xy / resolution;
    vec2 uv = vec2(0.5) - p * vec2(resolution.x / resolution.y, 1.0);
    float t = time * speed;
    float q = fbm(uv * cs * warp);

    // Layer 1: base cloud
    float r = 0.0;
    vec2 uv1 = uv * cs - q + t;
    float weight = 0.8;
    for (int i = 0; i < 8; i++) {
      if (float(i) > detail * 8.0) break;
      r += abs(weight * noise(uv1));
      uv1 = m * uv1 + t;
      weight *= 0.7;
    }

    // Layer 2: detail
    float f = 0.0;
    vec2 uv2 = uv * cs - q + t;
    weight = 0.7;
    for (int i = 0; i < 8; i++) {
      if (float(i) > detail * 8.0) break;
      f += weight * noise(uv2);
      uv2 = m * uv2 + t;
      weight *= 0.6;
    }
    f *= (r + f);

    // Layer 3+4: secondary clouds
    float c = 0.0;
    float t2 = time * speed * 2.0;
    vec2 uv3 = uv * cs * 2.0 - q + t2;
    weight = 0.4;
    for (int i = 0; i < 8; i++) {
      if (float(i) > detail * 8.0) break;
      c += weight * noise(uv3);
      uv3 = m * uv3 + t2;
      weight *= 0.6;
    }
    float c1 = 0.0;
    float t3 = time * speed * 3.0;
    vec2 uv4 = uv * cs * 3.0 - q + t3;
    weight = 0.4;
    for (int i = 0; i < 8; i++) {
      if (float(i) > detail * 8.0) break;
      c1 += abs(weight * noise(uv4));
      uv4 = m * uv4 + t3;
      weight *= 0.6;
    }
    c += c1;

    vec3 sky = mix(skycolor2, skycolor1, p.y);
    vec3 cloud = vec3(1.1, 1.1, 0.9) * clamp(cd + cloudlight * c, 0.0, 1.0);
    f = cc + ca * f * r;
    vec3 result = mix(sky, clamp(skytint * sky + cloud, 0.0, 1.0), clamp((f + c) / 2.0, 0.0, 1.0));

    gl_FragColor = vec4(result, 1.0);
  }
`

interface CloudSkyProps {
  skycolor1?: [number, number, number]
  skycolor2?: [number, number, number]
  cloudcover?: number
  clouddark?: number
}

export function CloudSkyBackground({
  skycolor1 = [0.2, 0.4, 0.6],
  skycolor2 = [0.4, 0.7, 1.0],
  cloudcover = 0.25,
  clouddark = 0.5,
}: CloudSkyProps) {
  const { size } = useThree()
  const meshRef = useRef<THREE.Mesh>(null)

  const uniforms = useMemo(() => ({
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(size.width, size.height) },
    cloudscale: { value: 0.95 },
    cloudcover: { value: cloudcover },
    cloudlight: { value: 0.5 },
    clouddark: { value: clouddark },
    cloudalpha: { value: 0.25 },
    skytint: { value: 0.5 },
    skycolor1: { value: new THREE.Vector3(...skycolor1) },
    skycolor2: { value: new THREE.Vector3(...skycolor2) },
    detail: { value: 1.0 },
    warp: { value: 0.5 },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  useFrame((_, delta) => {
    uniforms.time.value += delta
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
