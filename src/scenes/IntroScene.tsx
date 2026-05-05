/**
 * INTRO Scene — CH.1 인트로 1차 프리뷰 영상이 메인.
 * Auto-transitions to CH.1 after 30s. Title fades in at 15s.
 */
import React, { useEffect, useState } from 'react'
import { useGameStore } from '@/store/useGameStore'
import { useSoundManager } from '@/hooks/useSoundManager'

const VIDEO_SRC = `${import.meta.env.BASE_URL ?? '/'}assets/video/preview.mp4`

export const IntroScene: React.FC = () => {
  const goToChapter = useGameStore((s) => s.goToChapter)
  const { play } = useSoundManager()
  const [titleVisible, setTitleVisible] = useState(false)

  useEffect(() => {
    play('intro_ambient')
    const t1 = setTimeout(() => setTitleVisible(true), 15000)
    const t2 = setTimeout(() => goToChapter('CH1'), 30000)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [goToChapter, play])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#000', overflow: 'hidden' }}>
      {/* CH.1 인트로 프리뷰 영상 — 영상 자체 audio track 사용 (별도 BGM 없음) */}
      <video
        src={VIDEO_SRC}
        autoPlay
        loop
        playsInline
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none',
        }}
      />
      {/* Title overlay — fades in at 15s */}
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
            fontFamily: 'monospace',
            color: '#fff',
            fontSize: '3rem',
            letterSpacing: '0.3em',
            opacity: titleVisible ? 1 : 0,
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
