/**
 * CH.2 떨어진 쪽지 — 본문 모달.
 * 책 페이지 스캔 이미지를 로우폴리 텍스처(sepia + contrast + grain) 처리하여 표시.
 * E 키로 닫기 + 휘발. 다중 페이지 시 ← → 키로 이동.
 */
import { useEffect, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { CH2_NOTES } from '@/data/ch2Notes'

const BASE = import.meta.env.BASE_URL

// SVG 노이즈 — base64 inline data URI로 grain 오버레이
const GRAIN_SVG = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'>
  <filter id='n'>
    <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>
    <feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.55 0'/>
  </filter>
  <rect width='100%' height='100%' filter='url(#n)' opacity='0.85'/>
</svg>`
const GRAIN_URL = `url("data:image/svg+xml;utf8,${encodeURIComponent(GRAIN_SVG)}")`

export function NoteReader() {
  const activeNoteId = useGameStore(s => s.activeNoteId)
  const closeNote = useGameStore(s => s.closeNote)
  const [page, setPage] = useState(0)

  // 새 쪽지 열릴 때마다 페이지 초기화
  useEffect(() => {
    setPage(0)
  }, [activeNoteId])

  const note = activeNoteId === null ? null : CH2_NOTES.find(n => n.id === activeNoteId) ?? null
  const totalPages = note ? note.images.length : 0

  useEffect(() => {
    if (note === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyE') {
        e.preventDefault()
        closeNote()
        return
      }
      if (totalPages > 1) {
        if (e.code === 'ArrowLeft') {
          e.preventDefault()
          setPage(p => Math.max(0, p - 1))
        } else if (e.code === 'ArrowRight') {
          e.preventDefault()
          setPage(p => Math.min(totalPages - 1, p + 1))
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [note, totalPages, closeNote])

  if (note === null) return null

  const currentSrc = note.images[page]
  const multi = totalPages > 1

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
        overflowY: 'auto',
        padding: '4vh 4vw',
        cursor: 'pointer',
        animation: 'noteReaderFadeIn 0.5s ease-out',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 540,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          cursor: 'default',
        }}
      >
        <div
          key={page}
          style={{
            position: 'relative',
            // 로우폴리 그림자 — blur 0, 단단한 계단식 오프셋 두 단
            boxShadow: '8px 8px 0 0 rgba(0,0,0,0.55), 16px 16px 0 0 rgba(0,0,0,0.28)',
            background: '#ffffff',
            animation: 'notePageFadeIn 0.25s ease-out',
          }}
        >
          <img
            src={`${BASE}${currentSrc}`}
            alt={`${note.title} — page ${page + 1}`}
            draggable={false}
            style={{
              display: 'block',
              width: '100%',
              height: 'auto',
            }}
          />
          {/* Grain noise overlay — multiply blend로 종이 질감 (색조 없음) */}
          <div style={{
            position: 'absolute',
            inset: 0,
            backgroundImage: GRAIN_URL,
            mixBlendMode: 'multiply',
            opacity: 0.4,
            pointerEvents: 'none',
          }} />
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
            marginTop: 4,
            userSelect: 'none',
          }}>
            <span style={{ opacity: page > 0 ? 1 : 0.25 }}>←</span>
            <span>{page + 1} / {totalPages}</span>
            <span style={{ opacity: page < totalPages - 1 ? 1 : 0.25 }}>→</span>
          </div>
        )}

        <div style={{
          marginTop: multi ? 4 : 16,
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
      </div>

      <style>{`
        @keyframes noteReaderFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes notePageFadeIn {
          from { opacity: 0; transform: translateY(6px) rotate(0deg); }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
