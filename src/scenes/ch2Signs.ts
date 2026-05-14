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
  { file: '1776676180242_adt9hb0tx5k.jpg', w: 949, h: 1080, category: 'square' },
  { file: '1776729463932_73ycytf6x83.jpg', w: 1080, h: 810, category: 'square' },
  { file: '1776781721572_tutvpw0yz8.jpg', w: 1080, h: 870, category: 'square' },
  { file: '1776843179758_wnktbdxnstg.jpg', w: 564, h: 564, category: 'square' },
  { file: '1776932608987_alatxeoo5uj.jpg', w: 811, h: 1080, category: 'vertical' },
  { file: '1776937116388_cxst7iy0f.jpg', w: 370, h: 244, category: 'square' },
  { file: '1777118560024_d8hvmzgjibt.jpg', w: 800, h: 606, category: 'square' },
  { file: '1777194386697_rtnqj03wua.jpg', w: 810, h: 1080, category: 'vertical' },
  { file: '1777684504281_gawu13nlw5.jpg', w: 810, h: 1080, category: 'vertical' },
  { file: '1778130927141_drxo7cvrpnl.jpg', w: 810, h: 1080, category: 'vertical' },
  { file: 'SCR-20260513-ttbp.png', w: 826, h: 234, category: 'horizontal' },
  { file: 'SCR-20260513-ttfj.png', w: 731, h: 902, category: 'square' },
  { file: 'SCR-20260513-ttjq.png', w: 1140, h: 338, category: 'horizontal' },
  { file: 'SCR-20260513-ttmo.png', w: 1164, h: 263, category: 'horizontal' },
  { file: 'SCR-20260513-ttoi.png', w: 181, h: 962, category: 'vertical' },
  { file: 'SCR-20260513-ttyg.png', w: 1178, h: 316, category: 'horizontal' },
  { file: 'SCR-20260513-ttzz.png', w: 1043, h: 315, category: 'horizontal' },
  { file: 'SCR-20260513-tubg.png', w: 429, h: 496, category: 'square' },
  { file: 'SCR-20260513-tuha.png', w: 970, h: 221, category: 'horizontal' },
  { file: 'SCR-20260513-tuou.png', w: 707, h: 285, category: 'horizontal' },
  { file: 'SCR-20260513-turi.png', w: 825, h: 802, category: 'square' },
  { file: 'SCR-20260513-tust.png', w: 975, h: 380, category: 'horizontal' },
  { file: 'SCR-20260513-tuvg.png', w: 718, h: 612, category: 'square' },
  { file: 'SCR-20260513-tvfh.png', w: 1042, h: 484, category: 'horizontal' },
  { file: 'SCR-20260513-tvkd.png', w: 386, h: 440, category: 'square' },
];

export const SIGNS_BY_CATEGORY: Record<SignCategory, number[]> = {
  horizontal: SIGN_META.map((m, i) => (m.category === 'horizontal' ? i : -1)).filter(i => i >= 0),
  vertical: SIGN_META.map((m, i) => (m.category === 'vertical' ? i : -1)).filter(i => i >= 0),
  square: SIGN_META.map((m, i) => (m.category === 'square' ? i : -1)).filter(i => i >= 0),
};
