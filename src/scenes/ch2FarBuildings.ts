/**
 * CH.2 원경 빌딩 데이터 — Ch2Scene과 Ch2CustomBuildings 공용.
 * (순환 import 방지를 위해 Ch2Scene에서 분리)
 */
import { SCALE_X, SCALE_Z } from '@/scenes/ch2Layout';

export type BgBuilding = { x: number; z: number; w: number; h: number; d: number; texSeed: number };

// 원경 layer — 도로 bbox 밖 4방향(동/서/북/남)에 솟은 고층빌딩. 30~80m. fog 위로
// silhouette처럼 보이는 도시 거리감. 콜라이더 없음.
export const FAR_BUILDINGS: BgBuilding[] = (() => {
  const out: BgBuilding[] = [];
  // [중심cx, 중심cz, 개수] — raw 좌표. 도로 bbox x∈[-7,27], z∈[-90,3] 바깥.
  const clusters: Array<[number, number, number]> = [
    [60,   -10, 5],  // 동쪽 멀리
    [-50,  -40, 4],  // 서쪽 멀리
    [10,    40, 4],  // 북쪽 멀리
    [10,  -130, 5],  // 남쪽 멀리
  ];
  clusters.forEach(([cx, cz, count], ci) => {
    for (let i = 0; i < count; i++) {
      const seed = ci * 97 + i * 31;
      const r1 = ((seed * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff;
      const r2 = (((seed + 5)  * 22695477   + 1)     & 0x7fffffff) / 0x7fffffff;
      const r3 = (((seed + 11) * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const r4 = (((seed + 17) * 1664525    + 1013904223) & 0x7fffffff) / 0x7fffffff;
      const bx = (cx + (r1 - 0.5) * 30) * SCALE_X;  // ±15 raw 분산
      const bz = (cz + (r2 - 0.5) * 30) * SCALE_Z;
      const bw = 8 + r3 * 10;    // 8~18m
      const bh = 30 + r4 * 50;   // 30~80m
      const bd = 8 + r1 * 10;
      const texSeed = ci * 13 + i * 7;
      out.push({ x: bx, z: bz, w: bw, h: bh, d: bd, texSeed });
    }
  });
  return out;
})();
