import React, { useEffect, useState } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { useSoundManager } from '@/hooks/useSoundManager';

const koreanLines = [
  '오류가 발생했습니다.',
  '불편을 드려서 죄송합니다.',
  '서비스를 일시적으로 중단합니다.',
];

const englishLines = [
  'An error has occurred.',
  'We apologize for the inconvenience.',
  'Service is temporarily suspended.',
];

export const Ch4Screen: React.FC = () => {
  const goToChapter = useGameStore(s => s.goToChapter);
  const { play, stop } = useSoundManager();

  const [phase, setPhase] = useState<'black' | 'text' | 'ending'>('black');
  const [visibleLines, setVisibleLines] = useState(0);
  const [endingVisible, setEndingVisible] = useState(false);

  useEffect(() => {
    play('phone_ring');

    // Phase 1: black silence for 6s
    const t1 = setTimeout(() => setPhase('text'), 8000); // 2s fade + 6s silence

    return () => clearTimeout(t1);
  }, [play]);

  useEffect(() => {
    if (phase !== 'text') return;

    // Reveal lines one by one
    const timers: NodeJS.Timeout[] = [];
    for (let i = 0; i < 3; i++) {
      timers.push(setTimeout(() => setVisibleLines(i + 1), i * 800));
    }

    // After 12s show ending
    timers.push(setTimeout(() => {
      stop('phone_ring');
      setPhase('ending');
    }, 12000));

    return () => timers.forEach(clearTimeout);
  }, [phase, stop]);

  useEffect(() => {
    if (phase !== 'ending') return;
    const t1 = setTimeout(() => setEndingVisible(true), 500);
    const t2 = setTimeout(() => {
      play('screen_on');
      goToChapter('CH5');
    }, 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [phase, goToChapter, play]);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#0a0a0a',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
      animation: 'fadeIn 2s ease forwards',
    }}>
      {phase === 'text' && (
        <div style={{ position: 'relative', width: '80%', maxWidth: 500 }}>
          {/* Korean layer */}
          <div style={{ position: 'relative', zIndex: 2 }}>
            {koreanLines.map((line, i) => (
              <p key={`ko-${i}`} style={{
                fontFamily: 'monospace',
                color: '#fff',
                fontSize: 14,
                opacity: i < visibleLines ? 1 : 0,
                transition: 'opacity 0.8s ease',
                marginBottom: 8,
              }}>
                {line}
              </p>
            ))}
          </div>
          {/* English layer - offset */}
          <div style={{ position: 'absolute', top: 4, left: 4, zIndex: 1, opacity: 0.4 }}>
            {englishLines.map((line, i) => (
              <p key={`en-${i}`} style={{
                fontFamily: 'monospace',
                color: '#fff',
                fontSize: 14,
                opacity: i < visibleLines ? 1 : 0,
                transition: 'opacity 0.8s ease',
                marginBottom: 8,
              }}>
                {line}
              </p>
            ))}
          </div>
        </div>
      )}

      {phase === 'ending' && (
        <p style={{
          fontFamily: 'monospace',
          fontStyle: 'italic',
          color: '#fff',
          fontSize: 18,
          textAlign: 'center',
          opacity: endingVisible ? 1 : 0,
          transition: 'opacity 2s ease',
          padding: '0 2rem',
        }}>
          기억으로 연속되는 자아로부터의 일시적인 망명.
        </p>
      )}
    </div>
  );
};
