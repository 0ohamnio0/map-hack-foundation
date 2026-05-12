/**
 * CH.2 떨어진 쪽지 — 본문 모달 (텍스트 + 인라인 이미지).
 * - 종이는 A4 비율(1654 / 2339) 고정 박스, 텍스트 양 무관하게 동일 사이즈
 * - 한/영 토글 (Q 키 또는 상단 버튼) · 세션 전역 유지
 * - preserveSpacing 적용 segment는 monospace 그대로 보존 (ASCII / 코드)
 * - E/Esc 닫기 · ←→ 또는 A/D 페이지 이동 (페이지 변경 시 paper_flip)
 */
import { useEffect, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { useSoundManager } from '@/hooks/useSoundManager'
import { useScrambleTransition } from '@/hooks/useGlitchText'
import { CH2_NOTES, type PageSegment } from '@/data/ch2Notes'

const BASE = import.meta.env.BASE_URL

// 노트별 종이 텍스처 매핑 (Note.tsx와 일치)
const NOTE_PAPER: Record<string, string> = {
  theta:       `${BASE}assets/tex/paper/paper-01.png`,
  entropy:     `${BASE}assets/tex/paper/paper-02.jpg`,
  'jeju-fire': `${BASE}assets/tex/paper/paper-03.jpg`,
  bichae:      `${BASE}assets/tex/paper/paper-04.jpg`,
  'hell-salad':`${BASE}assets/tex/paper/paper-05.jpg`,
  termination: `${BASE}assets/tex/paper/paper-06.jpg`,
  highstreamer:`${BASE}assets/tex/paper/paper-07.jpg`,
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
      fontSize: size === 'small' ? 'clamp(8px, 1.0vw, 9px)' : 'clamp(10px, 1.4vw, 12px)',
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
          maxHeight: 'clamp(140px, 30vh, 320px)',
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

  // 새 쪽지 열림: 페이지 초기화 + paper SFX
  useEffect(() => {
    setPage(0)
    if (activeNoteId !== null) play('paper_flip')
  }, [activeNoteId, play])

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

      <div
        onClick={e => e.stopPropagation()}
        key={page}
        style={{
          // A4 비율(1654 / 2339) 고정 — 좁은 viewport에선 폭 기준으로도 캡
          height: 'min(80vh, 980px, calc(92vw * 2339 / 1654))',
          aspectRatio: '1654 / 2339',
          backgroundColor: '#ffffff',
          color: '#1a1a1a',
          padding: '3% 4.5%',
          boxShadow: '8px 8px 0 0 rgba(0,0,0,0.55), 16px 16px 0 0 rgba(0,0,0,0.28)',
          overflowY: 'auto',
          overflowX: 'hidden',
          cursor: 'default',
          animation: 'notePageFadeIn 0.3s ease-out',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          position: 'relative',
          isolation: 'isolate',
        }}
      >
        {/* 제목 — 첫 페이지에만 */}
        {page === 0 && (
          <div style={{
            fontFamily: '"Unifont", monospace',
            fontSize: 'clamp(13px, 1.8vw, 16px)',
            letterSpacing: 4,
            textAlign: 'center',
            marginBottom: 18,
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

        {/* 종이 텍스처 오버레이 — 텍스트·이미지 위에 multiply 필름 */}
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

      {/* 페이지 인디케이터 (다중 페이지일 때만) */}
      {multi && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          fontSize: 12,
          letterSpacing: 3,
          fontFamily: '"Unifont", monospace',
          color: '#f3eedd',
          textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 0 10px rgba(0,0,0,0.7)',
          opacity: 0.85,
          userSelect: 'none',
        }}>
          <span style={{ opacity: page > 0 ? 1 : 0.25 }}>← / A</span>
          <span>{page + 1} / {totalPages}</span>
          <span style={{ opacity: page < totalPages - 1 ? 1 : 0.25 }}>D / →</span>
        </div>
      )}

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
