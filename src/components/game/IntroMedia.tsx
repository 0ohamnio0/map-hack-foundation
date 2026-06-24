/**
 * IntroMedia — 인트로 영상 + 타이틀 오버레이를 씬 라우터 바깥(Game.tsx 영속 레이어)에서 소유.
 * 영상에 ch1.mp3 전체가 baked 오디오로 들어 있어, 영상 = 비주얼·오디오 단일 클럭 → 싱크가 구조적으로 완벽.
 * footage 끝(74.5s)에서 CH.1로 자동 전환하되 이 엘리먼트는 언마운트되지 않고 계속 재생 →
 * 74.5~144s 블랙 구간의 오디오가 그대로 CH.1 BGM으로 이어진다(별도 ch1.mp3 재생 없음).
 * 타이틀 로고는 footage 끝 5초 전(69.5s)에 페이드인.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { useSoundManager } from '@/hooks/useSoundManager'
import { useFontReady } from '@/hooks/useFontReady'

const VIDEO_SRC = `${import.meta.env.BASE_URL ?? '/'}assets/video/intro_final.mp4`
// 실제 footage 끝 = 00:01:14:12 (23.976fps). 이후 144s까지는 블랙(오디오만 지속).
const FOOTAGE_END_S = 74.5
const TITLE_LEAD_S = 5 // 타이틀은 footage 끝 5초 전(69.5s) 등장 — 기존 타이밍 유지
const INTRO_HOLD_BEFORE_PLAY_MS = 800

export const IntroMedia: React.FC = () => {
  const chapter = useGameStore((s) => s.chapter)
  const goToChapter = useGameStore((s) => s.goToChapter)
  const setIntroAudioActive = useGameStore((s) => s.setIntroAudioActive)
  const { play } = useSoundManager()
  const fontReady = useFontReady('Hammer Keys')
  const [titleVisible, setTitleVisible] = useState(false)
  const [ready, setReady] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const startedRef = useRef(false)
  const titleShownRef = useRef(false)
  const transitionedRef = useRef(false)
  const holdTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (holdTimerRef.current !== null) clearTimeout(holdTimerRef.current)
      // 인트로 미디어가 화면에서 빠질 때(영상 종료 또는 CH.2 이동) 오디오 캐리 종료
      setIntroAudioActive(false)
      const v = videoRef.current
      if (v) v.pause()
    }
  }, [setIntroAudioActive])

  const handleCanPlay = () => {
    if (startedRef.current) return
    const v = videoRef.current
    if (!v) return
    startedRef.current = true
    // canplay 직후가 아닌, 한 호흡 쉬고 시작(START→INTRO 페이드와 겹치지 않게).
    holdTimerRef.current = window.setTimeout(() => {
      const vv = videoRef.current
      if (!vv) return
      setReady(true)
      setIntroAudioActive(true)
      vv.play().catch((err) => console.warn('[IntroMedia] video play failed', err))
    }, INTRO_HOLD_BEFORE_PLAY_MS)
  }

  const handleTimeUpdate = () => {
    const v = videoRef.current
    if (!v) return
    const t = v.currentTime
    if (!titleShownRef.current && t >= FOOTAGE_END_S - TITLE_LEAD_S) {
      titleShownRef.current = true
      setTitleVisible(true)
      play('dog_bark')
    }
    if (!transitionedRef.current && t >= FOOTAGE_END_S) {
      transitionedRef.current = true
      goToChapter('CH1') // 영상은 언마운트 안 됨 → 오디오는 계속(= CH.1 BGM)
    }
  }

  const isIntro = chapter === 'INTRO'

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: isIntro ? 100 : -1,
        background: isIntro ? '#000' : 'transparent',
        overflow: 'hidden',
        opacity: isIntro ? 1 : 0,
        pointerEvents: 'none',
      }}
    >
      {/* 영상: ch1.mp3 baked 오디오 포함(unmuted). footage 끝에서 CH.1 전환 후엔 숨겨도 오디오는 계속. */}
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        playsInline
        preload="auto"
        onEnded={() => setIntroAudioActive(false)}
        onCanPlay={handleCanPlay}
        onTimeUpdate={handleTimeUpdate}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none',
          opacity: ready ? 1 : 0,
          transition: 'opacity 400ms ease',
        }}
      />
      {/* Title overlay — footage 끝 5초 전 페이드인 (INTRO 동안만 표시) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        <h1
          style={{
            fontFamily: '"Hammer Keys", monospace',
            color: '#fff',
            fontSize: '4rem',
            letterSpacing: '0.15em',
            opacity: isIntro && titleVisible && fontReady ? 1 : 0,
            transition: 'opacity 2s ease',
            textShadow: '0 0 30px rgba(0,0,0,0.8)',
          }}
        >
          Map Hack
        </h1>
      </div>
    </div>
  )
}
