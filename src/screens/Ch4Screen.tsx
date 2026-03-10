/**
 * STEP 6: CH.4 사과문 — Random Freeze Canvas 2D
 * - 8s black → ~20s Random Freeze (3 images patch-cycling) → ending image → CH.5
 * - Canvas itself is the persistent buffer; each frame copies a random rect from current source
 * - Source images cycle A→B→C every 3-5s, creating patchwork of all three
 * - REF-4: ISF Random Freeze converted to Canvas 2D API
 *
 * Assets pending: ch4_en.png, ch4_ko.png, ch4_photo.png, ch4_ending.png
 * Stub: generates colored placeholder canvases with text labels
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { useSoundManager } from '@/hooks/useSoundManager'

const BASE = import.meta.env.BASE_URL

const SOURCES = [
  `${BASE}assets/images/ch4_en.png`,
  `${BASE}assets/images/ch4_ko.png`,
  `${BASE}assets/images/ch4_photo.png`,
]
const ENDING_SRC = `${BASE}assets/images/ch4_ending.png`

const CYCLE_INTERVAL = 4000
const FREEZE_DURATION = 20000
const BLACK_DURATION = 8000
const ENDING_HOLD = 3000

type Phase = 'black' | 'freeze' | 'ending'

/** Generate a stub placeholder image (colored canvas with label text) */
function createStubImage(
  label: string,
  bgColor: string,
  w: number,
  h: number,
): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  ctx.fillStyle = bgColor
  ctx.fillRect(0, 0, w, h)

  // Dashed border
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.setLineDash([8, 6])
  ctx.lineWidth = 2
  ctx.strokeRect(20, 20, w - 40, h - 40)

  // Label
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  ctx.font = '24px monospace'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(`[ ${label} ]`, w / 2, h / 2)

  return c
}

export const Ch4Screen: React.FC = () => {
  const goToChapter = useGameStore((s) => s.goToChapter)
  const { play, stop } = useSoundManager()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [phase, setPhase] = useState<Phase>('black')

  // Image sources: real images or stub fallbacks
  const imagesRef = useRef<(HTMLImageElement | HTMLCanvasElement)[]>([])
  const endingRef = useRef<HTMLImageElement | HTMLCanvasElement | null>(null)
  const loadedRef = useRef<boolean[]>([false, false, false])
  const endingLoadedRef = useRef(false)

  const currentSourceRef = useRef(0)
  const freezeStartRef = useRef(0)
  const frameIdRef = useRef(0)

  // Preload images — fall back to stub if load fails or asset missing
  useEffect(() => {
    const w = window.innerWidth
    const h = window.innerHeight

    const stubColors = ['#1a1a2e', '#2e1a1a', '#1a2e1a']
    const stubLabels = ['ch4_en.png', 'ch4_ko.png', 'ch4_photo.png']

    const stubs = stubLabels.map((label, i) =>
      createStubImage(label, stubColors[i], w, h),
    )
    imagesRef.current = stubs

    // Try loading real images
    SOURCES.forEach((src, i) => {
      const img = new Image()
      img.onload = () => {
        imagesRef.current[i] = img
        loadedRef.current[i] = true
      }
      img.onerror = () => {
        // Keep stub
      }
      img.src = src
    })

    // Ending image
    const endingStub = createStubImage(
      'ch4_ending.png',
      '#0a0a0a',
      w,
      h,
    )
    endingRef.current = endingStub

    const endImg = new Image()
    endImg.onload = () => {
      endingRef.current = endImg
      endingLoadedRef.current = true
    }
    endImg.src = ENDING_SRC
  }, [])

  // Phase sequencing
  useEffect(() => {
    play('phone_ring')

    const t1 = setTimeout(() => {
      setPhase('freeze')
    }, BLACK_DURATION)

    return () => clearTimeout(t1)
  }, [play])

  useEffect(() => {
    if (phase !== 'freeze') return

    const t = setTimeout(() => {
      stop('phone_ring')
      setPhase('ending')
    }, FREEZE_DURATION)

    return () => clearTimeout(t)
  }, [phase, stop])

  useEffect(() => {
    if (phase !== 'ending') return

    // Draw ending image full-canvas
    const canvas = canvasRef.current
    if (canvas && endingRef.current) {
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(endingRef.current, 0, 0, canvas.width, canvas.height)
      }
    }

    const t = setTimeout(() => {
      play('screen_on')
      goToChapter('CH5')
    }, ENDING_HOLD)

    return () => clearTimeout(t)
  }, [phase, goToChapter, play])

  // Random Freeze animation loop
  const animate = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas || phase !== 'freeze') return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const w = canvas.width
    const h = canvas.height
    const elapsed = Date.now() - freezeStartRef.current

    // Cycle source image: A → B → C → A → …
    currentSourceRef.current = Math.floor(elapsed / CYCLE_INTERVAL) % SOURCES.length
    const src = imagesRef.current[currentSourceRef.current]
    if (!src) {
      frameIdRef.current = requestAnimationFrame(animate)
      return
    }

    // maxUpdateSize grows over time: 0.3 → 0.5 over 20s
    const progress = Math.min(elapsed / FREEZE_DURATION, 1)
    const maxUpdateSize = 0.3 + progress * 0.2

    // Draw 2-4 random patches per frame for faster coverage
    const patchCount = 2 + Math.floor(progress * 2)
    for (let p = 0; p < patchCount; p++) {
      const rx = Math.random()
      const ry = Math.random()
      const rw = Math.random() * maxUpdateSize
      const rh = Math.random() * maxUpdateSize

      const sx = rx * w
      const sy = ry * h
      const sw = rw * w
      const sh = rh * h

      // Source coords (same normalized position in the source image)
      const srcW = (src as HTMLCanvasElement).width ?? (src as HTMLImageElement).naturalWidth ?? w
      const srcH = (src as HTMLCanvasElement).height ?? (src as HTMLImageElement).naturalHeight ?? h

      ctx.drawImage(
        src,
        rx * srcW,
        ry * srcH,
        rw * srcW,
        rh * srcH,
        sx,
        sy,
        sw,
        sh,
      )
    }

    frameIdRef.current = requestAnimationFrame(animate)
  }, [phase])

  // Start/stop animation loop
  useEffect(() => {
    if (phase === 'freeze') {
      freezeStartRef.current = Date.now()

      // Fill canvas with first source initially
      const canvas = canvasRef.current
      if (canvas) {
        const ctx = canvas.getContext('2d')
        const src = imagesRef.current[0]
        if (ctx && src) {
          ctx.drawImage(src, 0, 0, canvas.width, canvas.height)
        }
      }

      frameIdRef.current = requestAnimationFrame(animate)
    }

    return () => {
      if (frameIdRef.current) cancelAnimationFrame(frameIdRef.current)
    }
  }, [phase, animate])

  // Resize canvas to fullscreen
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#0a0a0a',
        zIndex: 100,
        animation: 'fadeIn 2s ease forwards',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          opacity: phase === 'black' ? 0 : 1,
          transition: 'opacity 1s ease',
        }}
      />

      {/* Ending: clean image only, no text overlay */}
    </div>
  )
}
