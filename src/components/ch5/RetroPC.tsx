import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

const MODEL_URL = `${import.meta.env.BASE_URL}assets/ch5/retro_pc.glb`

type Props = {
  /** html2canvas dataURL — replaces the baked Windows 98 screen with the blog snapshot */
  screenDataUrl?: string | null
}

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

export const RetroPC: React.FC<Props> = ({ screenDataUrl }) => {
  const { scene, materials } = useGLTF(MODEL_URL)

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
      // Every mesh casts + receives shadows so parts self-shadow (e.g. monitor
      // onto keyboard). The Screen face is handled below — it skips shadowing
      // since the CRT shader is self-illuminated and already uses a custom material.
      if (obj.name !== 'Screen') {
        mesh.castShadow = true
        mesh.receiveShadow = true
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
  }, [scene, crtMaterial, materials])

  useEffect(() => {
    crtMaterial.uniforms.uMap.value = screenTexture
    crtMaterial.uniforms.uHasMap.value = screenTexture ? 1 : 0
  }, [screenTexture, crtMaterial])

  useFrame((_, dt) => {
    crtMaterial.uniforms.uTime.value += dt
  })

  return <primitive object={scene} />
}

useGLTF.preload(MODEL_URL)
