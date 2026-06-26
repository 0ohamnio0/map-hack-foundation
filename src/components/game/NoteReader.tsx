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
import { CH3_FRAGMENTS, NPC_FRAGMENT_IDS, BATTLE_FRAGMENT_IDS } from '@/data/ch3Fragments'

const BASE = import.meta.env.BASE_URL

// CH.2 쪽지 + CH.3 시 조각 — 같은 PoemNote 구조라 하나의 레지스트리로 조회(폰트·스타일 통일)
const ALL_NOTES = [...CH2_NOTES, ...CH3_FRAGMENTS]

// Tab+방향키 순차 열람용 — 수집 UI 배열 순서가 곧 열람 순서. 가로 배열 그룹은 ←/→, 세로(battle)는 ↑/↓.
const CH2_IDS = CH2_NOTES.map(n => n.id)
function poemGroup(id: string): { ids: readonly string[]; vertical: boolean } | null {
  if (CH2_IDS.includes(id)) return { ids: CH2_IDS, vertical: false }
  if ((NPC_FRAGMENT_IDS as readonly string[]).includes(id)) return { ids: NPC_FRAGMENT_IDS, vertical: false }
  if ((BATTLE_FRAGMENT_IDS as readonly string[]).includes(id)) return { ids: BATTLE_FRAGMENT_IDS, vertical: true }
  return null
}

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
// CH.3 시 조각 — CH.2 종이 텍스처 8종(paper-01~08)을 순환 재사용
CH3_FRAGMENTS.forEach((n, i) => {
  NOTE_PAPER[n.id] = `${BASE}assets/tex/paper/paper-0${(i % 8) + 1}.webp`
})

// 시별 종이 색 — 종이 텍스처 위 multiply 오버레이로 "그 색 종이"처럼 보이게.
//  ckshp/맹점 → 형광 연두, 전략적 행성 전투(battle) → 연보라
const paperTint = (id: string): string | null => {
  if (id.startsWith('ckshp') || id.startsWith('maengjeom')) return '#c4ff2e' // 형광 연두
  if (id.startsWith('battle')) return '#c9b8ff'                              // 연보라
  return null
}

// 노트별 시 조각 드로잉 배경 (밝기=알파 키잉한 VP9 알파 WebM) — 한 번 그려진 뒤 마지막 프레임에 정지
const NOTE_BACKDROP: Record<string, string> = {
  theta:       `${BASE}poems/blackdog.webm`,
  entropy:     `${BASE}poems/entropy.webm`,
  'jeju-fire': `${BASE}poems/jeju-fire.webm`,
  bichae:      `${BASE}poems/bichae.webm`,
  'hell-salad':`${BASE}poems/hell-salad.webm`,
  termination: `${BASE}poems/termination.webm`,
  highstreamer:`${BASE}poems/highstreamer.webm`,
}

// 드로잉 진하기 정규화 — 소스 webm마다 알파/밝기가 달라 노트별 보정 (?debug=1 슬라이더로 맞춘 확정값).
// 드로잉 획은 "밝기=알파" 키잉이라 대체로 밝은 색 → 흰 종이서 contrast↑는 더 하얘짐(역효과).
// brightness↓는 밝은 획을 어둡게 깔아 흰 종이 위에 드러내는 별도 레버 (termination처럼 너무 연한 것에 사용).
const DEFAULT_BACKDROP_FX = { opacity: 0.7, contrast: 1.5, brightness: 1.0, scaleX: 1.0, offsetX: 0, zIndex: 10 }
// zIndex: 기본 10(종이 위에 드로잉 오버레이). 0이면 종이 뒤로 깔림(텍스트가 드로잉 위).
const NOTE_BACKDROP_FX: Record<string, { opacity: number; contrast: number; brightness: number; scaleX?: number; offsetX?: number; zIndex?: number }> = {
  theta:        { opacity: 0.75, contrast: 2.6,  brightness: 1.0 },
  entropy:      { opacity: 0.65, contrast: 2.6,  brightness: 1.0 },
  'jeju-fire':  { opacity: 0.75, contrast: 2.2,  brightness: 1.0 },
  bichae:       { opacity: 0.75, contrast: 2.05, brightness: 1.0 },
  'hell-salad': { opacity: 0.6,  contrast: 3.0,  brightness: 1.0 },
  termination:  { opacity: 1.0,  contrast: 1.3,  brightness: 5.0, scaleX: 1.1, offsetX: -12, zIndex: 0 },  // brightness↑ + 좌우 늘림 + 왼쪽 + 종이 뒤로
  highstreamer: { opacity: 1.0,  contrast: 3.0,  brightness: 1.7 },
}

function NoteText({ ko, en }: { ko: string; en?: string }) {
  const lang = useGameStore(s => s.noteLanguage)
  const raw = lang === 'en' && en ? en : ko
  // 줄 단위 이탤릭: *...* 로 감싼 줄만 이탤릭 (마커는 스크램블 전 제거)
  const lines = raw.split('\n')
  const italic = lines.map(l => l.length >= 2 && /^\*[\s\S]*\*$/.test(l))
  const clean = lines.map((l, i) => (italic[i] ? l.slice(1, -1) : l)).join('\n')
  const display = useScrambleTransition(clean)
  if (!italic.some(Boolean)) return <>{display}</>
  const dlines = display.split('\n')
  return (
    <>
      {dlines.map((l, i) => (
        <span key={i} style={italic[i] ? { fontStyle: 'italic' } : undefined}>
          {l}{i < dlines.length - 1 ? '\n' : ''}
        </span>
      ))}
    </>
  )
}

function TextSegment({ ko, en, preserveSpacing, size, align, tight, compact }: {
  ko: string
  en?: string
  preserveSpacing?: boolean
  size?: 'normal' | 'small'
  align?: 'left' | 'center'
  tight?: boolean
  compact?: boolean
}) {
  // CH.3 시 조각(compact): 글씨 0.8배 + 줄간격 1.9 고정
  const baseFont = size === 'small' ? 10 : 14
  const baseLine = tight ? 1.2 : (size === 'small' ? 1.5 : 1.7)
  return (
    <div style={{
      fontFamily: '"Unifont", monospace',
      fontSize: compact ? baseFont * 0.8 : baseFont,
      lineHeight: compact ? 1.9 : baseLine,
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

function SegmentRenderer({ segment, compact }: { segment: PageSegment; compact?: boolean }) {
  if (segment.type === 'text') {
    return (
      <TextSegment
        ko={segment.ko}
        en={segment.en}
        preserveSpacing={segment.preserveSpacing}
        size={segment.size}
        align={segment.align}
        tight={segment.tight}
        compact={compact}
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
          opacity: 0.8, // CH.2 시 조각 드로잉 — 살짝 투명
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
// CH.3 짧은 시 조각 — 미니 카드(작은 종이). 짧은 본문에 비해 종이가 비어 보이던 문제 해소.
const PAPER_HEIGHT_COMPACT = 'min(56vh, 660px, calc(86vw * 2339 / 1654))'
const PAPER_ASPECT = '1654 / 2339'

// 텍스트는 항상 DESIGN_W 디자인폭으로 레이아웃 → zoom = 종이폭 / DESIGN_W 로
// 박스를 종이에 정확히 1:1 매핑 (박스=종이폭이라 우측 잘림·제목 오프셋 없음).
// 폭을 줄일수록(↓) 같은 종이에서 텍스트가 커짐 — 592 = 888/1.5 (적정값 확정).
const DESIGN_W = 592
// 미니 카드는 디자인폭을 좁혀 같은 종이에서 텍스트가 상대적으로 커지게 (작은 카드여도 읽힘)
const DESIGN_W_COMPACT = 400
// A4 페이지 높이에서 6px 뺌 — zoom 서브픽셀 반올림이 스크롤 컨테이너를
// <1px 초과시켜 생기는 '유령 스크롤' 흡수 (내용이 실제로 넘치면 정상 스크롤).
const DESIGN_PAGE_H = 'calc(592px * 2339 / 1654 - 6px)'

export function NoteReader() {
  const activeNoteId = useGameStore(s => s.activeNoteId)
  const visitedEvents = useGameStore(s => s.visitedEvents)
  const closeNote = useGameStore(s => s.closeNote)
  const openNote = useGameStore(s => s.openNote)
  const noteLanguage = useGameStore(s => s.noteLanguage)
  const setNoteLanguage = useGameStore(s => s.setNoteLanguage)
  const toggleNoteLanguage = useGameStore(s => s.toggleNoteLanguage)
  const { play } = useSoundManager()
  const [page, setPage] = useState(0)
  // Tab 눌림 상태 — Tab+방향키 chord(시 간 이동) vs 방향키 단독(페이지 이동) 구분
  const tabHeld = useRef(false)

  const note = activeNoteId === null ? null : ALL_NOTES.find(n => n.id === activeNoteId) ?? null
  // 미니 카드(CH.3 조각)면 종이·디자인폭 축소
  const paperHeight = note?.compact ? PAPER_HEIGHT_COMPACT : PAPER_HEIGHT
  const designW = note?.compact ? DESIGN_W_COMPACT : DESIGN_W
  const totalPages = note ? note.pages.length : 0

  // 새 쪽지 열림: 페이지 초기화 + 언어 한글 리셋 + paper SFX
  // (Q 토글은 그 쪽지 보는 동안만 유지 — 다음 쪽지는 항상 한글로 시작)
  useEffect(() => {
    setPage(0)
    if (activeNoteId !== null) {
      setNoteLanguage('ko')
      play('paper_flip')
      play(`vowels_${activeNoteId}`)
    }
  }, [activeNoteId, play, setNoteLanguage])

  // Tab 눌림 추적 — note 변경(시 간 이동)과 무관하게 물리 키 상태 유지. Tab 기본 포커스 이동은 차단.
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Tab') { e.preventDefault(); tabHeld.current = true } }
    const up = (e: KeyboardEvent) => { if (e.code === 'Tab') tabHeld.current = false }
    const blur = () => { tabHeld.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [])

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
      // Tab+방향키 — 같은 그룹에서 수집한 시 순차 이동 (가로 그룹 ←/→, battle ↑/↓). 방향키 단독은 아래 페이지 이동.
      if (tabHeld.current && activeNoteId) {
        const grp = poemGroup(activeNoteId)
        if (grp) {
          const dir = grp.vertical
            ? (e.code === 'ArrowUp' ? -1 : e.code === 'ArrowDown' ? 1 : 0)
            : (e.code === 'ArrowLeft' ? -1 : e.code === 'ArrowRight' ? 1 : 0)
          if (dir !== 0) {
            e.preventDefault()
            const collected = grp.ids.filter(id => visitedEvents.has(`note_${id}`))
            const cur = collected.indexOf(activeNoteId)
            const nextIdx = cur + dir
            if (cur !== -1 && nextIdx >= 0 && nextIdx < collected.length) openNote(collected[nextIdx])
            return
          }
        }
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
  }, [note, totalPages, closeNote, play, toggleNoteLanguage, openNote, visitedEvents, activeNoteId])

  // 종이 실제 폭을 측정해 zoom 배율 산출 (배율만 JS, 스크롤 높이는 zoom이 처리)
  const paperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  // 개발용 튜닝 (P 토글) — 텍스트 스케일 배율 + X/Y 오프셋
  const dev = useDevMode()
  // 텍스트 정렬 — scaleMul 공통. 오프셋은 제목 유무에 따라 baseOffX/Y로 분기, 슬라이더는 추가 미세조정(delta).
  const [scaleMul, setScaleMul] = useState(1.05)
  const [offX, setOffX] = useState(0)
  const [offY, setOffY] = useState(0)
  // 드로잉 배경 진하기 — 노트별 FX(NOTE_BACKDROP_FX)에서 시드, dev 슬라이더로 라이브 조절. 비-dev는 시드값 그대로 적용.
  const noteFx = (activeNoteId && NOTE_BACKDROP_FX[activeNoteId]) || DEFAULT_BACKDROP_FX
  const [bdOpacity, setBdOpacity] = useState(noteFx.opacity)
  const [bdContrast, setBdContrast] = useState(noteFx.contrast)
  const [bdBrightness, setBdBrightness] = useState(noteFx.brightness)
  const [bdScaleX, setBdScaleX] = useState(noteFx.scaleX ?? 1)
  const [bdOffsetX, setBdOffsetX] = useState(noteFx.offsetX ?? 0)
  useEffect(() => {
    setBdOpacity(noteFx.opacity)
    setBdContrast(noteFx.contrast)
    setBdBrightness(noteFx.brightness)
    setBdScaleX(noteFx.scaleX ?? 1)
    setBdOffsetX(noteFx.offsetX ?? 0)
  }, [activeNoteId])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = paperRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      // 캡 없음 — 박스가 항상 종이폭에 정확히 맞아야 잘림/오프셋이 안 생김.
      setScale(entry.contentRect.width / designW)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [note])

  if (note === null) return null

  const pageData = note.pages[page]
  const multi = totalPages > 1
  const titleEn = note.titleEn
  // 제목 — 시의 첫 조각만 (ckshp1·battle1·maengjeom1). 뒷 조각(끝번호 2+)은 제목 없음.
  // CH.2 단일 노트는 id에 끝번호 없어 항상 표시.
  const showTitle = (note.id.match(/(\d+)$/)?.[1] ?? '1') === '1'
  // 텍스트 종이 정렬 베이스 오프셋 (dev 튜닝 확정값) — CH.3 compact 조각과 CH.2 풀노트는
  // 종이 크기·디자인폭이 달라 오프셋을 공유하면 어긋난다. note.compact로 분기.
  const titleShown = page === 0 && showTitle
  const baseOffX = note.compact
    ? (titleShown ? -17 : -3)
    : (titleShown ? -5 : 9)
  // 연두색 조각(ckshp/맹점)은 텍스트를 26px 위로 — 해민 dev 튜닝 확정(Y 오프셋 -26)
  const greenYShift = (note.id.startsWith('ckshp') || note.id.startsWith('maengjeom')) ? -26 : 0
  const baseOffY = (note.compact
    ? (titleShown ? 81 : -147)
    : (titleShown ? 25 : 53)) + greenYShift

  return (
    <div
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
        cursor: 'default',
        animation: 'noteReaderFadeIn 0.5s ease-out',
        gap: 16,
      }}
    >
      {/* 시 조각 드로잉 배경 — 최초 획득 시엔 한 번 그려지는 애니메이션, 이미 수집해 다시 열람할 땐
          애니 없이 완성 프레임만 고정 (수집 UI 재열람 = visitedEvents에 note_* 기록된 상태) */}
      {activeNoteId && NOTE_BACKDROP[activeNoteId] && (() => {
        const replayDone = visitedEvents.has(`note_${activeNoteId}`)
        return (
        <video
          key={activeNoteId}
          src={NOTE_BACKDROP[activeNoteId]}
          autoPlay={!replayDone}
          muted
          playsInline
          aria-hidden
          onLoadedMetadata={replayDone ? (e) => {
            const v = e.currentTarget
            // 완성 프레임으로 시크해 정지 — 마지막 직전(-0.05s)이 빈 프레임 방지에 안전
            v.currentTime = Math.max(0, v.duration - 0.05)
          } : undefined}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: 'center center',
            transform: `translateX(${bdOffsetX}px) scaleX(${bdScaleX})`,
            zIndex: noteFx.zIndex ?? 10,
            pointerEvents: 'none',
            opacity: bdOpacity,
            filter: `contrast(${bdContrast}) brightness(${bdBrightness})`,
          }}
        />
        )
      })()}

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
          height: paperHeight,
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
          height: paperHeight,
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
        {/* 콘텐츠 영역 — 글리치(스크램블) 중 일시적 오버플로로 스크롤이 뜨지 않도록 hidden 고정 */}
        <div style={{
          position: 'absolute',
          inset: 0,
          overflowY: 'hidden',
          overflowX: 'hidden',
        }}>
        {/* 888 디자인 페이지 — 고정폭 레이아웃 + 종이폭/888 균일 zoom (리플로우/잘림 없음) */}
        <div style={{
          width: designW,
          minHeight: DESIGN_PAGE_H,
          margin: '0 auto',
          boxSizing: 'border-box',
          // 세로 패딩 축소(스크롤 방지용 세로 공간 확보) — 가로 40은 유지해 줄바꿈 불변
          padding: '28px 40px',
          zoom: scale * scaleMul,
          transform: `translate(${baseOffX + offX}px, ${baseOffY + offY}px)`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 10,
        }}>
        {/* 본문 영역 — flex:1로 종이 안쪽 공간을 채우고, 제목 없으면 텍스트를 세로 중앙 정렬.
            (footer의 margin-top:auto가 중앙정렬을 깨던 문제 → 본문을 별도 래퍼로 분리) */}
        <div style={{
          flex: 1,
          minHeight: 0,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: showTitle ? 'flex-start' : 'center',
          gap: 10,
        }}>
        {/* 제목 — 마지막 조각 제외 */}
        {page === 0 && showTitle && (
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
            <SegmentRenderer key={i} segment={seg} compact={note?.compact} />
          ))}
        </div>

        {/* 시의 마지막 장이 아니면 — 다음 조각이 더 있음을 알리는 표시 */}
        {note.continues && (
          <div style={{
            marginTop: showTitle ? 'auto' : 18, // 제목 없는(중앙정렬) 조각은 auto로 텍스트를 밀지 않음
            paddingTop: 18,
            width: '100%',
            textAlign: 'right',
            fontFamily: '"Unifont", monospace',
            fontSize: 13,
            letterSpacing: 2,
            color: '#1a1a1a',
            opacity: 0.55,
            userSelect: 'none',
          }}>
            계속... →
          </div>
        )}
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
        {/* 시별 색 종이 — 텍스처 위 multiply 색 오버레이 (종이 자체가 색깔 종이처럼). 어두운 본문 글자는 유지 */}
        {activeNoteId && paperTint(activeNoteId) && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: paperTint(activeNoteId)!,
            mixBlendMode: 'multiply',
            pointerEvents: 'none',
            opacity: 0.6,
          }} />
        )}
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
            top: 88,
            left: 16,
            zIndex: 10000,
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

          {activeNoteId && NOTE_BACKDROP[activeNoteId] && (
            <>
              <div style={{ color: '#888', fontSize: 10, marginTop: 4 }}>
                드로잉 ({activeNoteId}) — theta 연하기 기준으로 맞춤
              </div>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span>드로잉 opacity — {bdOpacity.toFixed(2)}</span>
                <input
                  type="range" min={0} max={1} step={0.05} value={bdOpacity}
                  onChange={e => setBdOpacity(Number(e.target.value))}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span>드로잉 contrast — {bdContrast.toFixed(2)}</span>
                <input
                  type="range" min={0.5} max={3} step={0.05} value={bdContrast}
                  onChange={e => setBdContrast(Number(e.target.value))}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span>드로잉 brightness — {bdBrightness.toFixed(2)}</span>
                <input
                  type="range" min={0.2} max={10} step={0.1} value={bdBrightness}
                  onChange={e => setBdBrightness(Number(e.target.value))}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span>드로잉 가로 스케일 — {bdScaleX.toFixed(2)}</span>
                <input
                  type="range" min={0.8} max={1.5} step={0.01} value={bdScaleX}
                  onChange={e => setBdScaleX(Number(e.target.value))}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span>드로잉 X 이동 — {bdOffsetX}px</span>
                <input
                  type="range" min={-100} max={100} step={1} value={bdOffsetX}
                  onChange={e => setBdOffsetX(Number(e.target.value))}
                />
              </label>
            </>
          )}

          <button
            onClick={() => { setScaleMul(1.05); setOffX(0); setOffY(0); setBdOpacity(noteFx.opacity); setBdContrast(noteFx.contrast); setBdBrightness(noteFx.brightness); setBdScaleX(noteFx.scaleX ?? 1); setBdOffsetX(noteFx.offsetX ?? 0) }}
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
