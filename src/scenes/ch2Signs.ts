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
};

export const SIGN_META: SignMeta[] = [
  { file: '1776676180242_adt9hb0tx5k.webp', w: 949, h: 1080, category: 'square' },
  { file: '1776729463932_73ycytf6x83.webp', w: 1080, h: 810, category: 'square' },
  { file: '1776781721572_tutvpw0yz8.webp', w: 1080, h: 870, category: 'square' },
  { file: '1776843179758_wnktbdxnstg.webp', w: 564, h: 564, category: 'square' },
  { file: '1776932608987_alatxeoo5uj.webp', w: 811, h: 1080, category: 'vertical' },
  { file: '1776937116388_cxst7iy0f.webp', w: 370, h: 244, category: 'square' },
  { file: '1777118560024_d8hvmzgjibt.webp', w: 800, h: 606, category: 'square' },
  { file: '1777194386697_rtnqj03wua.webp', w: 810, h: 1080, category: 'vertical' },
  { file: '1777684504281_gawu13nlw5.webp', w: 810, h: 1080, category: 'vertical' },
  { file: '1778130927141_drxo7cvrpnl.webp', w: 810, h: 1080, category: 'vertical' },
  { file: 'SCR-20260513-ttbp.webp', w: 826, h: 234, category: 'horizontal' },
  { file: 'SCR-20260513-ttfj.webp', w: 731, h: 902, category: 'square' },
  { file: 'SCR-20260513-ttjq.webp', w: 1140, h: 338, category: 'horizontal' },
  { file: 'SCR-20260513-ttmo.webp', w: 1164, h: 263, category: 'horizontal' },
  { file: 'SCR-20260513-ttoi.webp', w: 181, h: 962, category: 'vertical' },
  { file: 'SCR-20260513-ttyg.webp', w: 1178, h: 316, category: 'horizontal' },
  { file: 'SCR-20260513-ttzz.webp', w: 1043, h: 315, category: 'horizontal' },
  { file: 'SCR-20260513-tubg.webp', w: 429, h: 496, category: 'square' },
  { file: 'SCR-20260513-tuha.webp', w: 970, h: 221, category: 'horizontal' },
  { file: 'SCR-20260513-tuou.webp', w: 707, h: 285, category: 'horizontal' },
  { file: 'SCR-20260513-turi.webp', w: 825, h: 802, category: 'square' },
  { file: 'SCR-20260513-tust.webp', w: 975, h: 380, category: 'horizontal' },
  { file: 'SCR-20260513-tuvg.webp', w: 718, h: 612, category: 'square' },
  { file: 'SCR-20260513-tvfh.webp', w: 1042, h: 484, category: 'horizontal' },
  { file: 'SCR-20260513-tvkd.webp', w: 386, h: 440, category: 'square' },
  { file: 'IMG_0817.webp', w: 1500, h: 894, category: 'horizontal' },
  { file: 'IMG_0818.webp', w: 1500, h: 1154, category: 'square' },
];

export const SIGNS_BY_CATEGORY: Record<SignCategory, number[]> = {
  horizontal: SIGN_META.map((m, i) => (m.category === 'horizontal' ? i : -1)).filter(i => i >= 0),
  vertical: SIGN_META.map((m, i) => (m.category === 'vertical' ? i : -1)).filter(i => i >= 0),
  square: SIGN_META.map((m, i) => (m.category === 'square' ? i : -1)).filter(i => i >= 0),
};
