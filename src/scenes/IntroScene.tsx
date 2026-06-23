/**
 * INTRO Scene — CH.1 인트로 프리뷰 영상이 메인.
 * 영상은 muted, BGM은 chapterMusic의 ch1.mp3 (CH.1과 같은 트랙으로 이어짐).
 * 오디오(BGM)를 마스터 클럭으로 두고, 영상이 실제 재생을 시작하는 'playing' 시점에
 * 영상을 오디오 위치로 스냅해 sync 유지 (출발 순서만으로는 두 클럭이 정확히 안 맞음).
 * Auto-transitions to CH.1 when the video ends.
 * Title fades in 5s before the video ends.
 */
import React, { useEffect, useRef, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { useSoundManager } from '@/hooks/useSoundManager'
import { useFontReady } from '@/hooks/useFontReady'
import { playChapterMusic, getChapterMusicSeek } from '@/lib/chapterMusic'

const VIDEO_SRC = `${import.meta.env.BASE_URL ?? '/'}assets/video/preview.mp4`
const TITLE_LEAD_BEFORE_END_MS = 5000
const INTRO_HOLD_BEFORE_PLAY_MS = 800

export const IntroScene: React.FC = () => {
  const goToChapter = useGameStore((s) => s.goToChapter)
  const { play } = useSoundManager()
  const [titleVisible, setTitleVisible] = useState(false)
  const [ready, setReady] = useState(false)
  const startedRef = useRef(false)
  const fontReady = useFontReady('Hammer Keys')
  const videoRef = useRef<HTMLVideoElement>(null)
  const titleTimerRef = useRef<number | null>(null)
  const holdTimerRef = useRef<number | null>(null)

  useEffect(() => {
    play('intro_ambient')
    return () => {
      if (titleTimerRef.current !== null) clearTimeout(titleTimerRef.current)
      if (holdTimerRef.current !== null) clearTimeout(holdTimerRef.current)
    }
  }, [play])

  const handleCanPlay = () => {
    if (startedRef.current) return
    const v = videoRef.current
    if (!v) return
    startedRef.current = true
    // canplay 직후가 아닌, 한 호흡 쉬고 시작.
    // BGM(오디오)을 마스터로 먼저 시작하고, 영상이 실제 재생을 시작하는 'playing' 순간에
    // 영상을 오디오의 현재 위치로 스냅해 시작 오프셋을 0으로 만든다.
    holdTimerRef.current = window.setTimeout(() => {
      const vv = videoRef.current
      if (!vv) return
      setReady(true)
      playChapterMusic('INTRO')
      const onPlaying = () => {
        const audioPos = getChapterMusicSeek()
        if (audioPos != null) {
          const delta = audioPos - vv.currentTime
          // 미세 오프셋만 보정 (큰 점프는 버퍼링 등 이상치이므로 무시)
          if (Math.abs(delta) > 0.05 && Math.abs(delta) < 1.5) vv.currentTime = audioPos
        }
        const remainingMs = (vv.duration - vv.currentTime) * 1000
        const delay = Math.max(0, remainingMs - TITLE_LEAD_BEFORE_END_MS)
        titleTimerRef.current = window.setTimeout(() => {
          setTitleVisible(true)
          play('dog_bark')
        }, delay)
      }
      vv.addEventListener('playing', onPlaying, { once: true })
      vv.play().catch((err) => console.warn('[Intro] video play failed', err))
    }, INTRO_HOLD_BEFORE_PLAY_MS)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#000', overflow: 'hidden' }}>
      {/* CH.1 인트로 프리뷰 영상 — muted (BGM은 chapterMusic 측에서 ch1.mp3로 깔림).
          영상 끝나면 자동으로 CH.1 진입. */}
      <video
        ref={videoRef}
        src={VIDEO_SRC}
        muted
        playsInline
        preload="auto"
        onEnded={() => goToChapter('CH1')}
        onCanPlay={handleCanPlay}
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
      {/* Title overlay — fades in 5s before the video ends */}
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
            opacity: titleVisible && fontReady ? 1 : 0,
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
