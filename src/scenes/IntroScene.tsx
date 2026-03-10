import React, { useEffect, useState } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { useSoundManager } from '@/hooks/useSoundManager';

export const IntroScene: React.FC = () => {
  const goToChapter = useGameStore(s => s.goToChapter);
  const { play } = useSoundManager();
  const [titleVisible, setTitleVisible] = useState(false);

  useEffect(() => {
    play('intro_ambient');
    const t1 = setTimeout(() => setTitleVisible(true), 2000);
    const t2 = setTimeout(() => goToChapter('CH1'), 5000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [goToChapter, play]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
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
        }}
      >
        Map Hack
      </h1>
    </div>
  );
};
