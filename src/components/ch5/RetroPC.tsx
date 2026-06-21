import { useEffect, useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { DEFAULT_TUNING, type RetroPCTuning } from './retroPCTuning'

const MODEL_URL = `${import.meta.env.BASE_URL}assets/ch5/retro_pc.glb`

// 전원버튼(Compaq 로고) 클릭 영역 — Tower 메쉬 bbox 정규화 좌표 [min,max]. 화면 보고 미세조정.
const POWER_BTN_X: [number, number] = [0.35, 0.70] // 가로(좌→우)
const POWER_BTN_Y: [number, number] = [0.44, 0.58] // 세로(아래→위)

type Props = {
  /** html2canvas dataURL — replaces the baked Windows 98 screen with the blog snapshot */
  screenDataUrl?: string | null
  tuning?: RetroPCTuning
  /** 본체 클릭 = 전원 끄기 (셧다운 후 엔딩에서만 전달). 지정 시 본체 위 커서가 pointer로 바뀐다 */
  onPowerOff?: () => void
  /** 전원 off — 스크린 메쉬의 CRT 셰이더·이미지를 완전히 끄고 플레인 블랙으로 (룸·본체는 유지) */
  screenOff?: boolean
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

// Ported from VFX-JS postEffect (https://amagi.dev/vfx-js/) — radial zoom-blur
// CRT look with random angular jitter, scanline + grid deco, vignette, dither.
// All strength values are uniforms so they can be tuned live via TuningPanel.
const CRT_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D uMap;
  uniform float uTime;
  uniform float uHasMap;
  uniform vec2 uUvMin;
  uniform vec2 uUvSize;
  uniform float uScale;
  uniform float uWarpStrength;
  uniform float uCenterZoom;
  uniform float uJitter;
  uniform float uAberration;
  uniform float uAberrationZoom;
  uniform float uScanline;
  uniform float uGrid;
  uniform float uVignette;
  uniform float uDither;
  uniform float uBrightness;

  const float ASPECT = 1.345;

  vec4 readTex(vec2 uv) {
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
    return texture2D(uMap, uv);
  }

  vec2 zoom(vec2 uv, float t) {
    return (uv - 0.5) * t + 0.5;
  }

  float rand3(vec3 p) {
    return fract(sin(dot(p, vec3(829.0, 4839.0, 432.0))) * 39428.0);
  }

  void main() {
    vec2 uv = (vUv - uUvMin) / uUvSize;

    // Content pre-scale — >1 enlarges, <1 shrinks (independent of warp curve)
    uv = (uv - 0.5) / max(uScale, 0.0001) + 0.5;

    vec2 p = uv * 2.0 - 1.0;
    p.x *= ASPECT;
    float l = length(p);

    // Zoom warp — magnification baseline + edge falloff
    float dist = pow(l, 2.0) * uWarpStrength;
    dist = smoothstep(0.0, 1.0, dist);
    uv = zoom(uv, uCenterZoom + dist);

    // Radial random blur — angle-keyed jitter outward
    float a = atan(p.y, p.x);
    float rd = rand3(vec3(a, uTime, 0.0));
    uv = (uv - 0.5) * (1.0 + rd * pow(l * 0.7, 3.0) * uJitter) + 0.5;

    // Chromatic aberration — base offset + y-modulated zoom split
    vec2 uvr = uv, uvg = uv, uvb = uv;
    float d = (1.0 + sin(uv.y * 20.0 + uTime * 3.0) * 0.1) * uAberrationZoom;
    uvr.x += uAberration;
    uvb.x -= uAberration;
    uvr = zoom(uvr, 1.0 + d * l * l);
    uvb = zoom(uvb, 1.0 - d * l * l);

    vec4 cr = readTex(uvr);
    vec4 cg = readTex(uvg);
    vec4 cb = readTex(uvb);
    // 폴백: 스냅샷 없을 땐 검정 베이스 — deco가 흰색 스캔라인/그리드로 발산
    vec3 col = uHasMap < 0.5 ? vec3(0.0) : vec3(cr.r, cg.g, cb.b);

    vec3 deco = vec3(0.0);

    // Scanline — high-frequency vertical oscillation
    float res = 1080.0;
    deco += vec3(sin(uv.y * res * 0.7 + uTime * 100.0) * sin(uv.y * res * 0.3 - uTime * 130.0)) * uScanline;

    // 20x20 grid
    deco += vec3(smoothstep(0.01, 0.0, min(fract(uv.x * 20.0), fract(uv.y * 20.0)))) * uGrid;

    col += deco * smoothstep(2.0, 0.0, l);

    // Vignette
    col *= uVignette - l * l;

    // Dither
    col += rand3(vec3(p, uTime)) * uDither;

    // Emission damp for bloom pickup
    col *= uBrightness;

    gl_FragColor = vec4(col, 1.0);
  }
`

export const RetroPC: React.FC<Props> = ({ screenDataUrl, tuning = DEFAULT_TUNING, onPowerOff, screenOff = false }) => {
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
          uScale: { value: DEFAULT_TUNING.crtScale },
          uWarpStrength: { value: DEFAULT_TUNING.crtWarpStrength },
          uCenterZoom: { value: DEFAULT_TUNING.crtCenterZoom },
          uJitter: { value: DEFAULT_TUNING.crtJitter },
          uAberration: { value: DEFAULT_TUNING.crtAberration },
          uAberrationZoom: { value: DEFAULT_TUNING.crtAberrationZoom },
          uScanline: { value: DEFAULT_TUNING.crtScanline },
          uGrid: { value: DEFAULT_TUNING.crtGrid },
          uVignette: { value: DEFAULT_TUNING.crtVignette },
          uDither: { value: DEFAULT_TUNING.crtDither },
          uBrightness: { value: DEFAULT_TUNING.crtBrightness },
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
  // 전원 off 시 Screen 메쉬를 셰이더 대신 플레인 블랙으로 교체하기 위한 참조/머티리얼
  const screenMeshRef = useRef<THREE.Mesh | null>(null)
  const blackScreenMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#000000', toneMapped: false }), [])
  // 전원버튼 영역 판정용 — Tower 메쉬 월드 bbox
  const towerBoxRef = useRef<THREE.Box3 | null>(null)

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
      screenMeshRef.current = mesh
      mesh.material = screenOff ? blackScreenMat : crtMaterial
    })
    // 전원버튼 영역 판정용 Tower 월드 bbox
    const tower = scene.getObjectByName('Tower')
    if (tower) {
      tower.updateWorldMatrix(true, true)
      towerBoxRef.current = new THREE.Box3().setFromObject(tower)
    }
    appliedRef.current = true
    void materials
  }, [scene, crtMaterial, bodyMaterial, materials, screenOff, blackScreenMat])

  // 전원 on/off 토글 시 Screen 메쉬 머티리얼 스왑 (셰이더 ↔ 플레인 블랙)
  useEffect(() => {
    const m = screenMeshRef.current
    if (m) m.material = screenOff ? blackScreenMat : crtMaterial
  }, [screenOff, crtMaterial, blackScreenMat])

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
    crtMaterial.uniforms.uScale.value = tuning.crtScale
    crtMaterial.uniforms.uWarpStrength.value = tuning.crtWarpStrength
    crtMaterial.uniforms.uCenterZoom.value = tuning.crtCenterZoom
    crtMaterial.uniforms.uJitter.value = tuning.crtJitter
    crtMaterial.uniforms.uAberration.value = tuning.crtAberration
    crtMaterial.uniforms.uAberrationZoom.value = tuning.crtAberrationZoom
    crtMaterial.uniforms.uScanline.value = tuning.crtScanline
    crtMaterial.uniforms.uGrid.value = tuning.crtGrid
    crtMaterial.uniforms.uVignette.value = tuning.crtVignette
    crtMaterial.uniforms.uDither.value = tuning.crtDither
    crtMaterial.uniforms.uBrightness.value = tuning.crtBrightness
  }, [tuning, crtMaterial])

  useFrame((_, dt) => {
    crtMaterial.uniforms.uTime.value += dt
  })

  // 클릭/호버가 Tower 앞면의 전원버튼(Compaq 로고) 영역인지 — bbox 정규화 좌표로 판정
  const hitPowerButton = (e: ThreeEvent<MouseEvent>): boolean => {
    const box = towerBoxRef.current
    if (!box) return false
    let o: THREE.Object3D | null = e.object
    let onTower = false
    while (o) { if (o.name === 'Tower') { onTower = true; break } o = o.parent }
    if (!onTower) return false
    const nx = (e.point.x - box.min.x) / Math.max(1e-4, box.max.x - box.min.x)
    const ny = (e.point.y - box.min.y) / Math.max(1e-4, box.max.y - box.min.y)
    return nx >= POWER_BTN_X[0] && nx <= POWER_BTN_X[1] && ny >= POWER_BTN_Y[0] && ny <= POWER_BTN_Y[1]
  }

  return (
    <primitive
      object={scene}
      onClick={onPowerOff ? (e: ThreeEvent<MouseEvent>) => { if (hitPowerButton(e)) { e.stopPropagation(); onPowerOff(); } } : undefined}
      onPointerMove={onPowerOff ? (e: ThreeEvent<PointerEvent>) => { document.body.style.cursor = hitPowerButton(e as unknown as ThreeEvent<MouseEvent>) ? 'pointer' : ''; } : undefined}
      onPointerOut={onPowerOff ? () => { document.body.style.cursor = ''; } : undefined}
    />
  )
}

useGLTF.preload(MODEL_URL)
