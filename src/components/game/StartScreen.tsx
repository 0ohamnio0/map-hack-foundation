import React, { useEffect, useMemo, useState } from 'react';
import KeyboardHints from '@/components/game/KeyboardHints';
import { useGameStore } from '@/store/useGameStore';
import { useFontReady } from '@/hooks/useFontReady';
import { useGlitchText } from '@/hooks/useGlitchText';
import { playChapterMusic } from '@/lib/chapterMusic';

export const StartScreen: React.FC = () => {
  const goToChapter = useGameStore(s => s.goToChapter);
  const fontReady = useFontReady('Hammer Keys');
  const [phase, setPhase] = useState<'notice' | 'start'>('notice');

  // 한 · 영 글리치 루프 — 3쌍을 약간씩 phase shift해서 동시 동기화 방지
  const noticeLine1Texts = useMemo(() => ['이 게임은 PC 환경에서 가장 잘 작동합니다', 'This game runs best on PC'], []);
  const noticeLine3Texts = useMemo(() => ['사운드가 있어요. 이어폰 또는 스피커를 사용해주세요', 'Sound on — please use earphones or speakers'], []);
  const line1 = useGlitchText(noticeLine1Texts, { interval: 3200, scrambleMs: 700, delayMs: 0 });
  const line3 = useGlitchText(noticeLine3Texts, { interval: 3200, scrambleMs: 700, delayMs: 700 });

  // Map Hack 타이틀 화면 "→ 시작" 한·영 글리치
  const startTexts = useMemo(() => ['→ 시작', '→ START'], []);
  const startLabel = useGlitchText(startTexts, { interval: 2400, scrambleMs: 500 });

  // 디자인 기준 footprint 대비 뷰포트 비율로 zoom 산출 — NoteReader와 동일 패턴.
  // 브라우저가 작아지면 1 미만으로 축소(zoom out), 기준 이상이면 1 유지(원본 충실도).
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const DESIGN_W = 1180;
    const DESIGN_H = 780;
    const compute = () =>
      setZoom(Math.min(1, window.innerWidth / DESIGN_W, window.innerHeight / DESIGN_H));
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  if (phase === 'notice') {
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
          overflow: 'hidden',
          zIndex: 100,
          cursor: 'pointer',
        }}
        onClick={() => {
          // 확인 클릭 = user gesture로 audio unlock + BGM 재생 트리거
          playChapterMusic('START');
          setPhase('start');
        }}
      >
        <div
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              fontFamily: '"Unifont", monospace',
              color: '#f3eedd',
              textAlign: 'center',
              width: 1100,
              padding: '0 32px',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.8rem',
              fontSize: '0.95rem',
              letterSpacing: 3,
              lineHeight: 1.6,
            }}
          >
            <div>{line1}</div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <KeyboardHints />
            </div>
            <div>{line3}</div>
          </div>
          <p
            style={{
              marginTop: '3rem',
              fontFamily: '"Unifont", monospace',
              color: '#f3eedd',
              fontSize: '0.9rem',
              letterSpacing: 6,
              opacity: 0.7,
              animation: 'blink 1s step-end infinite',
            }}
          >
            [ 확인 ]
          </p>
        </div>
      </div>
    );
  }

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
        overflow: 'hidden',
        zIndex: 100,
        cursor: 'pointer',
      }}
      onClick={() => goToChapter('INTRO')}
    >
      <div
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'center center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <h1
          style={{
            fontFamily: '"Hammer Keys", monospace',
            color: '#fff',
            fontSize: '4rem',
            letterSpacing: '0.1em',
            marginBottom: '2rem',
            opacity: fontReady ? 1 : 0,
            transition: 'opacity 0.4s ease',
          }}
        >
          Map Hack
        </h1>
        <p
          style={{
            fontFamily: '"Unifont", monospace',
            color: '#fff',
            fontSize: '1.2rem',
            letterSpacing: 4,
          }}
        >
          {startLabel}
        </p>
      </div>
    </div>
  );
};
