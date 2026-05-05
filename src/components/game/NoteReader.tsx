/**
 * CH.2 떨어진 쪽지 — 본문 모달.
 * 책 페이지 스캔 이미지를 로우폴리 텍스처(sepia + contrast + grain) 처리하여 표시.
 * ESC / E / 배경클릭 → 닫기 + 휘발.
 */
import { useEffect } from 'react'
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

  useEffect(() => {
    if (activeNoteId === null) return
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'KeyE') {
        e.preventDefault()
        closeNote()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [activeNoteId, closeNote])

  if (activeNoteId === null) return null

  const note = CH2_NOTES.find(n => n.id === activeNoteId)
  if (!note) return null

  return (
    <div
      onClick={closeNote}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2000,
        background: 'rgba(0, 0, 0, 0.92)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflowY: 'auto',
        padding: '5vh 4vw 4vh',
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
          gap: 24,
          cursor: 'default',
        }}
      >
        {note.images.map((src, i) => (
          <div
            key={i}
            style={{
              position: 'relative',
              boxShadow: '0 18px 60px rgba(0,0,0,0.7), 0 4px 12px rgba(0,0,0,0.5)',
              transform: i % 2 === 0 ? 'rotate(-0.4deg)' : 'rotate(0.5deg)',
              background: '#e8dfc4',
            }}
          >
            <img
              src={`${BASE}${src}`}
              alt={`${note.title} — page ${i + 1}`}
              draggable={false}
              style={{
                display: 'block',
                width: '100%',
                height: 'auto',
                // 로우폴리 텍스처: 살짝 빛바랜 종이 + contrast
                filter: 'sepia(0.32) saturate(0.7) contrast(1.08) brightness(0.92)',
                mixBlendMode: 'normal',
              }}
            />
            {/* Grain noise overlay — multiply blend로 종이 질감 */}
            <div style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: GRAIN_URL,
              mixBlendMode: 'multiply',
              opacity: 0.55,
              pointerEvents: 'none',
            }} />
            {/* Subtle vignette */}
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'radial-gradient(ellipse at center, transparent 55%, rgba(40,30,15,0.35) 100%)',
              mixBlendMode: 'multiply',
              pointerEvents: 'none',
            }} />
          </div>
        ))}

        <div style={{
          marginTop: 16,
          fontSize: 11,
          letterSpacing: 4,
          opacity: 0.42,
          fontFamily: 'monospace',
          textAlign: 'center',
          color: '#f3eedd',
        }}>
          ESC · CLICK · E — 닫기
        </div>
      </div>

      <style>{`
        @keyframes noteReaderFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
