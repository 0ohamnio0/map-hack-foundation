import React from 'react';
import { useGameStore } from '@/store/useGameStore';

export const StartScreen: React.FC = () => {
  const goToChapter = useGameStore(s => s.goToChapter);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#0a0a0a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        cursor: 'pointer',
      }}
      onClick={() => goToChapter('INTRO')}
    >
      <h1
        style={{
          fontFamily: 'monospace',
          color: '#fff',
          fontSize: '3rem',
          letterSpacing: '0.2em',
          marginBottom: '2rem',
        }}
      >
        Map Hack
      </h1>
      <p
        style={{
          fontFamily: 'monospace',
          color: '#fff',
          fontSize: '1.2rem',
          animation: 'blink 1s step-end infinite',
        }}
      >
        → 시작
      </p>
    </div>
  );
};
