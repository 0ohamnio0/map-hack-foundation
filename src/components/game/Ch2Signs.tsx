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
import { SIGN_META } from '@/scenes/ch2Signs'
import { useCh2Toggles } from '@/hooks/useCh2Toggles'

const BASE = import.meta.env.BASE_URL

export type SignBuilding = {
  cx: number; cy: number; cz: number     // 박스 중심
  w: number; h: number; d: number        // 박스 크기 (X, Y, Z)
  faceX: number; faceZ: number           // 정면 unit vector (도로 쪽)
  seed: number                           // 결정론 시드
  noSign?: boolean                       // true면 간판 배치 제외 (배열 길이/순서는 유지 → 타 간판 불변)
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
  /** 측면 돌출 간판 ↔ 건물 연결 막대 */
  bar?: { position: [number, number, number]; rotation: [number, number, number]; length: number; thickness: number }
}

const SURFACE_OFFSET = 0.03
const SIGN_SCALE = 1.5

function lcg(seed: number): number {
  return ((seed * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff
}

function planSignsForBuilding(b: SignBuilding, key: string, mount: Mount, signIdx: number, ps: number): SignPlacement[] {
  const s = b.seed + ps  // placement seed — 한 빌딩에 여러 sign 시 충돌 방지
  const isFaceX = Math.abs(b.faceX) > 0.5
  const frontHalfExtent = isFaceX ? b.w / 2 : b.d / 2
  const frontWidth = isFaceX ? b.d : b.w
  const rotYFront = Math.atan2(b.faceX, b.faceZ)

  const frontX = b.cx + b.faceX * (frontHalfExtent + SURFACE_OFFSET)
  const frontZ = b.cz + b.faceZ * (frontHalfExtent + SURFACE_OFFSET)

  if (mount === 'front') {
    const meta = SIGN_META[signIdx]
    const ratio = meta.w / meta.h

    // 입구 이미지 — 정면 하단(지면) 정렬, 5배 대형
    if (meta.entrance) {
      const baseW = frontWidth * (0.45 + lcg(s + 41) * 0.3) * SIGN_SCALE
      let planeW = baseW * 5
      if (planeW > frontWidth * 0.98) planeW = frontWidth * 0.98
      const planeH = planeW / ratio
      return [{
        buildingKey: key,
        signIdx,
        position: [frontX, planeH / 2 - 2.0, frontZ], // 하단을 빌딩 바닥에 꽉(살짝 묻힘)
        rotation: [0, rotYFront, 0],
        width: planeW,
        height: planeH,
        doubleSided: false,
      }]
    }

    // 70% 옥상 바로 아래 / 30% 1F 점포 입구 위
    const isUpper = lcg(s + 31) < 0.7

    const widthFrac = (0.45 + lcg(s + 41) * 0.3) * SIGN_SCALE
    let planeW = frontWidth * widthFrac
    let planeH = planeW / ratio
    const maxH = (isUpper ? 3.0 : 1.5) * SIGN_SCALE
    if (planeH > maxH) {
      planeH = maxH
      planeW = planeH * ratio
    }

    let y = isUpper
      ? b.h - planeH / 2 - 0.3
      : 5.0 + lcg(s + 37) * 1.0
    if (meta.ground) y = planeH / 2 + 0.2 // 하단을 빌딩 바닥에 정렬

    // 좌(-)/우(+) 수평 이동 — face와 수직인 수평축
    const leftUx = b.faceZ
    const leftUz = -b.faceX
    const xf = meta.xFrac ?? 0

    return [{
      buildingKey: key,
      signIdx,
      position: [frontX + leftUx * (xf * frontWidth), y, frontZ + leftUz * (xf * frontWidth)],
      rotation: [0, rotYFront, 0],
      width: planeW,
      height: planeH,
      doubleSided: false,
    }]
  }

  if (mount === 'side') {
    const meta = SIGN_META[signIdx]
    const ratio = meta.w / meta.h

    const sideSign = lcg(s + 47) < 0.5 ? -1 : 1
    // 측면 unit vector: face와 perpendicular한 horizontal vector
    const sideUx = b.faceZ * sideSign
    const sideUz = -b.faceX * sideSign
    const sideHalf = isFaceX ? b.d / 2 : b.w / 2

    // 측면 표면 위 + 정면 코너 가까이
    const cornerMargin = 0.4 + lcg(s + 53) * 0.6
    const surfaceX = b.cx + b.faceX * (frontHalfExtent - cornerMargin) + sideUx * (sideHalf + SURFACE_OFFSET)
    const surfaceZ = b.cz + b.faceZ * (frontHalfExtent - cornerMargin) + sideUz * (sideHalf + SURFACE_OFFSET)

    // plane 크기
    const planeW = (0.9 + lcg(s + 41) * 0.6) * SIGN_SCALE  // 0.9~1.5m × scale
    let planeH = planeW / ratio
    if (planeH > 3.5 * SIGN_SCALE) planeH = 3.5 * SIGN_SCALE

    // plane을 정면 방향으로 (planeW/2 - bury + SIDE_PROTRUDE)만큼 밀어내서
    // 인접 건물 사이에 끼지 않게 — 중간 정도 돌출
    const bury = 0.15
    const SIDE_PROTRUDE = 0.7
    const protrudeDist = planeW / 2 - bury + SIDE_PROTRUDE // 측면 표면 → plane 중심 거리
    const px = surfaceX + b.faceX * protrudeDist
    const pz = surfaceZ + b.faceZ * protrudeDist

    // 70% 옥상 부근 / 30% 1F 점포 위
    const isUpperSide = lcg(s + 67) < 0.7
    const y = isUpperSide
      ? Math.max(b.h - planeH / 2 - 0.3, 5.0)
      : 5.0 + lcg(s + 31) * 1.0

    const rotY = Math.atan2(sideUx, sideUz)
    // 건물 측면 표면 → 간판 텍스처의 건물 쪽 가장자리를 잇는 막대 (face 축 방향)
    const barLen = protrudeDist - planeW / 2 // surface → plane 안쪽 끝
    const barMidX = surfaceX + b.faceX * (barLen / 2)
    const barMidZ = surfaceZ + b.faceZ * (barLen / 2)
    return [{
      buildingKey: key,
      signIdx,
      position: [px, y, pz],
      rotation: [0, rotY, 0],
      width: planeW,
      height: planeH,
      doubleSided: true,
      bar: {
        position: [barMidX, y, barMidZ],
        rotation: [0, rotYFront, 0],
        length: barLen,
        thickness: 0.08,
      },
    }]
  }

  // roof
  const meta = SIGN_META[signIdx]
  const ratio = meta.w / meta.h

  const widthFrac = (0.5 + lcg(s + 41) * 0.3) * SIGN_SCALE
  let planeW = frontWidth * widthFrac
  let planeH = planeW / ratio
  const maxH = 4.0 * SIGN_SCALE
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
  const [{ signsLineup: lineup }] = useCh2Toggles()
  const placements = useMemo(() => {
    // QA lineup 모드 — 25장을 플레이어 정면(z=-15)에 5×5 그리드로. 디버그 전용.
    // 플레이어는 (0, 2, -8)에서 -Z 방향(남쪽 출구)을 보므로 z=-15가 정면.
    if (lineup) {
      const result: SignPlacement[] = []
      const PER_ROW = 5
      const CELL = 1.8       // 셀 크기 (m)
      const MARGIN = 0.1
      const maxDim = CELL - MARGIN
      const Z = -15
      SIGN_META.forEach((meta, signIdx) => {
        if (meta.disabled) return
        const ratio = meta.w / meta.h
        // 셀 안에 letterbox로 맞춤 — 가로형이면 W=maxDim, 세로형이면 H=maxDim
        const w = ratio >= 1 ? maxDim : maxDim * ratio
        const h = ratio >= 1 ? maxDim / ratio : maxDim
        const col = signIdx % PER_ROW
        const row = Math.floor(signIdx / PER_ROW)
        const x = (col - (PER_ROW - 1) / 2) * CELL
        const y = 1.0 + row * CELL
        result.push({
          buildingKey: `lineup-${signIdx}`,
          signIdx,
          position: [x, y, Z],
          rotation: [0, 0, 0],
          width: w,
          height: h,
          doubleSided: true,
        })
      })
      return result
    }

    if (buildings.length === 0) return []
    const ordered = [...buildings].sort((a, b) => a.seed - b.seed)
    const usedSlots = new Set<string>()
    const result: SignPlacement[] = []

    SIGN_META.forEach((meta, signIdx) => {
      if (meta.disabled) return // 미배치 — 단 signIdx는 forEach가 유지 → 타 간판 위치 불변
      const preferred: Mount[] =
        meta.forceMount ? [meta.forceMount]
        : meta.category === 'vertical' ? ['side', 'front', 'roof']
        : meta.category === 'horizontal' ? ['front', 'roof', 'side']
        : ['front', 'side', 'roof']

      const startBldg = signIdx % ordered.length
      const tryPlace = (allowReuse: boolean): boolean => {
        for (let bOff = 0; bOff < ordered.length; bOff++) {
          const bIdx = (startBldg + bOff) % ordered.length
          if (ordered[bIdx].noSign) continue   // 제외 빌딩 — 다음 빌딩으로 넘김 (길이/순서 불변)
          for (const mount of preferred) {
            const slot = `${bIdx}-${mount}`
            if (!allowReuse && usedSlots.has(slot)) continue
            usedSlots.add(slot)
            const b = ordered[bIdx]
            const planned = planSignsForBuilding(b, `b${bIdx}-s${signIdx}`, mount, signIdx, signIdx * 1009)
            const dy = SIGN_META[signIdx].yOffset ?? 0
            if (dy) planned.forEach(pl => { pl.position[1] += dy })
            result.push(...planned)
            return true
          }
        }
        return false
      }
      if (!tryPlace(false)) tryPlace(true)
    })
    return result
  }, [buildings, lineup])

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
      const url = `${BASE}assets/tex/signs/${SIGN_META[i].file}`
      loader.loadAsync(url).then(tex => {
        if (cancelled) return
        tex.colorSpace = THREE.SRGBColorSpace
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping
        tex.anisotropy = 8
        tex.needsUpdate = true
        setTextures(prev => {
          if (prev.has(i)) return prev
          const next = new Map(prev)
          next.set(i, tex)
          return next
        })
      }).catch(err => {
        console.warn('[CH2] sign texture load failed:', url, err)
      })
    })
    return () => { cancelled = true }
  }, [usedIndices])

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
        alphaTest: 0.5,
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
    <group name="signs">
      {placements.map((p, i) => {
        const key = `${p.signIdx}-${p.doubleSided ? 'd' : 's'}`
        const mat = materials.get(key)
        if (!mat) return null
        const slug = SIGN_META[p.signIdx].file.replace(/\.[a-z]+$/i, '')
        return (
          <group key={`sign-${p.buildingKey}-${i}`}>
            <mesh
              name={`sign-${String(p.signIdx).padStart(2, '0')}-${slug}`}
              position={p.position}
              rotation={p.rotation}
            >
              <planeGeometry args={[p.width, p.height]} />
              <primitive object={mat} attach="material" />
            </mesh>
            {p.bar && (
              <mesh position={p.bar.position} rotation={p.bar.rotation}>
                <boxGeometry args={[p.bar.thickness, p.bar.thickness, p.bar.length]} />
                <meshStandardMaterial color="#2a2a2a" roughness={0.6} metalness={0.4} />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}
