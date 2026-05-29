// ch.3 ghost 스폰 후보 스캔 — ItaewonLayer(실제 스폰)와 Ch3Scene(약 먹을 때 정면 보장 re-roll)이 공유.
// 단일 소스로 둬서 "re-roll 판정"과 "실제 스폰 선택"이 동일 기준을 쓰게 한다.
import { cellToWorld } from './mazeGenerator'

export interface WallRect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

export interface GhostCandidate {
  gx: number
  gy: number
  dist: number
  inView: boolean
}

export interface GhostScanParams {
  walls: WallRect[]
  pCellX: number
  pCellY: number
  camX: number
  camZ: number
  /** 정규화된 카메라 정면(XZ) */
  fwdX: number
  fwdZ: number
  /** 화면 안 판정 cos 임계 (dot >= inViewCos → inView) */
  inViewCos: number
  cellSize: number
  mazeSize: number
  prevCell?: { gx: number; gy: number } | null
  /** ghost 몸통 반폭 (clear-LOS 3광선 offset) */
  ghostHalf?: number
  /** 최소 스폰 거리(셀, Chebyshev) */
  minCheb?: number
  /** 스캔 반경(셀) */
  maxR?: number
}

// 2D line vs AABB (XZ plane) — camera → target 사이 벽 occlusion 체크용
export function lineIntersectsAABB(
  x0: number, z0: number,
  x1: number, z1: number,
  minX: number, maxX: number, minZ: number, maxZ: number,
): boolean {
  const dx = x1 - x0
  const dz = z1 - z0
  let tmin = 0
  let tmax = 1
  if (Math.abs(dx) < 1e-8) {
    if (x0 < minX || x0 > maxX) return false
  } else {
    const t1 = (minX - x0) / dx
    const t2 = (maxX - x0) / dx
    tmin = Math.max(tmin, Math.min(t1, t2))
    tmax = Math.min(tmax, Math.max(t1, t2))
    if (tmin > tmax) return false
  }
  if (Math.abs(dz) < 1e-8) {
    if (z0 < minZ || z0 > maxZ) return false
  } else {
    const t1 = (minZ - z0) / dz
    const t2 = (maxZ - z0) / dz
    tmin = Math.max(tmin, Math.min(t1, t2))
    tmax = Math.min(tmax, Math.max(t1, t2))
    if (tmin > tmax) return false
  }
  return tmax >= 0 && tmin <= 1
}

/**
 * 후방(270° 밖) 제외 + clear-LOS + 최소거리(minCheb) 하드 제약을 통과한 cell 후보 전부.
 * 각 후보의 inView = 실제 화면 안(±halfH) 여부.
 */
export function scanGhostCandidates(p: GhostScanParams): GhostCandidate[] {
  const {
    walls, pCellX, pCellY, camX, camZ, fwdX, fwdZ, inViewCos,
    cellSize, mazeSize, prevCell, ghostHalf = 0.5, minCheb = 2, maxR = 4,
  } = p

  // camera→target 사이 벽 차단 검사. ghost 폭(±ghostHalf) 양 끝까지 3광선 전부 통과해야 clear.
  // 풀 wall bounds 사용(inset 없음) — 모서리 스쳐 지나가는 false-clear 방지.
  const hasClearLOS = (tx: number, tz: number): boolean => {
    if (!walls || walls.length === 0) return true
    const dx = tx - camX
    const dz = tz - camZ
    const len = Math.hypot(dx, dz) || 1
    const ox = (-dz / len) * ghostHalf // sightline 수직 offset (몸통 폭)
    const oz = (dx / len) * ghostHalf
    const rays: [number, number][] = [[tx, tz], [tx + ox, tz + oz], [tx - ox, tz - oz]]
    for (const [rx, rz] of rays) {
      const blocked = walls.some((w) =>
        lineIntersectsAABB(camX, camZ, rx, rz, w.minX, w.maxX, w.minZ, w.maxZ),
      )
      if (blocked) return false
    }
    return true
  }

  const candidates: GhostCandidate[] = []
  for (let oy = -maxR; oy <= maxR; oy++) {
    for (let ox = -maxR; ox <= maxR; ox++) {
      if (Math.max(Math.abs(ox), Math.abs(oy)) < minCheb) continue // 본인 셀 + 너무 가까운 셀 제외
      const cx = pCellX + ox
      const cy = pCellY + oy
      if (cx < 0 || cx >= mazeSize || cy < 0 || cy >= mazeSize) continue
      if (prevCell && prevCell.gx === cx && prevCell.gy === cy) continue
      const tw = cellToWorld(cx, cy, cellSize)
      const dxg = tw.x - camX
      const dzg = tw.z - camZ
      const len = Math.hypot(dxg, dzg)
      if (len < 0.001) continue
      const dot = (fwdX * dxg + fwdZ * dzg) / len
      if (dot < -0.707) continue // 완전 후방 제외(폴백 후보로만)
      if (!hasClearLOS(tw.x, tw.z)) continue // 벽에 가려짐
      candidates.push({ gx: cx, gy: cy, dist: Math.hypot(ox, oy), inView: dot >= inViewCos })
    }
  }
  return candidates
}
