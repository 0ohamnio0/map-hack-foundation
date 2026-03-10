/**
 * REF-10: Video Heightfield — CH.1 플래시백
 * 영상 luminance → raymarched 3D heightfield.
 *
 * 에셋 대기 중 — stub: 프로시저럴 노이즈 텍스처 사용.
 * 영상 도착 시 videoSrc prop만 교체하면 됨.
 */
import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D sourceTex;
  uniform vec2 resolution;
  uniform float maxHeight;
  uniform float slices;
  uniform float overdrive;
  uniform vec3 camPos;
  uniform vec2 camRot;
  uniform float time;
  uniform float opacity;

  #define TWOPI 6.28318530718

  vec3 rotateX(vec3 p, float a) {
    float sa = sin(a), ca = cos(a);
    return vec3(p.x, ca*p.y - sa*p.z, sa*p.y + ca*p.z);
  }
  vec3 rotateY(vec3 p, float a) {
    float sa = sin(a), ca = cos(a);
    return vec3(ca*p.x + sa*p.z, p.y, -sa*p.x + ca*p.z);
  }

  bool intersectBox(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out float tnear, out float tfar) {
    vec3 invR = 1.0 / rd;
    vec3 tbot = invR * (bmin - ro);
    vec3 ttop = invR * (bmax - ro);
    vec3 tmin = min(ttop, tbot);
    vec3 tmax = max(ttop, tbot);
    vec2 t0 = max(tmin.xx, tmin.yz);
    tnear = max(t0.x, t0.y);
    t0 = min(tmax.xx, tmax.yz);
    tfar = min(t0.x, t0.y);
    return tnear <= tfar;
  }

  float luminance(vec2 uv) {
    return dot(texture2D(sourceTex, uv).xyz, vec3(0.33));
  }

  vec2 worldToTex(vec3 p) {
    vec2 uv = p.xz * 0.5 + 0.5;
    uv.y = 1.0 - uv.y;
    return uv;
  }

  void main() {
    vec2 pixel = (gl_FragCoord.xy / resolution) * 2.0 - 1.0;
    vec3 rd = normalize(vec3(pixel.x, pixel.y, -2.0));
    vec3 ro = vec3(-camPos.x, -camPos.y, camPos.z);

    float ax = (camRot.y + 0.25) * TWOPI;
    rd = rotateX(rd, ax); ro = rotateX(ro, ax);
    float ay = (camRot.x + 0.5) * TWOPI;
    rd = rotateY(rd, ay); ro = rotateY(ro, ay);

    vec3 boxMin = vec3(-1.0, -0.001, -1.0) * overdrive;
    vec3 boxMax = vec3(1.0, maxHeight, 1.0) * overdrive;

    float tnear, tfar;
    vec4 col = vec4(0.0);

    if (intersectBox(ro, rd, boxMin, boxMax, tnear, tfar)) {
      vec3 pnear = ro + rd * (tnear - 0.0001);
      vec3 pfar = ro + rd * tfar;
      float stepSize = length(pfar - pnear) / slices;
      vec3 rayStep = rd * stepSize;
      vec3 p = pnear;
      float pH = 0.0;
      vec3 pP = p;

      for (int i = 0; i < 256; i++) {
        if (float(i) > slices) break;
        float h = luminance(worldToTex(p)) * maxHeight * overdrive;
        if (p.y < h) {
          vec3 hitPos = mix(pP, p, (pH - pP.y) / ((p.y - pP.y) - (h - pH)));
          col = texture2D(sourceTex, worldToTex(hitPos));
          break;
        }
        pH = h;
        pP = p;
        p += rayStep;
      }
    }

    gl_FragColor = vec4(col.rgb, col.a * opacity);
  }
`

/** Generate a procedural noise texture as video stub */
function createNoiseTexture(width = 256, height = 256): THREE.DataTexture {
  const data = new Uint8Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    const x = (i % width) / width
    const y = Math.floor(i / width) / height
    // gradient + noise pattern
    const base = Math.floor((Math.sin(x * 12.0) * Math.cos(y * 8.0) * 0.5 + 0.5) * 200)
    const noise = Math.floor(Math.random() * 55)
    const v = Math.min(255, base + noise)
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  }
  const tex = new THREE.DataTexture(data, width, height)
  tex.needsUpdate = true
  return tex
}

interface FlashbackHeightfieldProps {
  videoSrc?: string
  maxHeight?: number
  overdrive?: number
  opacity?: number
}

export function FlashbackHeightfield({
  videoSrc,
  maxHeight = 0.25,
  overdrive = 1.5,
  opacity = 1,
}: FlashbackHeightfieldProps) {
  const { size } = useThree()
  const meshRef = useRef<THREE.Mesh>(null)

  const { texture, uniforms } = useMemo(() => {
    let tex: THREE.Texture

    if (videoSrc) {
      const video = document.createElement('video')
      video.src = videoSrc
      video.loop = true
      video.muted = true
      video.playsInline = true
      video.play()
      tex = new THREE.VideoTexture(video)
      tex.minFilter = THREE.LinearFilter
      tex.magFilter = THREE.LinearFilter
    } else {
      // Stub: procedural noise texture
      tex = createNoiseTexture()
    }

    return {
      texture: tex,
      uniforms: {
        sourceTex: { value: tex },
        resolution: { value: new THREE.Vector2(size.width, size.height) },
        maxHeight: { value: maxHeight },
        slices: { value: 80.0 },
        overdrive: { value: overdrive },
        camPos: { value: new THREE.Vector3(0, 0, 2.5) },
        camRot: { value: new THREE.Vector2(0.5, 0.45) },
        time: { value: 0 },
        opacity: { value: opacity },
      },
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSrc])

  useEffect(() => {
    uniforms.opacity.value = opacity
  }, [opacity, uniforms])

  useFrame((_, delta) => {
    uniforms.time.value += delta
    uniforms.resolution.value.set(size.width, size.height)
    // 느린 카메라 자동 회전 — 기억이 떠오르는 듯
    uniforms.camRot.value.x = 0.5 + Math.sin(uniforms.time.value * 0.15) * 0.03
    uniforms.camRot.value.y = 0.45 + Math.sin(uniforms.time.value * 0.1) * 0.02
  })

  return (
    <mesh ref={meshRef} renderOrder={999}>
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
