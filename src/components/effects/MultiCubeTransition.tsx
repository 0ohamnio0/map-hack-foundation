/**
 * REF-12: Multi Cube — CH.1→CH.2 챕터 전환 문 연출
 * 와이어프레임 큐브가 회전하며 열리고, 안으로 빨려 들어가는 전환.
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
  uniform float pitch;
  uniform float yaw;
  uniform float cubeScale;
  uniform float zoom;
  uniform float brightness;
  uniform float lineWidth;

  #define PI 3.14159265359

  mat3 rotateX(float a) {
    float c = cos(a), s = sin(a);
    return mat3(1,0,0, 0,c,-s, 0,s,c);
  }
  mat3 rotateY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c,0,s, 0,1,0, -s,0,c);
  }

  // Distance to a wireframe cube edge
  float cubeDist(vec3 p, float size) {
    vec3 d = abs(p) - vec3(size);
    // distance to edges
    float ex = max(d.y, d.z);
    float ey = max(d.x, d.z);
    float ez = max(d.x, d.y);
    return min(min(
      length(max(vec2(ex, d.x), 0.0)),
      length(max(vec2(ey, d.y), 0.0))),
      length(max(vec2(ez, d.z), 0.0))
    );
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - resolution * 0.5) / min(resolution.x, resolution.y);
    uv *= mix(1.0, 0.3, zoom);

    vec3 ro = vec3(0.0, 0.0, -2.5);
    vec3 rd = normalize(vec3(uv, 1.0));

    mat3 rx = rotateX((pitch - 0.5) * PI);
    mat3 ry = rotateY((yaw - 0.5) * PI * 2.0);
    rd = ry * rx * rd;
    ro = ry * rx * ro;

    float minDist = 1e10;
    // March along ray, find closest point to cube edges
    for (int i = 0; i < 64; i++) {
      float t = float(i) * 0.08;
      vec3 p = ro + rd * t;
      float d = cubeDist(p, cubeScale);
      minDist = min(minDist, d);
    }

    float edge = 1.0 - smoothstep(0.0, lineWidth, minDist);
    vec3 col = vec3(edge) * brightness;

    gl_FragColor = vec4(col, edge * brightness * 10.0);
  }
`

interface MultiCubeProps {
  /** Progress 0→1 over the transition duration */
  progress: number
  /** Callback when transition visual is complete */
  onComplete?: () => void
}

export function MultiCubeTransition({ progress, onComplete }: MultiCubeProps) {
  const { size } = useThree()
  const meshRef = useRef<THREE.Mesh>(null)
  const completed = useRef(false)

  const uniforms = useMemo(() => ({
    time: { value: 0 },
    resolution: { value: new THREE.Vector2(size.width, size.height) },
    pitch: { value: 0.5 },
    yaw: { value: 0.5 },
    cubeScale: { value: 0.8 },
    zoom: { value: 0.0 },
    brightness: { value: 0.0 },
    lineWidth: { value: 0.015 },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  useFrame((_, delta) => {
    uniforms.time.value += delta
    uniforms.resolution.value.set(size.width, size.height)

    const p = progress

    if (p < 0.25) {
      // 0~25%: fade in cube
      const t = p / 0.25
      uniforms.brightness.value = t * 0.1
      uniforms.yaw.value = 0.5
      uniforms.zoom.value = 0
      uniforms.cubeScale.value = 0.8
    } else if (p < 0.75) {
      // 25~75%: rotate + zoom in
      const t = (p - 0.25) / 0.5
      uniforms.brightness.value = 0.1
      uniforms.yaw.value = 0.5 + t * 0.3
      uniforms.zoom.value = t
      uniforms.cubeScale.value = 0.8
    } else {
      // 75~100%: brighten + shrink → through the cube
      const t = (p - 0.75) / 0.25
      uniforms.brightness.value = 0.1 + t * 0.06
      uniforms.cubeScale.value = 0.8 - t * 0.7
      uniforms.zoom.value = 1.0
      uniforms.yaw.value = 0.8

      if (t >= 1 && !completed.current) {
        completed.current = true
        onComplete?.()
      }
    }
  })

  return (
    <mesh ref={meshRef} renderOrder={998}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        depthWrite={false}
        depthTest={false}
        transparent
      />
    </mesh>
  )
}
