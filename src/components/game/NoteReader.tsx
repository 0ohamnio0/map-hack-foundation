/**
 * CH.2 떨어진 쪽지 — 본문 모달 (텍스트 + 인라인 이미지).
 * - 종이는 A4 비율(1654 / 2339) 고정 박스, 텍스트 양 무관하게 동일 사이즈
 * - 한/영 토글 (Q 키 또는 상단 버튼) · 세션 전역 유지
 * - preserveSpacing 적용 segment는 monospace 그대로 보존 (ASCII / 코드)
 * - E/Esc 닫기 · ←→ 또는 A/D 페이지 이동 (페이지 변경 시 paper_flip)
 */
import { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { useDevMode } from '@/hooks/useDevMode'
import { useSoundManager } from '@/hooks/useSoundManager'
import { useScrambleTransition } from '@/hooks/useGlitchText'
import { CH2_NOTES, type PageSegment } from '@/data/ch2Notes'

const BASE = import.meta.env.BASE_URL

// 노트별 종이 텍스처 매핑 (Note.tsx와 일치)
const NOTE_PAPER: Record<string, string> = {
  theta:       `${BASE}assets/tex/paper/paper-01.webp`,
  entropy:     `${BASE}assets/tex/paper/paper-02.webp`,
  'jeju-fire': `${BASE}assets/tex/paper/paper-03.webp`,
  bichae:      `${BASE}assets/tex/paper/paper-04.webp`,
  'hell-salad':`${BASE}assets/tex/paper/paper-05.webp`,
  termination: `${BASE}assets/tex/paper/paper-06.webp`,
  highstreamer:`${BASE}assets/tex/paper/paper-07.webp`,
}

function NoteText({ ko, en }: { ko: string; en?: string }) {
  const lang = useGameStore(s => s.noteLanguage)
  const text = lang === 'en' && en ? en : ko
  return <>{useScrambleTransition(text)}</>
}

function TextSegment({ ko, en, preserveSpacing, size, align }: {
  ko: string
  en?: string
  preserveSpacing?: boolean
  size?: 'normal' | 'small'
  align?: 'left' | 'center'
}) {
  return (
    <div style={{
      fontFamily: '"Unifont", monospace',
      fontSize: size === 'small' ? 11 : 15,
      lineHeight: size === 'small' ? 1.5 : 1.7,
      letterSpacing: 0.5,
      whiteSpace: preserveSpacing ? 'pre' : 'pre-wrap',
      wordBreak: 'keep-all',
      color: '#1a1a1a',
      overflow: 'hidden',
      opacity: size === 'small' ? 0.65 : 1,
      width: '100%',
      textAlign: align ?? 'left',
    }}>
      <NoteText ko={ko} en={en} />
    </div>
  )
}

function SegmentRenderer({ segment }: { segment: PageSegment }) {
  if (segment.type === 'text') {
    return (
      <TextSegment
        ko={segment.ko}
        en={segment.en}
        preserveSpacing={segment.preserveSpacing}
        size={segment.size}
        align={segment.align}
      />
    )
  }
  if (segment.type === 'image') {
    const pct = segment.widthPct ?? 100
    const scaledPct = pct * 0.85
    return (
      <img
        src={`${BASE}${segment.src}`}
        alt=""
        draggable={false}
        style={{
          display: 'block',
          width: `${scaledPct}%`,
          height: 'auto',
          maxHeight: 420,
          objectFit: 'contain',
          margin: '4px auto',
        }}
      />
    )
  }
  // rule
  return (
    <hr style={{
      border: 'none',
      borderTop: '1px solid rgba(0,0,0,0.45)',
      width: '40%',
      margin: '14px 0 10px',
    }} />
  )
}

const PAPER_HEIGHT = 'min(80vh, 980px, calc(92vw * 2339 / 1654))'
const PAPER_ASPECT = '1654 / 2339'

// 텍스트는 항상 DESIGN_W 디자인폭으로 레이아웃 → zoom = 종이폭 / DESIGN_W 로
// 박스를 종이에 정확히 1:1 매핑 (박스=종이폭이라 우측 잘림·제목 오프셋 없음).
// 폭을 줄일수록(↓) 같은 종이에서 텍스트가 커짐 — 592 = 888/1.5 (적정값 확정).
const DESIGN_W = 592
// A4 페이지 높이에서 6px 뺌 — zoom 서브픽셀 반올림이 스크롤 컨테이너를
// <1px 초과시켜 생기는 '유령 스크롤' 흡수 (내용이 실제로 넘치면 정상 스크롤).
const DESIGN_PAGE_H = 'calc(592px * 2339 / 1654 - 6px)'

export function NoteReader() {
  const activeNoteId = useGameStore(s => s.activeNoteId)
  const closeNote = useGameStore(s => s.closeNote)
  const noteLanguage = useGameStore(s => s.noteLanguage)
  const setNoteLanguage = useGameStore(s => s.setNoteLanguage)
  const toggleNoteLanguage = useGameStore(s => s.toggleNoteLanguage)
  const { play } = useSoundManager()
  const [page, setPage] = useState(0)

  const note = activeNoteId === null ? null : CH2_NOTES.find(n => n.id === activeNoteId) ?? null
  const totalPages = note ? note.pages.length : 0

  // 새 쪽지 열림: 페이지 초기화 + 언어 한글 리셋 + paper SFX
  // (Q 토글은 그 쪽지 보는 동안만 유지 — 다음 쪽지는 항상 한글로 시작)
  useEffect(() => {
    setPage(0)
    if (activeNoteId !== null) {
      setNoteLanguage('ko')
      play('paper_flip')
    }
  }, [activeNoteId, play, setNoteLanguage])

  useEffect(() => {
    if (note === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyE') {
        e.preventDefault()
        closeNote()
        return
      }
      if (e.code === 'KeyQ') {
        e.preventDefault()
        toggleNoteLanguage()
        return
      }
      if (totalPages > 1) {
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault()
          setPage(p => {
            const next = Math.max(0, p - 1)
            if (next !== p) play('paper_flip')
            return next
          })
        } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault()
          setPage(p => {
            const next = Math.min(totalPages - 1, p + 1)
            if (next !== p) play('paper_flip')
            return next
          })
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [note, totalPages, closeNote, play, toggleNoteLanguage])

  // 종이 실제 폭을 측정해 zoom 배율 산출 (배율만 JS, 스크롤 높이는 zoom이 처리)
  const paperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  // 개발용 튜닝 (P 토글) — 텍스트 스케일 배율 + X/Y 오프셋
  const dev = useDevMode()
  const [scaleMul, setScaleMul] = useState(1)
  const [offX, setOffX] = useState(0)
  const [offY, setOffY] = useState(0)
  useEffect(() => {
    const el = paperRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      // 캡 없음 — 박스가 항상 종이폭에 정확히 맞아야 잘림/오프셋이 안 생김.
      setScale(entry.contentRect.width / DESIGN_W)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [note])

  if (note === null) return null

  const pageData = note.pages[page]
  const multi = totalPages > 1
  const titleEn = note.titleEn

  return (
    <div
      onClick={closeNote}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'transparent',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'safe center',
        padding: '4vh 4vw',
        cursor: 'pointer',
        animation: 'noteReaderFadeIn 0.5s ease-out',
        gap: 16,
      }}
    >
      {/* 한/영 토글 (Q 키 또는 클릭) */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          fontFamily: '"Unifont", monospace',
          fontSize: 12,
          letterSpacing: 3,
          color: '#f3eedd',
          textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.7)',
          userSelect: 'none',
        }}
      >
        <span style={{ opacity: 0.55, letterSpacing: 2 }}>[Q]</span>
        <button
          onClick={() => setNoteLanguage('ko')}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            letterSpacing: 'inherit',
            color: 'inherit',
            textShadow: 'inherit',
            opacity: noteLanguage === 'ko' ? 1 : 0.4,
          }}
        >
          한국어
        </button>
        <span style={{ opacity: 0.4 }}>·</span>
        <button
          onClick={() => setNoteLanguage('en')}
          style={{
            background: 'transparent',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 'inherit',
            letterSpacing: 'inherit',
            color: 'inherit',
            textShadow: 'inherit',
            opacity: noteLanguage === 'en' ? 1 : 0.4,
          }}
        >
          ENGLISH
        </button>
      </div>

      <div ref={paperRef} style={{ position: 'relative', display: 'flex' }}>
      {/* 종이 뒤 겹친 시트 = 실제 페이지 수 - 1 (읽기 전에도 장수를 시각적으로 인지) */}
      {Array.from({ length: Math.min(totalPages - 1, 4) }, (_, i) => (totalPages - 1 - i) * 9).map(off => (
        <div key={off} aria-hidden style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: PAPER_HEIGHT,
          aspectRatio: PAPER_ASPECT,
          backgroundColor: '#f1ede1',
          boxShadow: '2px 2px 6px rgba(0,0,0,0.22)',
          transform: `translate(${off}px, ${off}px)`,
          pointerEvents: 'none',
        }} />
      ))}
      <div
        onClick={e => e.stopPropagation()}
        key={page}
        style={{
          // A4 비율(1654 / 2339) 고정 — 좁은 viewport에선 폭 기준으로도 캡
          height: PAPER_HEIGHT,
          aspectRatio: PAPER_ASPECT,
          backgroundColor: '#ffffff',
          color: '#1a1a1a',
          boxShadow: multi
            ? '0 8px 24px rgba(0,0,0,0.40)'
            : '8px 8px 0 0 rgba(0,0,0,0.55), 16px 16px 0 0 rgba(0,0,0,0.28)',
          overflow: 'hidden',
          cursor: 'default',
          animation: 'notePageFadeIn 0.3s ease-out',
          position: 'relative',
          isolation: 'isolate',
        }}
      >
        {/* 스크롤 영역 — 텍스처는 이 div 밖(종이 박스 고정 필름)이라 스크롤돼도 전 구간에 적용됨 */}
        <div style={{
          position: 'absolute',
          inset: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}>
        {/* 888 디자인 페이지 — 고정폭 레이아웃 + 종이폭/888 균일 zoom (리플로우/잘림 없음) */}
        <div style={{
          width: DESIGN_W,
          minHeight: DESIGN_PAGE_H,
          margin: '0 auto',
          boxSizing: 'border-box',
          // 세로 패딩 축소(스크롤 방지용 세로 공간 확보) — 가로 40은 유지해 줄바꿈 불변
          padding: '28px 40px',
          zoom: scale * scaleMul,
          transform: (offX || offY) ? `translate(${offX}px, ${offY}px)` : undefined,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
        }}>
        {/* 제목 — 첫 페이지에만 */}
        {page === 0 && (
          <div style={{
            fontFamily: '"Unifont", monospace',
            fontSize: 20,
            letterSpacing: 4,
            textAlign: 'center',
            marginBottom: 14,
            color: '#1a1a1a',
            width: '100%',
          }}>
            <NoteText ko={note.title} en={titleEn} />
          </div>
        )}

        {/* Segments wrapper — paper 안쪽 폭에 맞춤 (좁은 viewport에서 텍스트 wrap 보장) */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 8,
          width: '100%',
          margin: '0 auto',
        }}>
          {pageData.segments.map((seg, i) => (
            <SegmentRenderer key={i} segment={seg} />
          ))}
        </div>

        {/* 페이지 풋터 — 종이 안쪽 검정, 다중 페이지일 때만 (발견성) */}
        {multi && (
          <div style={{
            marginTop: 'auto',
            paddingTop: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            width: '100%',
            fontFamily: '"Unifont", monospace',
            fontSize: 13,
            letterSpacing: 2,
            color: '#1a1a1a',
            userSelect: 'none',
          }}>
            <span style={{ opacity: page > 0 ? 0.7 : 0.2 }}>‹ A</span>
            <span style={{ opacity: 0.9 }}>{page + 1} / {totalPages}</span>
            <span style={{ opacity: page < totalPages - 1 ? 0.7 : 0.2 }}>D ›</span>
          </div>
        )}
        </div>
        </div>

        {/* 종이 텍스처 오버레이 — 스크롤 영역 밖, 종이 박스 고정 필름 (스크롤 전 구간 적용) */}
        {activeNoteId && NOTE_PAPER[activeNoteId] && (() => {
          const fillNotes = new Set(['hell-salad', 'bichae', 'jeju-fire'])
          const isFill = fillNotes.has(activeNoteId)
          return (
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url("${NOTE_PAPER[activeNoteId]}")`,
              backgroundSize: isFill ? 'cover' : '240px 240px',
              backgroundRepeat: isFill ? 'no-repeat' : 'repeat',
              backgroundPosition: isFill ? 'center' : undefined,
              mixBlendMode: 'multiply',
              pointerEvents: 'none',
              opacity: 0.3,
            }} />
          )
        })()}
      </div>
      </div>

      <div style={{
        fontSize: 12,
        letterSpacing: 4,
        fontFamily: '"Unifont", monospace',
        textAlign: 'center',
        color: '#f3eedd',
        textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.7)',
        opacity: 0.75,
      }}>
        E — 닫기
      </div>

      {dev && (
        <div
          onClick={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: 16,
            right: 16,
            zIndex: 2100,
            width: 230,
            padding: 12,
            background: 'rgba(20,20,20,0.92)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 4,
            fontFamily: '"Unifont", monospace',
            fontSize: 11,
            color: '#ddd',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            userSelect: 'none',
          }}
        >
          <div style={{ fontSize: 12, color: '#e8a030' }}>NoteReader 튜닝</div>
          <div style={{ color: '#888', fontSize: 10 }}>
            base {scale.toFixed(3)} · 적용 zoom {(scale * scaleMul).toFixed(3)}
          </div>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span>텍스트 배율 (scaleMul) — {scaleMul.toFixed(2)}</span>
            <input
              type="range" min={0.5} max={3} step={0.05} value={scaleMul}
              onChange={e => setScaleMul(Number(e.target.value))}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span>X 오프셋 — {offX}px</span>
            <input
              type="range" min={-200} max={200} step={1} value={offX}
              onChange={e => setOffX(Number(e.target.value))}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span>Y 오프셋 — {offY}px</span>
            <input
              type="range" min={-200} max={200} step={1} value={offY}
              onChange={e => setOffY(Number(e.target.value))}
            />
          </label>

          <button
            onClick={() => { setScaleMul(1); setOffX(0); setOffY(0) }}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 3,
              color: '#ddd',
              fontFamily: 'inherit',
              fontSize: 11,
              padding: '4px 8px',
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
          <div style={{ color: '#666', fontSize: 9 }}>P로 패널 토글</div>
        </div>
      )}

      <style>{`
        @keyframes noteReaderFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes notePageFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
