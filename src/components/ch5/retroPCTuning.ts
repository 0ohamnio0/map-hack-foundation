export type RetroPCTuning = {
  gradientTop: number
  gradientBottom: number
  lightAmbient: number
  lightIntensity: number
  lightDirX: number
  lightDirY: number
  lightDirZ: number
  saturation: number
  /** Screen bloom intensity — drives EffectComposer Bloom for CRT glow */
  screenGlow: number
  // ─── CRT shader (VFX-JS port) ────────────────────────
  /** 콘텐츠 크기 — 워프 적용 전 uv 축소. >1=콘텐츠 커짐, <1=작아짐 */
  crtScale: number
  /** pow(l,2) * X — 가장자리로 갈수록 zoom 변화량 */
  crtWarpStrength: number
  /** 0.5+dist의 baseline — 1.0=중심 줌 없음, 0.5=중심 강한 확대 */
  crtCenterZoom: number
  /** 각도×시간 랜덤 outward jitter 강도 */
  crtJitter: number
  /** R/B 채널 좌우 base offset */
  crtAberration: number
  /** y-sin 모듈레이션 aberration zoom 분리량 */
  crtAberrationZoom: number
  /** 고주파 vertical 스캔라인 강도 */
  crtScanline: number
  /** 20x20 그리드 라인 강도 */
  crtGrid: number
  /** 중심부 base brightness (1.8 = 원본). 낮을수록 가장자리 어두움 */
  crtVignette: number
  /** 시간 의존 dither 노이즈 */
  crtDither: number
  /** 최종 multiplier — bloom emission 감쇠 */
  crtBrightness: number
  // ─── 3D 방 (floor + back wall) ────────────────────────
  /** 바닥 plane Y 위치 — 올리면 PC가 더 깊이 박힘 */
  floorY: number
  /** 뒷벽 plane Z 위치 (음수 = 카메라 반대쪽으로 멀어짐) */
  wallZ: number
  /** 뒷벽 plane Y 중심 — 보통 floorY + 벽 높이/2 */
  wallY: number
  // ─── Room vignette (크레딧 영역 어둡게) ──────────────
  /** radial-gradient 중심 X (%) — PC 위치 기준 */
  vignetteCx: number
  /** ellipse 가로 반지름 (%) */
  vignetteW: number
  /** ellipse 세로 반지름 (%) */
  vignetteH: number
  /** 투명 영역 끝 (%) — 이 지점부터 어두워지기 시작 */
  vignetteInner: number
  /** 최대 어둠 alpha (0~1) */
  vignetteAlpha: number
}

export const DEFAULT_TUNING: RetroPCTuning = {
  gradientTop: 0.56,
  gradientBottom: 0.68,
  lightAmbient: 0.29,
  lightIntensity: 0.91,
  lightDirX: -1,
  lightDirY: -0.31,
  lightDirZ: 0.29,
  saturation: 0,
  screenGlow: 1.76,
  crtScale: 1.41,
  crtWarpStrength: 0,
  crtCenterZoom: 1.5,
  crtJitter: 0.18,
  crtAberration: 0.02,
  crtAberrationZoom: 0.01,
  crtScanline: 0.365,
  crtGrid: 0,
  crtVignette: 1.43,
  crtDither: 0,
  crtBrightness: 0.99,
  floorY: -0.05,
  wallZ: -1.11,
  wallY: 0.6,
  vignetteCx: 28,
  vignetteW: 48,
  vignetteH: 42,
  vignetteInner: 41,
  vignetteAlpha: 0.91,
}

// 셧다운 화면(시스템 전원을 끄셔도 됩니다) 전용 — 정적인 단색 splash에 맞춰 워프·왜곡 약하게
export const SHUTDOWN_TUNING: RetroPCTuning = {
  ...DEFAULT_TUNING,
  crtScale: 1.34,
  crtWarpStrength: 0,
  crtCenterZoom: 1.09,
  crtJitter: 0.18,
  crtAberration: 0,
  crtAberrationZoom: 0.01,
  crtScanline: 0.06,
  crtGrid: 0,
  crtVignette: 0.93,
  crtDither: 0,
  crtBrightness: 0.56,
}
