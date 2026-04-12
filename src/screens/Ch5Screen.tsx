/**
 * CH.5 — 블로그 UI ("앙팡 테리블" 네이버 블로그 클론)
 * Monochromatic black/white, Nanum Myeongjo, 5px black border
 * mahn_mal 타이핑 → 메시지 → 블로그 포스트 링크 2개 → 엔딩 크레딧
 */
import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useSoundManager } from '@/hooks/useSoundManager'

const TARGET = 'mahn_mal'

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

type Props = {
  /** Overlay mode: transparent bg + inverted colors (white on black ink bleed) */
  overlayMode?: boolean;
};

export const Ch5Screen: React.FC<Props> = ({ overlayMode = false }) => {
  const { play, loop } = useSoundManager()
  const [text, setText] = useState('')
  const [count, setCount] = useState(0)
  const [showMessage, setShowMessage] = useState(false)
  const [showBlog1, setShowBlog1] = useState(false)
  const [showBlog2, setShowBlog2] = useState(false)
  const [showLink, setShowLink] = useState(false)
  const [ending, setEnding] = useState(false)
  const [endingOpacity, setEndingOpacity] = useState(0)
  const [mountOpacity, setMountOpacity] = useState(overlayMode ? 0 : 1)
  const textareaRef = useRef<HTMLDivElement>(null)

  // Theme colors — inverted for overlay mode
  const fg = overlayMode ? '#fff' : '#000';
  const bg = overlayMode ? 'transparent' : '#fff';
  const border = overlayMode ? '#fff' : '#000';
  const borderSub = overlayMode ? '#444' : '#ddd';
  const borderFaint = overlayMode ? '#333' : '#eee';
  const muted = overlayMode ? '#888' : '#bbb';
  const mutedDark = overlayMode ? '#aaa' : '#999';
  const cardBg = overlayMode ? 'rgba(255,255,255,0.05)' : '#fff';
  const cardHover = overlayMode ? 'rgba(255,255,255,0.1)' : '#f5f5f5';
  const inputBg = overlayMode ? 'rgba(255,255,255,0.03)' : '#fafafa';

  useEffect(() => {
    if (!overlayMode) {
      play('boot_sound')
      loop('pc_fan', true)
    }
    // Auto focus typing area
    setTimeout(() => textareaRef.current?.focus(), overlayMode ? 2000 : 500)
    // Fade-in for overlay mode
    if (overlayMode) {
      requestAnimationFrame(() => setMountOpacity(1));
    }
    return () => { if (!overlayMode) loop('pc_fan', false) }
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
      setText((prev) => {
        const next = prev + TARGET
        const newCount = (next.match(/mahn_mal/g) || []).length
        setCount(newCount)
        return next
      })
    },
    [ending],
  )

  const handleEndClick = () => {
    setEnding(true)
    setTimeout(() => setEndingOpacity(1), 100)
  }

  // --- Ending credits ---
  if (ending) {
    return (
      <div style={{
        position: 'fixed', inset: 0, backgroundColor: '#000',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        zIndex: overlayMode ? 20 : 100, opacity: endingOpacity, transition: 'opacity 2s ease', gap: 12,
      }}>
        <h1 style={{ fontFamily: "'Nanum Myeongjo', serif", color: '#fff', fontSize: '2rem', marginBottom: '0.5rem' }}>
          Map Hack
        </h1>
        <p style={{ fontFamily: "'Nanum Myeongjo', serif", color: '#aaa', fontSize: '1rem', marginBottom: '1.5rem' }}>
          by 송해민
        </p>
        <a href={BLOG_POSTS[0].href} target="_blank" rel="noopener"
          style={{ fontFamily: "'Nanum Myeongjo', serif", color: '#999', fontSize: '0.9rem', textDecoration: 'underline' }}>
          {BLOG_POSTS[0].title}
        </a>
        <a href={BLOG_POSTS[1].href} target="_blank" rel="noopener"
          style={{ fontFamily: "'Nanum Myeongjo', serif", color: '#999', fontSize: '0.9rem', textDecoration: 'underline' }}>
          {BLOG_POSTS[1].title}
        </a>
      </div>
    )
  }

  // --- "앙팡 테리블" Blog clone ---
  return (
    <div style={{
      position: 'fixed', inset: 0,
      backgroundColor: bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      zIndex: overlayMode ? 20 : 100,
      fontFamily: "'Nanum Myeongjo', 'Batang', serif",
      fontSize: 14, color: fg,
      overflowY: 'auto',
      opacity: mountOpacity,
      transition: overlayMode ? 'opacity 2s ease' : 'none',
    }}>
      {/* Google Fonts link for Nanum Myeongjo */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nanum+Myeongjo:wght@400;700;800&display=swap');
        @keyframes blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>

      {/* === Main content wrapper with 5px black border === */}
      <div style={{
        width: '100%', maxWidth: 960,
        minHeight: '100vh',
        border: `5px solid ${border}`,
        backgroundColor: bg,
        display: 'flex', flexDirection: 'column',
      }}>

        {/* === Blog title / header area === */}
        <div style={{
          padding: '40px 30px 20px',
          borderBottom: `1px solid ${border}`,
        }}>
          <h1 style={{
            fontFamily: "'Nanum Myeongjo', serif",
            fontSize: 28, fontWeight: 800, color: fg,
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
          borderBottom: `1px solid ${border}`,
        }}>
          {['blog', 'guest'].map((tab, i) => (
            <div key={tab} style={{
              padding: '10px 24px',
              fontSize: 13,
              fontFamily: "'Nanum Myeongjo', serif",
              color: i === 0 ? fg : mutedDark,
              fontWeight: i === 0 ? 700 : 400,
              borderRight: `1px solid ${borderSub}`,
              cursor: 'default',
              letterSpacing: 1,
            }}>
              {tab}
            </div>
          ))}
        </div>

        {/* === Blog body: sidebar + content === */}
        <div style={{ display: 'flex', flex: 1 }}>

          {/* Sidebar — category + stats */}
          <div style={{
            width: 180, flexShrink: 0,
            borderRight: `1px solid ${borderSub}`,
            padding: '20px 0',
          }}>
            {/* Category */}
            <div style={{
              padding: '8px 16px', fontSize: 12, fontWeight: 700,
              color: fg, borderBottom: `1px solid ${borderFaint}`, marginBottom: 8,
              letterSpacing: 1,
            }}>
              카테고리
            </div>
            <div style={{
              padding: '6px 16px', fontSize: 12, color: fg,
              fontWeight: 700, cursor: 'default',
            }}>
              일기 <span style={{ color: mutedDark, fontWeight: 400 }}>(260)</span>
            </div>

            {/* Stats */}
            <div style={{
              marginTop: 30, padding: '0 16px',
              fontSize: 11, color: muted, lineHeight: 2,
            }}>
              <div>Today <span style={{ color: fg }}>5</span></div>
              <div>Total <span style={{ color: fg }}>60,313</span></div>
              <div>이웃 <span style={{ color: fg }}>303</span></div>
            </div>

            {/* Blog info */}
            <div style={{
              marginTop: 30, padding: '0 16px',
              fontSize: 11, color: muted, lineHeight: 1.8,
            }}>
              <div>희한</div>
              <div style={{ fontSize: 10 }}>0ohihano0</div>
            </div>
          </div>

          {/* Main content area */}
          <div style={{ flex: 1, padding: '24px 30px' }}>

            {/* Post header — writing area */}
            <div style={{
              borderBottom: `1px solid ${borderFaint}`, paddingBottom: 16, marginBottom: 24,
            }}>
              <h2 style={{
                fontFamily: "'Nanum Myeongjo', serif",
                fontSize: 22, fontWeight: 700, color: fg, marginBottom: 6, margin: 0,
              }}>
                새 글 쓰기
              </h2>
              <div style={{ fontSize: 11, color: muted, marginTop: 8 }}>
                {new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
                {' · '}
                <span style={{ color: mutedDark }}>일기</span>
              </div>
            </div>

            {/* Typing area — the game mechanic */}
            <div
              ref={textareaRef}
              tabIndex={0}
              onKeyDown={handleKeyDown}
              style={{
                minHeight: 160, padding: 16,
                border: `1px solid ${borderSub}`,
                fontFamily: "'Nanum Myeongjo', serif",
                fontSize: 15, color: fg, lineHeight: 2,
                outline: 'none', cursor: 'text',
                wordBreak: 'break-all', background: inputBg,
              }}
            >
              {text || (
                <span style={{ opacity: 0.3, animation: 'blink 1s step-end infinite' }}>|</span>
              )}
            </div>

            {/* Message after enough typing */}
            {showMessage && (
              <p style={{
                marginTop: 24,
                fontFamily: "'Nanum Myeongjo', serif",
                fontSize: 15, color: overlayMode ? '#aaa' : '#666', fontStyle: 'italic', lineHeight: 2,
              }}>
                I still have ten thousand words left to say...
              </p>
            )}

            {/* Blog post links — styled as minimal black/white cards */}
            {showBlog1 && (
              <a href={BLOG_POSTS[0].href} target="_blank" rel="noopener" style={{
                display: 'block', marginTop: 24, padding: '16px 20px',
                border: `1px solid ${border}`, textDecoration: 'none', background: cardBg,
                transition: 'background 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = cardHover }}
                onMouseLeave={e => { e.currentTarget.style.background = cardBg }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, color: fg, marginBottom: 4, fontFamily: "'Nanum Myeongjo', serif" }}>
                  {BLOG_POSTS[0].title}
                </div>
                <div style={{ fontSize: 11, color: muted }}>{BLOG_POSTS[0].date} · {BLOG_POSTS[0].category}</div>
                <div style={{ fontSize: 13, color: overlayMode ? '#bbb' : '#555', marginTop: 8, lineHeight: 1.8, fontFamily: "'Nanum Myeongjo', serif" }}>
                  {BLOG_POSTS[0].preview}
                </div>
              </a>
            )}

            {showBlog2 && (
              <a href={BLOG_POSTS[1].href} target="_blank" rel="noopener" style={{
                display: 'block', marginTop: 12, padding: '16px 20px',
                border: `1px solid ${border}`, textDecoration: 'none', background: cardBg,
                transition: 'background 0.2s',
              }}
                onMouseEnter={e => { e.currentTarget.style.background = cardHover }}
                onMouseLeave={e => { e.currentTarget.style.background = cardBg }}
              >
                <div style={{ fontSize: 15, fontWeight: 700, color: fg, marginBottom: 4, fontFamily: "'Nanum Myeongjo', serif" }}>
                  {BLOG_POSTS[1].title}
                </div>
                <div style={{ fontSize: 11, color: muted }}>{BLOG_POSTS[1].date} · {BLOG_POSTS[1].category}</div>
                <div style={{ fontSize: 13, color: overlayMode ? '#bbb' : '#555', marginTop: 8, lineHeight: 1.8, fontFamily: "'Nanum Myeongjo', serif" }}>
                  {BLOG_POSTS[1].preview}
                </div>
              </a>
            )}

            {/* 작가노트 transition */}
            {showLink && (
              <p onClick={handleEndClick} style={{
                marginTop: 30, fontSize: 13, color: fg,
                cursor: 'pointer', textDecoration: 'underline',
                fontWeight: 700, fontFamily: "'Nanum Myeongjo', serif",
              }}>
                → 작가노트
              </p>
            )}
          </div>
        </div>

        {/* === Footer === */}
        <div style={{
          borderTop: `1px solid ${border}`, padding: '12px 30px',
          fontSize: 10, color: muted, display: 'flex', justifyContent: 'space-between',
          fontFamily: "'Nanum Myeongjo', serif",
        }}>
          <span>앙팡 테리블 · 희한</span>
          <span>NAVER 블로그</span>
        </div>
      </div>
    </div>
  )
}
