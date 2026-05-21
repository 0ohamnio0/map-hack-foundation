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
}
