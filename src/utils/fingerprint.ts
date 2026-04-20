/**
 * 브라우저 지문 → 결정적 해시 닉네임
 * 같은 브라우저/기기에서 항상 같은 "userXXXXXXXXX" 반환
 */

const STORAGE_KEY = 'maphack_visitor_id'

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hash = await crypto.subtle.digest('SHA-256', data)
  const arr = Array.from(new Uint8Array(hash))
  return arr.map((b) => b.toString(16).padStart(2, '0')).join('')
}

function collectSignals(): string {
  const signals = [
    navigator.userAgent,
    navigator.language,
    screen.width + 'x' + screen.height,
    screen.colorDepth,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.hardwareConcurrency,
    navigator.maxTouchPoints,
  ]

  // Canvas fingerprint
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 200
    canvas.height = 50
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.textBaseline = 'top'
      ctx.font = "14px 'Arial'"
      ctx.fillStyle = '#f60'
      ctx.fillRect(125, 1, 62, 20)
      ctx.fillStyle = '#069'
      ctx.fillText('mahn_mal', 2, 15)
      ctx.fillStyle = 'rgba(102,204,0,0.7)'
      ctx.fillText('mahn_mal', 4, 17)
      signals.push(canvas.toDataURL())
    }
  } catch {
    // canvas blocked
  }

  return signals.join('|')
}

function numericHash(hex: string, digits: number): string {
  // Convert hex chars to a stable numeric string
  let num = ''
  for (let i = 0; i < hex.length && num.length < digits; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16)
    num += byte.toString()
  }
  return num.slice(0, digits)
}

export async function getVisitorNickname(): Promise<string> {
  // Check localStorage first (ensures consistency even if fingerprint drifts)
  const cached = localStorage.getItem(STORAGE_KEY)
  if (cached) return cached

  const signals = collectSignals()
  const hash = await sha256(signals)
  const digits = numericHash(hash, 9)
  const nickname = 'user' + digits

  localStorage.setItem(STORAGE_KEY, nickname)
  return nickname
}
