/**
 * CH.2 간판 — WALL_SEGMENTS 빌딩 인스턴스에 의사난수로 ~50% 배치.
 *
 * 부착방식 3종 (60/30/10 분포):
 *   - front  : 정면 decal (가로형·정방형 sign), 1층/상층 랜덤
 *   - side   : 옆구리 직각 돌출 (세로형·정방형), 빌딩 측면 표면에 부착하고 정면 방향으로
 *              일부 튀어나옴. 양면(DoubleSide)
 *   - roof   : 옥상 빌보드. 빌딩 중심 위, 정면 방향으로 회전. 양면
 */
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import { SIGN_META, SIGNS_BY_CATEGORY, type SignCategory } from '@/scenes/ch2Signs'

const BASE = import.meta.env.BASE_URL

export type SignBuilding = {
  cx: number; cy: number; cz: number     // 박스 중심
  w: number; h: number; d: number        // 박스 크기 (X, Y, Z)
  faceX: number; faceZ: number           // 정면 unit vector (도로 쪽)
  seed: number                           // 결정론 시드
}

type Mount = 'front' | 'side' | 'roof'

type SignPlacement = {
  buildingKey: string
  signIdx: number
  position: [number, number, number]
  rotation: [number, number, number]
  width: number
  height: number
  doubleSided: boolean
}

const SURFACE_OFFSET = 0.03

function lcg(seed: number): number {
  return ((seed * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff
}

function pickIdx(pool: number[], seed: number): number {
  return pool[Math.floor(lcg(seed) * pool.length) % pool.length]
}

function planSignsForBuilding(b: SignBuilding, key: string): SignPlacement[] {
  if (lcg(b.seed) > 0.5) return []

  const m = lcg(b.seed + 17)
  let mount: Mount
  if (m < 0.6) mount = 'front'
  else if (m < 0.9) mount = 'side'
  else mount = 'roof'

  const isFaceX = Math.abs(b.faceX) > 0.5
  const frontHalfExtent = isFaceX ? b.w / 2 : b.d / 2
  const frontWidth = isFaceX ? b.d : b.w
  const rotYFront = Math.atan2(b.faceX, b.faceZ)

  const frontX = b.cx + b.faceX * (frontHalfExtent + SURFACE_OFFSET)
  const frontZ = b.cz + b.faceZ * (frontHalfExtent + SURFACE_OFFSET)

  if (mount === 'front') {
    const cat: SignCategory = lcg(b.seed + 23) < 0.65 ? 'horizontal' : 'square'
    const signIdx = pickIdx(SIGNS_BY_CATEGORY[cat], b.seed + 29)
    const meta = SIGN_META[signIdx]
    const ratio = meta.w / meta.h

    const isUpper = lcg(b.seed + 31) < 0.3 && b.h > 8
    const y = isUpper
      ? b.h * (0.4 + lcg(b.seed + 37) * 0.3)
      : 1.8 + lcg(b.seed + 37) * 1.2

    const widthFrac = 0.45 + lcg(b.seed + 41) * 0.3
    let planeW = frontWidth * widthFrac
    let planeH = planeW / ratio
    const maxH = isUpper ? 3.0 : 1.8
    if (planeH > maxH) {
      planeH = maxH
      planeW = planeH * ratio
    }

    return [{
      buildingKey: key,
      signIdx,
      position: [frontX, y, frontZ],
      rotation: [0, rotYFront, 0],
      width: planeW,
      height: planeH,
      doubleSided: false,
    }]
  }

  if (mount === 'side') {
    const cat: SignCategory = lcg(b.seed + 23) < 0.7 ? 'vertical' : 'square'
    const signIdx = pickIdx(SIGNS_BY_CATEGORY[cat], b.seed + 29)
    const meta = SIGN_META[signIdx]
    const ratio = meta.w / meta.h

    const sideSign = lcg(b.seed + 47) < 0.5 ? -1 : 1
    // 측면 unit vector: face와 perpendicular한 horizontal vector
    const sideUx = b.faceZ * sideSign
    const sideUz = -b.faceX * sideSign
    const sideHalf = isFaceX ? b.d / 2 : b.w / 2

    // 측면 표면 위 + 정면 코너 가까이
    const cornerMargin = 0.4 + lcg(b.seed + 53) * 0.6
    const surfaceX = b.cx + b.faceX * (frontHalfExtent - cornerMargin) + sideUx * (sideHalf + SURFACE_OFFSET)
    const surfaceZ = b.cz + b.faceZ * (frontHalfExtent - cornerMargin) + sideUz * (sideHalf + SURFACE_OFFSET)

    // plane 크기
    const planeW = 0.9 + lcg(b.seed + 41) * 0.6  // 0.9~1.5m
    let planeH = planeW / ratio
    if (planeH > 3.5) planeH = 3.5

    // plane을 정면 방향으로 (planeW/2 - bury)만큼 밀어내서 도로 쪽으로 튀어나오게
    const bury = 0.15
    const px = surfaceX + b.faceX * (planeW / 2 - bury)
    const pz = surfaceZ + b.faceZ * (planeW / 2 - bury)

    const y = 2.5 + lcg(b.seed + 31) * Math.min(2.0, Math.max(0, b.h - 3.5))

    const rotY = Math.atan2(sideUx, sideUz)
    return [{
      buildingKey: key,
      signIdx,
      position: [px, y, pz],
      rotation: [0, rotY, 0],
      width: planeW,
      height: planeH,
      doubleSided: true,
    }]
  }

  // roof
  const catRand = lcg(b.seed + 23)
  const cat: SignCategory = catRand < 0.5 ? 'horizontal' : (catRand < 0.8 ? 'vertical' : 'square')
  const signIdx = pickIdx(SIGNS_BY_CATEGORY[cat], b.seed + 29)
  const meta = SIGN_META[signIdx]
  const ratio = meta.w / meta.h

  const widthFrac = 0.5 + lcg(b.seed + 41) * 0.3
  let planeW = frontWidth * widthFrac
  let planeH = planeW / ratio
  const maxH = 4.0
  if (planeH > maxH) {
    planeH = maxH
    planeW = planeH * ratio
  }
  const y = b.h + planeH / 2 + 0.2

  return [{
    buildingKey: key,
    signIdx,
    position: [b.cx, y, b.cz],
    rotation: [0, rotYFront, 0],
    width: planeW,
    height: planeH,
    doubleSided: true,
  }]
}

export const Ch2Signs: React.FC<{ buildings: SignBuilding[] }> = ({ buildings }) => {
  const placements = useMemo(
    () => buildings.flatMap((b, i) => planSignsForBuilding(b, `b${i}`)),
    [buildings],
  )

  // 사용 중인 signIdx 집합만 로드
  const usedIndices = useMemo(() => {
    const s = new Set<number>()
    placements.forEach(p => s.add(p.signIdx))
    return Array.from(s)
  }, [placements])

  const [textures, setTextures] = useState<Map<number, THREE.Texture>>(() => new Map())

  useEffect(() => {
    let cancelled = false
    const loader = new THREE.TextureLoader()
    usedIndices.forEach(i => {
      if (textures.has(i)) return
      const url = `${BASE}assets/tex/signs/${SIGN_META[i].file}`
      loader.loadAsync(url).then(tex => {
        if (cancelled) return
        tex.colorSpace = THREE.SRGBColorSpace
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
        tex.anisotropy = 8
        tex.needsUpdate = true
        setTextures(prev => {
          const next = new Map(prev)
          next.set(i, tex)
          return next
        })
      }).catch(err => {
        console.warn('[CH2] sign texture load failed:', url, err)
      })
    })
    return () => { cancelled = true }
  }, [usedIndices, textures])

  const materials = useMemo(() => {
    const map = new Map<string, THREE.MeshStandardMaterial>()
    placements.forEach(p => {
      const tex = textures.get(p.signIdx)
      if (!tex) return
      const key = `${p.signIdx}-${p.doubleSided ? 'd' : 's'}`
      if (map.has(key)) return
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        roughness: 0.7,
        metalness: 0.0,
        side: p.doubleSided ? THREE.DoubleSide : THREE.FrontSide,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
      map.set(key, mat)
    })
    return map
  }, [placements, textures])

  return (
    <>
      {placements.map((p, i) => {
        const key = `${p.signIdx}-${p.doubleSided ? 'd' : 's'}`
        const mat = materials.get(key)
        if (!mat) return null
        return (
          <mesh
            key={`sign-${p.buildingKey}-${i}`}
            position={p.position}
            rotation={p.rotation}
          >
            <planeGeometry args={[p.width, p.height]} />
            <primitive object={mat} attach="material" />
          </mesh>
        )
      })}
    </>
  )
}
