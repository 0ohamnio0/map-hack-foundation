/**
 * CH.2 벽 그래피티 숫자 — 커스텀 폰트로 canvas에 렌더한 텍스트를 실제 건물 벽면에 데칼처럼 부착.
 *   "59"  = Vabioxe Graffiti
 *   "420" = Outliner Regular
 * 좌표(pos)에 가장 가까운 SIGN_BUILDINGS 빌딩의 정면(도로쪽) 표면에 붙이고, 좌표의 가로 위치를 반영.
 * worn out — 페인트 드립 + 긁힘 + 벗겨짐(destination-out)으로 헐고 더러운 진짜 그래피티 룩.
 */
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { SCALE_X, SCALE_Z } from '@/scenes/ch2Layout'
import type { SignBuilding } from './Ch2Signs'

const BASE = import.meta.env.BASE_URL

interface Graffiti {
  id: string
  text: string
  font: string            // font-family
  color: string
  pos: [number, number]   // base [x, z] — 부착할 벽 근처(클릭 좌표)
  y: number               // 중심 높이(m)
  h: number               // plane 높이(m). 폭은 canvas aspect(2:1)
  scale?: number          // 면 맞춤 크기에 곱하는 추가 배율 (기본 1)
}

const GRAFFITI: Graffiti[] = [
  { id: 'g420', text: '420', font: 'Outliner',         color: '#eaeaea', pos: [17.8, -45.4], y: 5.6, h: 5 },
  { id: 'g59',  text: '59',  font: 'Vabioxe Graffiti', color: '#ff2d2d', pos: [17.3, -55.5], y: 5.6, h: 6, scale: 0.8 },
]

function makeGraffitiTexture(text: string, font: string, color: string): THREE.CanvasTexture {
  const W = 1024, H = 512
  const cnv = document.createElement('canvas')
  cnv.width = W; cnv.height = H
  const ctx = cnv.getContext('2d')!
  ctx.clearRect(0, 0, W, H)

  // 1. 글자
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  let size = 380
  ctx.font = `${size}px "${font}"`
  while (ctx.measureText(text).width > W * 0.82 && size > 40) {
    size -= 12
    ctx.font = `${size}px "${font}"`
  }
  ctx.fillText(text, W / 2, H / 2)

  // 2. 페인트 드립 — 글자에서 아래로 흐른 자국
  ctx.fillStyle = color
  for (let i = 0; i < 16; i++) {
    ctx.globalAlpha = 0.35 + Math.random() * 0.4
    const dx = W * (0.18 + Math.random() * 0.64)
    const dyTop = H * (0.42 + Math.random() * 0.22)
    const len = 18 + Math.random() * 130
    ctx.fillRect(dx, dyTop, 2 + Math.random() * 3, len)
  }
  ctx.globalAlpha = 1

  // 3. worn — 벗겨짐/긁힘 (destination-out: 칠해진 부분을 깎아냄)
  ctx.globalCompositeOperation = 'destination-out'
  // 긁힘 선
  for (let i = 0; i < 44; i++) {
    ctx.globalAlpha = 0.25 + Math.random() * 0.5
    ctx.lineWidth = 1 + Math.random() * 3
    const x0 = Math.random() * W, y0 = Math.random() * H
    ctx.beginPath()
    ctx.moveTo(x0, y0)
    ctx.lineTo(x0 + (Math.random() - 0.5) * 130, y0 + (Math.random() - 0.5) * 44)
    ctx.stroke()
  }
  // 벗겨진 점/얼룩 (노이즈)
  for (let i = 0; i < 950; i++) {
    ctx.globalAlpha = 0.18 + Math.random() * 0.6
    const s = 1 + Math.random() * 5
    ctx.fillRect(Math.random() * W, Math.random() * H, s, s)
  }
  ctx.globalCompositeOperation = 'source-over'
  ctx.globalAlpha = 1

  const tex = new THREE.CanvasTexture(cnv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  tex.needsUpdate = true
  return tex
}

const GraffitiMesh: React.FC<{ g: Graffiti; ready: boolean; buildings: SignBuilding[] }> = ({ g, ready, buildings }) => {
  const tex = useMemo(() => (ready ? makeGraffitiTexture(g.text, g.font, g.color) : null), [g, ready])
  const mat = useMemo(() => {
    if (!tex) return null
    return new THREE.MeshStandardMaterial({
      map: tex,
      roughness: 0.95,
      metalness: 0,
      transparent: true,
      alphaTest: 0.04,
      side: THREE.DoubleSide,
      polygonOffset: true,        // 벽 표면 데칼 z-fighting 방지
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
  }, [tex])

  // 좌표에 가장 가까운 빌딩의 정면 표면 위, 좌표의 가로 위치를 반영해 부착
  // 모든 빌딩의 4개 수직면 중 좌표에 가장 가까운 면에 스냅 → 공중에 안 뜨고, 옆면이든 정면이든 자동 선택
  const placement = useMemo(() => {
    if (buildings.length === 0) return null
    const wx = g.pos[0] * SCALE_X, wz = g.pos[1] * SCALE_Z
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
    let best: { nx: number; nz: number; px: number; pz: number; faceW: number } | null = null
    let bestD = Infinity
    for (const b of buildings) {
      const hx = b.w / 2, hz = b.d / 2
      const cand = [
        { nx: 1, nz: 0, px: b.cx + hx, pz: clamp(wz, b.cz - hz, b.cz + hz), faceW: b.d },
        { nx: -1, nz: 0, px: b.cx - hx, pz: clamp(wz, b.cz - hz, b.cz + hz), faceW: b.d },
        { nx: 0, nz: 1, px: clamp(wx, b.cx - hx, b.cx + hx), pz: b.cz + hz, faceW: b.w },
        { nx: 0, nz: -1, px: clamp(wx, b.cx - hx, b.cx + hx), pz: b.cz - hz, faceW: b.w },
      ]
      for (const c of cand) {
        const ddx = wx - c.px, ddz = wz - c.pz
        const d = ddx * ddx + ddz * ddz
        if (d < bestD) { bestD = d; best = c }
      }
    }
    if (!best) return null
    const SURF = 0.2
    return {
      px: best.px + best.nx * SURF,
      pz: best.pz + best.nz * SURF,
      rotY: Math.atan2(best.nx, best.nz),
      faceW: best.faceW,
    }
  }, [g, buildings])

  if (!mat || !placement) return null
  // 건물 면 폭(faceW)에 맞춰 축소 — 면 밖으로 튀어나오지 않게. canvas 2:1 비율 유지
  const maxW = placement.faceW * 0.85
  const w = Math.min(g.h * 2, maxW) * (g.scale ?? 1)
  const h = w / 2
  return (
    <mesh
      position={[placement.px, g.y, placement.pz]}
      rotation={[0, placement.rotY, 0]}
      material={mat}
      onPointerDown={(e) => { e.stopPropagation(); console.log(`[Graffiti] ${g.id} pos=[${g.pos}] face=[${placement.rotY.toFixed(2)}]`) }}
    >
      <planeGeometry args={[w, h]} />
    </mesh>
  )
}

export const Ch2Graffiti: React.FC<{ buildings: SignBuilding[] }> = ({ buildings }) => {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const faces = [
      new FontFace('Vabioxe Graffiti', `url(${BASE}assets/fonts/Vabioxe.ttf)`),
      new FontFace('Outliner', `url(${BASE}assets/fonts/OutlinerRegular.ttf)`),
    ]
    let cancelled = false
    Promise.allSettled(faces.map(f => f.load())).then(results => {
      results.forEach(r => { if (r.status === 'fulfilled') document.fonts.add(r.value) })
      if (!cancelled) setReady(true)
    })
    return () => { cancelled = true }
  }, [])
  return (
    <group name="ch2-graffiti">
      {GRAFFITI.map(g => <GraffitiMesh key={g.id} g={g} ready={ready} buildings={buildings} />)}
    </group>
  )
}
