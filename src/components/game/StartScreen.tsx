import React from 'react';
import { useGameStore } from '@/store/useGameStore';

const VIDEO_SRC = `${import.meta.env.BASE_URL ?? '/'}assets/video/preview.mp4`;

export const StartScreen: React.FC = () => {
  const goToChapter = useGameStore(s => s.goToChapter);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        cursor: 'pointer',
        overflow: 'hidden',
      }}
      onClick={() => goToChapter('INTRO')}
    >
      {/* Background preview video — muted; intro BGM plays via chapterMusic */}
      <video
        src={VIDEO_SRC}
        autoPlay
        loop
        muted
        playsInline
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          opacity: 0.55,
          pointerEvents: 'none',
        }}
      />
      {/* Vignette overlay for text legibility */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse at center, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.85) 100%)',
          pointerEvents: 'none',
        }}
      />
      <h1
        style={{
          position: 'relative',
          fontFamily: 'monospace',
          color: '#fff',
          fontSize: '3rem',
          letterSpacing: '0.2em',
          marginBottom: '2rem',
          textShadow: '0 0 30px rgba(0,0,0,0.8)',
        }}
      >
        Map Hack
      </h1>
      <p
        style={{
          position: 'relative',
          fontFamily: 'monospace',
          color: '#fff',
          fontSize: '1.2rem',
          animation: 'blink 1s step-end infinite',
          textShadow: '0 0 20px rgba(0,0,0,0.8)',
        }}
      >
        → 시작
      </p>
    </div>
  );
};
