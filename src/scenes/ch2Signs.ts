/**
 * CH.2 간판 메타데이터 — `public/assets/tex/signs/` 실 픽셀 사이즈 측정 결과.
 * SignManager가 자산 분류·랜덤 배치 시 사용.
 *
 * ratio = w / h
 *   - 가로형 (ratio >= 1.6): 정면 decal, 옥상 빌보드(가로)
 *   - 세로형 (ratio <= 0.625): 옆구리 직각 돌출, 옥상 빌보드(세로)
 *   - 정방형 (between): 정면 decal, 옆구리 돌출, 옥상
 */
export type SignCategory = 'horizontal' | 'vertical' | 'square';

export type SignMeta = {
  file: string;
  w: number;
  h: number;
  category: SignCategory;
  /** 지정 시 category 무관하게 이 mount로 강제 (예: 옆구리 돌출 원형 간판) */
  forceMount?: 'front' | 'side' | 'roof';
  /** 건물 정면 하단(지면) 정렬 대형 입구 이미지 — 5배 크게 */
  entrance?: boolean;
  /** true면 미배치(렌더 X) — 단, 배열에 남겨 signIdx 보존 → 타 간판 위치 불변 */
  disabled?: boolean;
  /** 자동배치 y에 더하는 높이 보정 (m) */
  yOffset?: number;
  /** 정면 배치 시 좌(-)/우(+) 수평 이동 — frontWidth 비율 */
  xFrac?: number;
  /** true면 정면 배치 시 하단을 빌딩 바닥에 정렬(지면 부착) */
  ground?: boolean;
};

export const SIGN_META: SignMeta[] = [
  { file: '1776676180242_adt9hb0tx5k.webp', w: 949, h: 1080, category: 'square', forceMount: 'front', xFrac: -0.32, ground: true },
  { file: '1776729463932_73ycytf6x83.webp', w: 1080, h: 810, category: 'square' },
  { file: '1776781721572_tutvpw0yz8.webp', w: 1080, h: 870, category: 'square', disabled: true }, // 셔터문 — 미배치(인덱스 보존)
  { file: '1776843179758_wnktbdxnstg.webp', w: 564, h: 564, category: 'square' },
  { file: '1776932608987_alatxeoo5uj.webp', w: 811, h: 1080, category: 'vertical', disabled: true }, // PINNED로 이관(Ch2Scene) — 미배치(인덱스 보존)
  { file: '1776937116388_cxst7iy0f.webp', w: 370, h: 244, category: 'square' },
  { file: '1777118560024_d8hvmzgjibt.webp', w: 800, h: 606, category: 'square' },
  { file: '1777194386697_rtnqj03wua.webp', w: 810, h: 1080, category: 'vertical', disabled: true }, // 원경 건물(LANDMARK)로만 — 미배치
  { file: '1777684504281_gawu13nlw5.webp', w: 810, h: 1080, category: 'vertical', forceMount: 'front', entrance: true },
  { file: '1778130927141_drxo7cvrpnl.webp', w: 810, h: 1080, category: 'vertical', disabled: true }, // PINNED로 이관(Ch2Scene door-1778) — 미배치(인덱스 보존)
  { file: 'SCR-20260513-ttbp.webp', w: 826, h: 234, category: 'horizontal' },
  { file: 'SCR-20260513-ttfj.webp', w: 731, h: 902, category: 'square', disabled: true }, // 지정 건물 고정 부착(자동배치 제외)
  { file: 'SCR-20260513-ttjq.webp', w: 1140, h: 338, category: 'horizontal' },
  { file: 'SCR-20260513-ttmo.webp', w: 1164, h: 263, category: 'horizontal' },
  { file: 'SCR-20260513-ttoi.webp', w: 181, h: 962, category: 'vertical', forceMount: 'side' }, // 모서리 돌출 미니
  { file: 'SCR-20260513-ttyg.webp', w: 1178, h: 316, category: 'horizontal' },
  { file: 'SCR-20260513-ttzz.webp', w: 1043, h: 315, category: 'horizontal' },
  { file: 'SCR-20260513-tubg.webp', w: 429, h: 496, category: 'square', forceMount: 'side' }, // 모서리 돌출 미니
  { file: 'SCR-20260513-tuha.webp', w: 970, h: 221, category: 'horizontal' },
  { file: 'SCR-20260513-tuou.webp', w: 707, h: 285, category: 'horizontal', yOffset: 3 },
  { file: 'SCR-20260513-turi.webp', w: 825, h: 802, category: 'square', forceMount: 'side' },
  { file: 'SCR-20260513-tust.webp', w: 975, h: 380, category: 'horizontal' },
  { file: 'SCR-20260513-tuvg.webp', w: 718, h: 612, category: 'square', disabled: true }, // 지정 건물 고정 부착(자동배치 제외)
  { file: 'SCR-20260513-tvfh.webp', w: 1042, h: 484, category: 'horizontal' },
  { file: 'SCR-20260513-tvkd.webp', w: 386, h: 440, category: 'square', forceMount: 'side' }, // 모서리 돌출 미니
  { file: 'IMG_0817.webp', w: 1500, h: 894, category: 'horizontal', disabled: true }, // PINNED로 이관(Ch2Scene) — 미배치(인덱스 보존)
  { file: 'IMG_0818.webp', w: 1500, h: 1154, category: 'square', disabled: true }, // 파일 삭제됨 — 미배치(인덱스 보존)
];

export const SIGNS_BY_CATEGORY: Record<SignCategory, number[]> = {
  horizontal: SIGN_META.map((m, i) => (m.category === 'horizontal' ? i : -1)).filter(i => i >= 0),
  vertical: SIGN_META.map((m, i) => (m.category === 'vertical' ? i : -1)).filter(i => i >= 0),
  square: SIGN_META.map((m, i) => (m.category === 'square' ? i : -1)).filter(i => i >= 0),
};
