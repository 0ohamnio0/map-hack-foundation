import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { DEFAULT_TUNING, type RetroPCTuning } from './retroPCTuning'

const MODEL_URL = `${import.meta.env.BASE_URL}assets/ch5/retro_pc.glb`

type Props = {
  /** html2canvas dataURL — replaces the baked Windows 98 screen with the blog snapshot */
  screenDataUrl?: string | null
  tuning?: RetroPCTuning
}

const BODY_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying float vLocalY;
  varying vec3 vWorldNormal;
  void main() {
    vUv = uv;
    vLocalY = position.y;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const BODY_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying float vLocalY;
  varying vec3 vWorldNormal;
  uniform sampler2D uBaseMap;
  uniform float uHasMap;
  uniform float uYMin;
  uniform float uYMax;
  uniform float uGradientTop;
  uniform float uGradientBottom;
  uniform vec3 uLightDir;
  uniform float uLightAmbient;
  uniform float uLightIntensity;
  uniform float uSaturation;

  void main() {
    vec3 base = uHasMap > 0.5 ? texture2D(uBaseMap, vUv).rgb : vec3(0.78, 0.76, 0.70);

    // Saturation — luminance-preserving desaturate (0=grayscale, 1=original, >1=boosted)
    float lum = dot(base, vec3(0.299, 0.587, 0.114));
    base = mix(vec3(lum), base, uSaturation);

    float t = clamp((vLocalY - uYMin) / max(1e-4, uYMax - uYMin), 0.0, 1.0);
    t = smoothstep(0.0, 1.0, t);
    float gradient = mix(uGradientBottom, uGradientTop, t);

    vec3 lightDir = normalize(uLightDir);
    float NdotL = max(dot(vWorldNormal, lightDir), 0.0);
    float lighting = uLightAmbient + NdotL * uLightIntensity;

    gl_FragColor = vec4(base * gradient * lighting, 1.0);
  }
`

const CRT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const CRT_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uHasMap;
  uniform vec2 uUvMin;
  uniform vec2 uUvSize;

  float hash21(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }

  void main() {
    // Remap glTF's sub-atlas UV range into 0..1 so the blog fills the screen
    vec2 uv = (vUv - uUvMin) / uUvSize;

    // CRT curvature (barrel distortion)
    vec2 c = uv - 0.5;
    float r2 = dot(c, c);
    uv = 0.5 + c * (1.0 + 0.185 * r2);

    vec3 col;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      col = vec3(0.01, 0.015, 0.02);
    } else if (uHasMap < 0.5) {
      col = vec3(0.02, 0.04, 0.03);
    } else {
      // Chromatic aberration — edges separate harder
      float aberr = 0.004 * (0.6 + r2 * 4.4);
      col.r = texture2D(uMap, uv + vec2(aberr, 0.0)).r;
      col.g = texture2D(uMap, uv).g;
      col.b = texture2D(uMap, uv - vec2(aberr, 0.0)).b;

      // Horizontal scanlines (base 1.0 so peaks brighten, troughs dim)
      float scan = 1.0 + 0.35 * sin(uv.y * 990.0);
      col *= scan;

      // Aperture grille — RGB triad mask
      float gx = uv.x * 900.0;
      vec3 mask = vec3(
        1.0 + 0.6 * sin(gx),
        1.0 + 0.6 * sin(gx + 2.094),
        1.0 + 0.6 * sin(gx + 4.188)
      );
      col *= mask;

      // Rolling scan bar
      float bar = smoothstep(0.05, 0.0, abs(fract(uv.y - uTime * 0.09) - 0.5));
      col += vec3(0.08, 0.10, 0.092) * bar;

      // Vignette
      float vig = smoothstep(1.05, 0.2, length(c) * 0.5);
      col *= mix(0.42, 1.0, vig);

      // Phosphor decay — greenish tint in the deepest shadows
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(0.02, 0.05, 0.04), col, smoothstep(0.0, 0.15, lum));

      // Fine static noise
      float n = hash21(gl_FragCoord.xy + uTime * 60.0);
      col += (n - 0.5) * 0.05;

      // Global brightness (flicker disabled)
      col *= 0.605;

      // Emission for bloom pickup
      col *= 0.5;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`

export const RetroPC: React.FC<Props> = ({ screenDataUrl, tuning = DEFAULT_TUNING }) => {
  const { scene: rawScene, materials } = useGLTF(MODEL_URL)
  // Clone so each mount gets fresh meshes — useGLTF caches the scene at module
  // level, and we swap materials per-mesh. Without cloning, the second mount
  // sees our ShaderMaterial as the "original" → .map extraction fails and the
  // base texture is lost.
  const scene = useMemo(() => rawScene.clone(true), [rawScene])

  const crtMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uMap: { value: null as THREE.Texture | null },
          uTime: { value: 0 },
          uHasMap: { value: 0 },
          uUvMin: { value: new THREE.Vector2(0, 0) },
          uUvSize: { value: new THREE.Vector2(1, 1) },
        },
        vertexShader: CRT_VERTEX,
        fragmentShader: CRT_FRAGMENT,
        toneMapped: false,
      }),
    [],
  )

  const bodyMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uBaseMap: { value: null as THREE.Texture | null },
          uHasMap: { value: 0 },
          uYMin: { value: 0 },
          uYMax: { value: 1 },
          uGradientTop: { value: DEFAULT_TUNING.gradientTop },
          uGradientBottom: { value: DEFAULT_TUNING.gradientBottom },
          uLightDir: { value: new THREE.Vector3(DEFAULT_TUNING.lightDirX, DEFAULT_TUNING.lightDirY, DEFAULT_TUNING.lightDirZ) },
          uLightAmbient: { value: DEFAULT_TUNING.lightAmbient },
          uLightIntensity: { value: DEFAULT_TUNING.lightIntensity },
          uSaturation: { value: DEFAULT_TUNING.saturation },
        },
        vertexShader: BODY_VERTEX,
        fragmentShader: BODY_FRAGMENT,
      }),
    [],
  )

  // Track all per-mesh material clones so we can broadcast tuning changes
  const clonedMatsRef = useRef<THREE.ShaderMaterial[]>([])

  const screenTexture = useMemo(() => {
    if (!screenDataUrl) return null
    const tex = new THREE.TextureLoader().load(screenDataUrl)
    tex.flipY = false
    tex.colorSpace = THREE.SRGBColorSpace
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    return tex
  }, [screenDataUrl])

  const appliedRef = useRef(false)

  useEffect(() => {
    if (appliedRef.current) return

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh
      if (!mesh.isMesh) return
      if (obj.name !== 'Screen') {
        // Keep original baked PSX texture as base, overlay gradient + lambertian
        const geom = mesh.geometry as THREE.BufferGeometry
        if (!geom.boundingBox) geom.computeBoundingBox()
        const bb = geom.boundingBox!
        const origMat = mesh.material as THREE.MeshStandardMaterial | undefined
        const baseMap = origMat && 'map' in origMat ? (origMat.map as THREE.Texture | null) : null
        const meshMat = bodyMaterial.clone()
        meshMat.uniforms.uBaseMap.value = baseMap
        meshMat.uniforms.uHasMap.value = baseMap ? 1 : 0
        meshMat.uniforms.uYMin.value = bb.min.y
        meshMat.uniforms.uYMax.value = bb.max.y
        clonedMatsRef.current.push(meshMat)
        mesh.material = meshMat
        return
      }
      const geom = mesh.geometry as THREE.BufferGeometry
      const uvAttr = geom.getAttribute('uv') as THREE.BufferAttribute | undefined
      if (uvAttr) {
        let uMin = Infinity, uMax = -Infinity, vMin = Infinity, vMax = -Infinity
        for (let i = 0; i < uvAttr.count; i++) {
          const u = uvAttr.getX(i)
          const v = uvAttr.getY(i)
          if (u < uMin) uMin = u
          if (u > uMax) uMax = u
          if (v < vMin) vMin = v
          if (v > vMax) vMax = v
        }
        ;(crtMaterial.uniforms.uUvMin.value as THREE.Vector2).set(uMin, vMin)
        ;(crtMaterial.uniforms.uUvSize.value as THREE.Vector2).set(
          Math.max(1e-4, uMax - uMin),
          Math.max(1e-4, vMax - vMin),
        )
      }
      mesh.material = crtMaterial
    })
    appliedRef.current = true
    void materials
  }, [scene, crtMaterial, bodyMaterial, materials])

  useEffect(() => {
    crtMaterial.uniforms.uMap.value = screenTexture
    crtMaterial.uniforms.uHasMap.value = screenTexture ? 1 : 0
  }, [screenTexture, crtMaterial])

  // Broadcast tuning changes to every per-mesh material clone
  useEffect(() => {
    for (const mat of clonedMatsRef.current) {
      mat.uniforms.uGradientTop.value = tuning.gradientTop
      mat.uniforms.uGradientBottom.value = tuning.gradientBottom
      mat.uniforms.uLightAmbient.value = tuning.lightAmbient
      mat.uniforms.uLightIntensity.value = tuning.lightIntensity
      mat.uniforms.uSaturation.value = tuning.saturation
      ;(mat.uniforms.uLightDir.value as THREE.Vector3).set(
        tuning.lightDirX, tuning.lightDirY, tuning.lightDirZ,
      )
    }
  }, [tuning])

  useFrame((_, dt) => {
    crtMaterial.uniforms.uTime.value += dt
  })

  return <primitive object={scene} />
}

useGLTF.preload(MODEL_URL)
