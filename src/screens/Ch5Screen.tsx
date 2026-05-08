/**
 * CH.5 — 블로그 UI ("앙팡 테리블" 네이버 블로그 클론)
 * Monochromatic black/white, Nanum Myeongjo, 5px black border
 * overlayMode: ink bleed 위에 반전 테마 (white on black)
 * blog 탭: mahn_mal 타이핑 → 메시지 → 블로그 포스트 링크 2개 → 엔딩 크레딧
 * guest 탭: 방명록 — 게임 완료 유저가 고유 해시 닉네임으로 글 남김
 */
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useSoundManager } from '@/hooks/useSoundManager'
import { getVisitorNickname } from '@/utils/fingerprint'
import { RetroPCScene } from '@/components/ch5/RetroPCScene'

const TARGET = 'mahn_mal'

/* ─── Chaos text fragment system ─── */
interface TextFragment {
  id: number
  text: string
  x: number      // % position
  y: number      // % position
  fontSize: number
  rotate: number
  opacity: number
  color: string
  font: string
  blend: string
}

const FONTS = [
  "'Nanum Myeongjo', serif",
  "'Courier New', monospace",
  "Georgia, serif",
  "Impact, sans-serif",
  "'Times New Roman', serif",
]

const GLITCH_CHARS = '█▓▒░▌▐▀▄■□▪▫●○◆◇'

const STAGE2_COLORS = ['#000', '#c00', '#009', '#060', '#808', '#c60', '#333', '#900']

function makeFragment(id: number, count: number): TextFragment {
  const stage = count <= 3 ? 1 : 2

  // Stage 1: readable but scattered
  if (stage === 1) {
    return {
      id, text: TARGET,
      x: Math.random() * 80 + 2,
      y: Math.random() * 80 + 2,
      fontSize: 12 + Math.random() * 8,
      rotate: (Math.random() - 0.5) * 15,
      opacity: 0.6 + Math.random() * 0.4,
      color: '#000',
      font: FONTS[0],
      blend: 'normal',
    }
  }

  // Stage 2: visual noise, mixed fonts, glitch chars, color
  const glitchify = Math.random() < 0.3
  let text = TARGET
  if (glitchify) {
    const chars = text.split('')
    const idx = Math.floor(Math.random() * chars.length)
    const glen = 1 + Math.floor(Math.random() * 3)
    for (let i = 0; i < glen && idx + i < chars.length; i++) {
      chars[idx + i] = GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
    }
    text = chars.join('')
  }

  return {
    id, text,
    x: Math.random() * 85 + 2,
    y: Math.random() * 85 + 2,
    fontSize: 9 + Math.random() * 18,
    rotate: (Math.random() - 0.5) * 40,
    opacity: 0.3 + Math.random() * 0.7,
    color: STAGE2_COLORS[Math.floor(Math.random() * STAGE2_COLORS.length)],
    font: FONTS[Math.floor(Math.random() * FONTS.length)],
    blend: Math.random() < 0.3 ? 'multiply' : Math.random() < 0.2 ? 'difference' : 'normal',
  }
}

function makeNoiseBlock(id: number): TextFragment {
  const w = 5 + Math.random() * 20
  return {
    id,
    text: '█'.repeat(2 + Math.floor(Math.random() * 8)),
    x: Math.random() * 90,
    y: Math.random() * 90,
    fontSize: 8 + Math.random() * 14,
    rotate: (Math.random() - 0.5) * 10,
    opacity: 0.15 + Math.random() * 0.4,
    color: Math.random() < 0.5 ? '#000' : STAGE2_COLORS[Math.floor(Math.random() * STAGE2_COLORS.length)],
    font: "'Courier New', monospace",
    blend: 'normal',
  }
}

const BLOG_POSTS = [
  {
    title: 'But Why?',
    date: '2023. 7. 12. 10:42',
    href: 'https://blog.naver.com/0ohihano0/223157858485',
    preview: '왜 이런 글을 쓰게 되었는가에 대한 이야기.',
    category: '일기',
  },
  {
    title: '무서운 이야기',
    date: '2023. 7. 15. 23:18',
    href: 'https://blog.naver.com/0ohihano0/223160793479',
    preview: '내가 경험한 것들에 대해서.',
    category: '일기',
  },
]

/* ─── Seed data: 패닉어택 슈퍼스타 「Dive into anything」 ─── */
interface GuestEntry {
  id: string
  nickname: string
  text: string
  timestamp: string
}

const SEED_ENTRIES: GuestEntry[] = [
  {
    id: 'seed-1',
    nickname: 'user2323130',
    text: '15년 전 살았던 집 내부 구조가 정말 특이했어 나무로 만들어진 커다란 새 모양의 조각상이 집 한가운데에 있고\n불투명한 유리창이 얼룩말 줄무늬처럼 사방에 뚫려 있었지 나랑 누나는 매일 밤 따뜻하게 데운 우유를 마신 후에\n나무 새의 눈알을 핥는 버릇이 있었어\n하지만 다 자라서 누나에게 수차례 물어봐도 그런 건 없었다고 말하더군\n이제는 어디서도 느낄 수 없는 눈알 맛\n바다에 가면 입안에 그 맛이 감돌곤 해',
    timestamp: '2026-02-13T14:02:59.000Z',
  },
  {
    id: 'seed-2',
    nickname: 'user4504049',
    text: '유아 교육용 VHS 테이프\n있잖아 난 그거 편집하는 일을 하고 있어\n어느 날은 녹화가 끝난 스튜디오에 갔는데\n벗어놓은 인형 탈이 있는거야\n몰래 뺨에 뽀뽀하고 왔어\n다음 에피소드 편집하는데 걔가 나를 똑바로 보고 윙크하더라\n땡땡이 물방울 원피스를 입은 캐시 웡\n너희도 알 거야',
    timestamp: '2026-02-15T21:39:12.000Z',
  },
  {
    id: 'seed-3',
    nickname: 'user11234328',
    text: '일곱 살이었을 때 친한 놀이터 친구가 있었지\n다른 데에서는 본 적 없는데 놀이터에 가면 있는 친구\n\n우리는 빨간색 미끄럼틀 안에서 같이 손을 잡고\n빙글빙글 돌면서 내려오는 걸 좋아했지\n그러다가 우리 집이 이사를 갔어\n난 다른 마을에서 이십 년을 내리 살았고\n\n저번주 목요일 어릴 때 살던 마을을 지날 일이 있었는데\n아직도 그 미끄럼틀이 있는 거야\n빨간 미끄럼틀 안에 들어가서 눈을 감고 빙글빙글 몸을 굴렸어\n다 내려오는 순간 누가 분명 내 손을 잡았어\n눈을 떴을 때는 아무도',
    timestamp: '2026-04-20T18:55:06.000Z',
  },
  {
    id: 'seed-4',
    nickname: 'user899979566',
    text: '이 스레드 아직 살아 있어?\n너희가 무슨 말하는 진 잘 모르겠지만 내 말도 들어 줘\n어제는 싱크로나이즈드 폴링 인 어비스가 있는 날이었어\n그러니까 말하자면 도시 폐허 탐험 같은 거야\n나는 아내와 함께 라니아케아 초은하단으로 출발했지\n우리는 특히 백색왜성 가까이서 아인슈타인 고리를 감상하며 느린 왈츠를 추는 걸 좋아하거든\n그런데 슬립워프 중 밀리세컨드 펄서 내비게이션에 문제가 생겼더군\n사소한 신호교란일 뿐이었는데 치명적인 운송실패로 이어졌지\n태양계에 도착한 나는 옆자리에 있던 아내가 사라진 걸 발견했어\n서둘러 오라클을 검색해 보니 아내는 시공간상 1990년대 지구에서 태어난 인간의 신체에 불시착했다고 해\n그 스킨플랫폼에 살면서 34.3289%의 확률로 이 네트워크 패킷을 검토하게 된대\n극심한 우주멀미로 멀티레이어 기억상실증을 앓고 있을 가능성도 높겠다\n\n게시물을 확인하면 자기야 보고싶어\n나는 추운 밀키웨이에서 자기를 기다리고 있을 거야\n자기가 몸을 벗을 때까지\n두려워하지 말고 있어\n자장 자장',
    timestamp: '2092-12-20T23:07:48.000Z',
  },
]

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  const yy = d.getFullYear().toString().slice(-2)
  const mm = pad(d.getMonth() + 1)
  const dd = pad(d.getDate())
  const hh = pad(d.getHours())
  const mi = pad(d.getMinutes())
  const ss = pad(d.getSeconds())
  return `${hh}:${mi}:${ss} ${dd}/${mm}/${yy}`
}

/* ─── Theme colors ─── */
interface Theme {
  fg: string; bg: string; border: string; borderSub: string;
  borderFaint: string; muted: string; mutedDark: string;
  cardBg: string; cardHover: string; inputBg: string;
  textBody: string; textItalic: string;
  btnBg: string; btnFg: string; btnDisabledBg: string; btnDisabledFg: string;
}

const LIGHT_THEME: Theme = {
  fg: '#000', bg: '#fff', border: '#000', borderSub: '#ddd',
  borderFaint: '#eee', muted: '#bbb', mutedDark: '#999',
  cardBg: '#fff', cardHover: '#f5f5f5', inputBg: '#fafafa',
  textBody: '#333', textItalic: '#666',
  btnBg: '#000', btnFg: '#fff', btnDisabledBg: '#eee', btnDisabledFg: '#999',
}

const DARK_THEME: Theme = {
  fg: '#fff', bg: 'transparent', border: '#fff', borderSub: '#444',
  borderFaint: '#333', muted: '#888', mutedDark: '#aaa',
  cardBg: 'rgba(255,255,255,0.05)', cardHover: 'rgba(255,255,255,0.1)', inputBg: 'rgba(255,255,255,0.03)',
  textBody: '#ccc', textItalic: '#aaa',
  btnBg: '#fff', btnFg: '#000', btnDisabledBg: '#333', btnDisabledFg: '#666',
}

/* ─── Guestbook sub-component ─── */
const GuestbookView: React.FC<{ t: Theme; onSubmitSuccess?: () => void }> = ({ t, onSubmitSuccess }) => {
  const [entries, setEntries] = useState<GuestEntry[]>(SEED_ENTRIES)
  const [nickname, setNickname] = useState('')
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    getVisitorNickname().then(setNickname)
    fetch('/api/guestbook')
      .then((r) => r.json())
      .then((data) => {
        if (data.entries && data.entries.length > 0) {
          setEntries([...data.entries, ...SEED_ENTRIES])
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  const handleSubmit = async () => {
    if (!input.trim() || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/guestbook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname, text: input.trim() }),
      })
      if (res.ok) {
        const { entry } = await res.json()
        setEntries((prev) => [entry, ...prev])
        setInput('')
      }
    } catch {
      // silently fail — still trigger dolly-out
    }
    setSubmitting(false)
    onSubmitSuccess?.()
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 30px' }}>
      {/* Write area */}
      <div style={{ borderBottom: `1px solid ${t.borderFaint}`, paddingBottom: 20, marginBottom: 24 }}>
        <div style={{
          fontSize: 11, color: t.mutedDark, marginBottom: 12,
          fontFamily: "'Courier New', monospace", letterSpacing: 1,
        }}>
          {nickname || '...'}
        </div>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder=""
          maxLength={500}
          style={{
            width: '100%', minHeight: 80, padding: 12,
            border: `1px solid ${t.borderSub}`, resize: 'vertical',
            fontFamily: "'Nanum Myeongjo', serif",
            fontSize: 13, color: t.fg, lineHeight: 1.9,
            outline: 'none', background: t.inputBg,
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: t.muted }}>{input.length}/500</span>
          <button
            onClick={handleSubmit}
            disabled={submitting || !input.trim()}
            style={{
              padding: '6px 20px',
              border: `1px solid ${t.border}`,
              background: submitting ? t.btnDisabledBg : t.btnBg,
              color: submitting ? t.btnDisabledFg : t.btnFg,
              fontSize: 11, fontFamily: "'Nanum Myeongjo', serif",
              cursor: submitting ? 'wait' : 'pointer',
              letterSpacing: 1,
            }}
          >
            남기기
          </button>
        </div>
      </div>

      {/* Entries */}
      {entries.map((entry) => (
        <div key={entry.id} style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: t.mutedDark, fontFamily: "'Courier New', monospace", letterSpacing: 1 }}>
              {entry.nickname}
            </span>
            <span style={{ fontSize: 10, color: t.muted, fontFamily: "'Courier New', monospace" }}>
              {formatTimestamp(entry.timestamp)}
            </span>
          </div>
          <div style={{
            fontFamily: "'Nanum Myeongjo', serif",
            fontSize: 13, color: t.textBody, lineHeight: 1.9,
            whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}>
            {entry.text}
          </div>
        </div>
      ))}

      {!loaded && (
        <div style={{ fontSize: 11, color: t.muted, textAlign: 'center', padding: 20 }}>...</div>
      )}
      </div>
    </div>
  )
}

/* ─── Draggable browser popup ─── */
const BrowserPopup: React.FC<{
  post: typeof BLOG_POSTS[0]
  initialX: number
  initialY: number
  zIndex: number
  onClose: () => void
}> = ({ post, initialX, initialY, zIndex, onClose }) => {
  const [pos, setPos] = useState({ x: initialX, y: initialY })
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })

  useEffect(() => {
    if (!dragging) return
    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y })
    }
    const onUp = () => setDragging(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [dragging])

  const handleMouseDown = (e: React.MouseEvent) => {
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
    setDragging(true)
  }

  return (
    <div style={{
      position: 'fixed',
      left: pos.x, top: pos.y,
      zIndex,
      width: '100%', maxWidth: 420,
      borderRadius: 8, overflow: 'hidden',
      boxShadow: '0 16px 48px rgba(0,0,0,0.45)',
      background: '#fff',
      animation: 'popIn 0.3s ease-out',
    }}>
      {/* Title bar — draggable */}
      <div
        onMouseDown={handleMouseDown}
        style={{
          background: '#e8e8e8', padding: '10px 14px 8px',
          display: 'flex', flexDirection: 'column', gap: 8,
          borderBottom: '1px solid #ccc',
          cursor: dragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div onClick={onClose}
            style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57', cursor: 'pointer' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }} />
        </div>
        <div style={{
          background: '#fff', borderRadius: 4, padding: '5px 10px',
          fontSize: 11, color: '#999', fontFamily: "'SF Mono', 'Menlo', monospace",
          border: '1px solid #ccc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {post.href}
        </div>
      </div>
      {/* Content */}
      <a href={post.href} target="_blank" rel="noopener"
        style={{ display: 'block', padding: '20px 24px', textDecoration: 'none', background: '#fff' }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#000', marginBottom: 6, fontFamily: "'Nanum Myeongjo', serif" }}>
          {post.title}
        </div>
        <div style={{ fontSize: 11, color: '#bbb', marginBottom: 10 }}>
          {post.date} · {post.category}
        </div>
        <div style={{ fontSize: 13, color: '#555', lineHeight: 1.9, fontFamily: "'Nanum Myeongjo', serif" }}>
          {post.preview}
        </div>
      </a>
    </div>
  )
}

/* ─── Main component ─── */
type Props = {
  /** Overlay mode: transparent bg + inverted colors (white on black ink bleed) */
  overlayMode?: boolean;
};

export const Ch5Screen: React.FC<Props> = ({ overlayMode = false }) => {
  const { play, loop } = useSoundManager()
  const [fragments, setFragments] = useState<TextFragment[]>([])
  const [count, setCount] = useState(0)
  const nextId = useRef(0)
  const [showMessage, setShowMessage] = useState(false)
  const [showBlog1, setShowBlog1] = useState(false)
  const [showBlog2, setShowBlog2] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [ending, setEnding] = useState(false)
  const [endingOpacity, setEndingOpacity] = useState(0)
  const [activeTab, setActiveTab] = useState<'blog' | 'guest'>('blog')
  const [popup1Closed, setPopup1Closed] = useState(false)
  const [popup2Closed, setPopup2Closed] = useState(false)
  const [mountOpacity, setMountOpacity] = useState(overlayMode ? 0 : 1)
  const [booting, setBooting] = useState(!overlayMode)
  const [bootOpacity, setBootOpacity] = useState(!overlayMode ? 1 : 0)
  // Dolly-out: 0 = play view (fullscreen blog), 1 = full computer centered on white bg
  const [dollyT, setDollyT] = useState(0)
  const [blogSnapshot, setBlogSnapshot] = useState<string | null>(null)
  const dollyStartRef = useRef<number | null>(null)
  const textareaRef = useRef<HTMLDivElement>(null)
  const blogWrapRef = useRef<HTMLDivElement>(null)

  // Theme
  const t = overlayMode ? DARK_THEME : LIGHT_THEME

  useEffect(() => {
    if (!overlayMode) {
      play('boot_sound')
      loop('pc_fan', true)
      // Boot sequence — black screen fades to blog UI
      const t1 = setTimeout(() => setBootOpacity(0), 800)
      const t2 = setTimeout(() => {
        setBooting(false)
        textareaRef.current?.focus()
      }, 1600)
      return () => {
        loop('pc_fan', false)
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
    // Overlay mode — fade-in, delayed focus + PC ambience loop
    loop('pc_fan', true)
    setTimeout(() => textareaRef.current?.focus(), 2000)
    requestAnimationFrame(() => setMountOpacity(1))
    return () => {
      loop('pc_fan', false)
    }
  }, [play, loop, overlayMode])

  useEffect(() => {
    if (count >= 5 && !showMessage) {
      setShowMessage(true)
      setTimeout(() => setShowBlog1(true), 2000)
      setTimeout(() => setShowBlog2(true), 3000)
      setTimeout(() => setShowLink(true), 4000)
    }
  }, [count, showMessage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (ending) return
      setCount((prev) => {
        const newCount = prev + 1
        const id = nextId.current++
        const frag = makeFragment(id, newCount)
        // Stage 2: also add noise blocks
        const extras: TextFragment[] = []
        if (newCount > 3) {
          const noiseCount = Math.min(newCount - 3, 3)
          for (let i = 0; i < noiseCount; i++) {
            extras.push(makeNoiseBlock(nextId.current++))
          }
        }
        setFragments((prev) => [...prev, frag, ...extras])
        return newCount
      })
    },
    [ending],
  )

  const handleEndClick = () => {
    setEnding(true)
    setTimeout(() => setEndingOpacity(1), 100)
  }

  // Monitor aspect used when fitting the captured blog into the CRT screen UV
  const SCREEN_ASPECT = 1.345

  // Trigger dolly-out on guestbook comment submit success (Scene 5-4)
  // Approach: capture blog at its natural rendered size, then fit into a
  // monitor-aspect offscreen canvas (width-fit, top-crop) so the texture
  // matches the CRT's UV without distortion.
  const triggerDolly = useCallback(async () => {
    if (dollyStartRef.current !== null) return
    dollyStartRef.current = -1
    if (blogWrapRef.current) {
      try {
        const html2canvas = (await import('html2canvas')).default
        // Overlay mode runs DARK_THEME (white text on transparent) — capture
        // against black so text stays visible. Dev mode uses the light blog.
        const captureBg = overlayMode ? '#000000' : '#ffffff'
        const raw = await html2canvas(blogWrapRef.current, {
          backgroundColor: captureBg,
          scale: 1.5,
          logging: false,
          useCORS: true,
        })
        const dstW = Math.max(960, raw.width)
        const dstH = Math.round(dstW / SCREEN_ASPECT)
        const target = document.createElement('canvas')
        target.width = dstW
        target.height = dstH
        const ctx = target.getContext('2d')!
        ctx.fillStyle = captureBg
        ctx.fillRect(0, 0, dstW, dstH)
        // Width-fit: draw the blog at full width, aligned to the top. If the
        // blog is taller than the screen frame, the bottom simply crops off.
        const drawW = dstW
        const drawH = (raw.height / raw.width) * dstW
        ctx.drawImage(raw, 0, 0, raw.width, raw.height, 0, 0, drawW, drawH)
        setBlogSnapshot(target.toDataURL('image/png'))
      } catch (e) {
        console.warn('[Ch5] blog snapshot failed, falling back to live DOM', e)
      }
    }
    const DURATION = 8000 // slow dolly-out — let it breathe
    const start = performance.now()
    dollyStartRef.current = start
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION)
      // Linear t — easing comes from inverse-distance pcH formula (real dolly physics)
      setDollyT(t)
      if (t < 1) requestAnimationFrame(tick)
      else setTimeout(() => {
        setEnding(true)
        loop('pc_fan', false)
        play('screen_off')
        setTimeout(() => setEndingOpacity(1), 100)
      }, 1000)
    }
    requestAnimationFrame(tick)
  }, [overlayMode])

  // --- Credits (Scene 5-4 end) ---
  if (ending) {
    const creditSection = (heading: string, rows: Array<[string, string]>) => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          fontSize: '0.72rem', letterSpacing: 4, color: '#8fa39c',
          textTransform: 'uppercase', marginBottom: 4,
        }}>{heading}</div>
        {rows.map(([role, name]) => (
          <div key={`${heading}-${role}`} style={{ display: 'flex', gap: 14, fontSize: '0.95rem' }}>
            <span style={{ width: 120, color: '#7d8f89', textAlign: 'right', flexShrink: 0 }}>{role}</span>
            <span style={{ color: '#dfe8e4' }}>{name}</span>
          </div>
        ))}
      </div>
    )

    return (
      <div style={{
        position: 'fixed', inset: 0, backgroundColor: '#0a0f14',
        zIndex: overlayMode ? 20 : 100, opacity: endingOpacity, transition: 'opacity 2s ease',
        overflow: 'hidden',
      }}>
        <RetroPCScene t={1} snapshot={blogSnapshot} />
        <div style={{
          position: 'absolute', right: '4vw', top: '50%', transform: 'translateY(-50%)',
          width: 'min(32vw, 480px)', maxHeight: '80vh', overflow: 'auto',
          display: 'flex', flexDirection: 'column', gap: 28,
          fontFamily: "'Nanum Myeongjo', serif", color: '#dfe8e4',
          zIndex: 3,
        }}>
          <div>
            <h1 style={{
              fontSize: '2.4rem', margin: 0, letterSpacing: 4, fontWeight: 800,
              color: '#f0f6f2',
            }}>Map Hack</h1>
            <p style={{ fontSize: '0.85rem', color: '#8fa39c', margin: '6px 0 0', letterSpacing: 2 }}>
              2026 · 송해민
            </p>
          </div>

          {creditSection('Direction', [
            ['Concept', '송해민'],
            ['Writing', '송해민'],
            ['Creative Technology', '송해민'],
          ])}

          {creditSection('Art & Code', [
            ['Level Design', '송해민'],
            ['3D Modeling', '송해민 · PSX Asset Pack'],
            ['Shaders', '송해민'],
            ['UI / Blog Clone', '송해민'],
          ])}

          {creditSection('Sound', [
            ['Design', '송해민'],
            ['Additional FX', 'freesound.org'],
          ])}

          {creditSection('Special Thanks', [
            ['', '허현정'],
            ['', '남선미'],
            ['', '0ohihano0 독자들'],
          ])}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            <div style={{
              fontSize: '0.72rem', letterSpacing: 4, color: '#8fa39c',
              textTransform: 'uppercase', marginBottom: 4,
            }}>Further Reading</div>
            <a href={BLOG_POSTS[0].href} target="_blank" rel="noopener"
              style={{ color: '#b8d4e8', fontSize: '0.9rem', textDecoration: 'underline' }}>
              {BLOG_POSTS[0].title}
            </a>
            <a href={BLOG_POSTS[1].href} target="_blank" rel="noopener"
              style={{ color: '#b8d4e8', fontSize: '0.9rem', textDecoration: 'underline' }}>
              {BLOG_POSTS[1].title}
            </a>
          </div>

          <p style={{
            fontSize: '0.72rem', color: '#556964', margin: '16px 0 0',
            fontStyle: 'italic', letterSpacing: 1,
          }}>
            Built with Vite · React · Three.js · Rapier · Zustand
          </p>
        </div>
      </div>
    )
  }

  // --- "앙팡 테리블" Blog clone ---
  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: t.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      zIndex: overlayMode ? 20 : 100,
      fontFamily: "'Nanum Myeongjo', 'Batang', serif",
      fontSize: 14, color: t.fg,
      overflow: 'hidden',
      opacity: mountOpacity,
      transition: overlayMode ? 'opacity 2s ease' : 'none',
    }}>
      {/* 3D retro PC scene — camera dollies from inside the monitor screen
          (t=0) to product-shot distance (t=1). */}
      {blogSnapshot && (
        <RetroPCScene t={dollyT} snapshot={blogSnapshot} />
      )}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap');
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        @keyframes popIn {
          0% { opacity: 0; transform: scale(0.92); }
          100% { opacity: 1; transform: scale(1); }
        }
      `}</style>

      {/* === Main content wrapper with 5px border === */}
      <div ref={blogWrapRef} style={{
        width: '100%', maxWidth: 960,
        height: '100vh',
        border: `5px solid ${t.border}`,
        backgroundColor: t.bg,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative', zIndex: 2,
        // Live blog hides instantly when snapshot ready (snapshot fills viewport)
        opacity: blogSnapshot ? 0 : 1,
        pointerEvents: blogSnapshot ? 'none' : undefined,
      }}>

        {/* === Blog title / header area === */}
        <div style={{
          padding: '40px 30px 20px',
          borderBottom: `1px solid ${t.border}`,
        }}>
          <h1 style={{
            fontFamily: "'Nanum Myeongjo', serif",
            fontSize: 28, fontWeight: 800, color: t.fg,
            letterSpacing: 2, margin: 0,
          }}>
            앙팡 테리블
          </h1>
          <p style={{
            fontFamily: "'Nanum Myeongjo', serif",
            fontSize: 12, color: '#888', marginTop: 6,
            letterSpacing: 1,
          }}>
            Enfant Terrible
          </p>
        </div>

        {/* === Navigation tabs === */}
        <div style={{
          display: 'flex', gap: 0,
          borderBottom: `1px solid ${t.border}`,
        }}>
          {(['blog', 'guest'] as const).map((tab) => (
            <div
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 24px',
                fontSize: 13,
                fontFamily: "'Nanum Myeongjo', serif",
                color: activeTab === tab ? t.fg : t.mutedDark,
                fontWeight: activeTab === tab ? 700 : 400,
                borderRight: `1px solid ${t.borderSub}`,
                cursor: 'pointer',
                letterSpacing: 1,
                borderBottom: activeTab === tab ? `2px solid ${t.fg}` : '2px solid transparent',
                marginBottom: -1,
              }}
            >
              {tab}
            </div>
          ))}
        </div>

        {/* === Blog body: sidebar + content === */}
        <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

          {/* Sidebar — category + stats */}
          <div style={{
            width: 180, flexShrink: 0,
            borderRight: `1px solid ${t.borderSub}`,
            padding: '20px 0',
          }}>
            <div style={{
              padding: '8px 16px', fontSize: 12, fontWeight: 700,
              color: t.fg, borderBottom: `1px solid ${t.borderFaint}`, marginBottom: 8,
              letterSpacing: 1,
            }}>
              카테고리
            </div>
            <div style={{
              padding: '6px 16px', fontSize: 12, color: t.fg,
              fontWeight: 700, cursor: 'default',
            }}>
              일기 <span style={{ color: t.mutedDark, fontWeight: 400 }}>(260)</span>
            </div>

            <div style={{
              marginTop: 30, padding: '0 16px',
              fontSize: 11, color: t.muted, lineHeight: 2,
            }}>
              <div>Today <span style={{ color: t.fg }}>5</span></div>
              <div>Total <span style={{ color: t.fg }}>60,313</span></div>
              <div>이웃 <span style={{ color: t.fg }}>303</span></div>
            </div>

            <div style={{
              marginTop: 30, padding: '0 16px',
              fontSize: 11, color: t.muted, lineHeight: 1.8,
            }}>
              <div>희한</div>
              <div style={{ fontSize: 10 }}>0ohihano0</div>
            </div>
          </div>

          {/* Main content area — switches by tab */}
          {activeTab === 'blog' ? (
            <div style={{ flex: 1, padding: '24px 30px', overflowY: 'auto', minHeight: 0 }}>

              {/* Post header — writing area */}
              <div style={{
                borderBottom: `1px solid ${t.borderFaint}`, paddingBottom: 16, marginBottom: 24,
              }}>
                <h2 style={{
                  fontFamily: "'Nanum Myeongjo', serif",
                  fontSize: 22, fontWeight: 700, color: t.fg, marginBottom: 6, margin: 0,
                }}>
                  새 글 쓰기
                </h2>
                <div style={{ fontSize: 11, color: t.muted, marginTop: 8 }}>
                  {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                  {' · '}
                  <span style={{ color: t.mutedDark }}>일기</span>
                </div>
              </div>

              {/* Typing area — chaos text renderer */}
              <div
                ref={textareaRef}
                tabIndex={0}
                onKeyDown={handleKeyDown}
                style={{
                  height: 300, maxHeight: 300, padding: 0,
                  border: `1px solid ${t.borderSub}`,
                  outline: 'none', cursor: 'text',
                  background: t.inputBg,
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Grain overlay — intensifies with count */}
                {count > 3 && (
                  <div style={{
                    position: 'absolute', inset: 0,
                    opacity: Math.min((count - 3) * 0.06, 0.3),
                    background: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
                    backgroundSize: '128px 128px',
                    pointerEvents: 'none',
                    zIndex: 2,
                    mixBlendMode: 'multiply',
                  }} />
                )}

                {/* Fragments */}
                {fragments.map((f) => (
                  <span
                    key={f.id}
                    style={{
                      position: 'absolute',
                      left: `${f.x}%`,
                      top: `${f.y}%`,
                      fontSize: f.fontSize,
                      fontFamily: f.font,
                      color: overlayMode ? '#fff' : f.color,
                      opacity: f.opacity,
                      transform: `rotate(${f.rotate}deg)`,
                      mixBlendMode: f.blend as any,
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      userSelect: 'none',
                      lineHeight: 1,
                      zIndex: 1,
                    }}
                  >
                    {f.text}
                  </span>
                ))}

                {/* Cursor blink when empty */}
                {fragments.length === 0 && (
                  <span style={{
                    position: 'absolute', left: 16, top: 16,
                    opacity: 0.3, animation: 'blink 1s step-end infinite',
                    fontSize: 15, fontFamily: "'Nanum Myeongjo', serif",
                    color: t.fg,
                  }}>|</span>
                )}
              </div>

              {showMessage && (
                <p style={{
                  marginTop: 24,
                  fontFamily: "'Nanum Myeongjo', serif",
                  fontSize: 15, color: t.textItalic, fontStyle: 'italic', lineHeight: 2,
                  textAlign: 'center',
                }}>
                  I still have ten thousand words left to say...
                </p>
              )}

            </div>
          ) : (
            <GuestbookView t={t} onSubmitSuccess={triggerDolly} />
          )}
        </div>

        {/* === Footer === */}
        <div style={{
          borderTop: `1px solid ${t.border}`, padding: '12px 30px',
          fontSize: 10, color: t.muted, display: 'flex', justifyContent: 'space-between',
          fontFamily: "'Nanum Myeongjo', serif",
        }}>
          <span>앙팡 테리블 · 희한</span>
          <span>NAVER 블로그</span>
        </div>
      </div>

      {/* Browser window popups — draggable, staggered positions */}
      {showBlog1 && !popup1Closed && (
        <BrowserPopup
          post={BLOG_POSTS[0]}
          initialX={Math.round(window.innerWidth / 2 - 260)}
          initialY={Math.round(window.innerHeight * 0.12)}
          zIndex={151}
          onClose={() => setPopup1Closed(true)}
        />
      )}
      {showBlog2 && !popup2Closed && (
        <BrowserPopup
          post={BLOG_POSTS[1]}
          initialX={Math.round(window.innerWidth / 2 - 160)}
          initialY={Math.round(window.innerHeight * 0.28)}
          zIndex={152}
          onClose={() => setPopup2Closed(true)}
        />
      )}

      {/* Boot overlay — screen turns on (normal mode only) */}
      {booting && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: '#0a0a0a',
          zIndex: 200, opacity: bootOpacity,
          transition: 'opacity 0.8s ease',
          pointerEvents: 'none',
        }} />
      )}
    </div>
  )
}
