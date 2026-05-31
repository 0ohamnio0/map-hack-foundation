import React, { useEffect, useRef } from 'react';
import { useGameStore, type Chapter } from '@/store/useGameStore';
import { StartScreen } from '@/components/game/StartScreen';
import { FadeOverlay } from '@/components/game/FadeOverlay';
import { EffectOverlay } from '@/components/game/EffectOverlay';
import { IntroScene } from '@/scenes/IntroScene';
import { Ch1Scene } from '@/scenes/Ch1Scene';
import { Ch2Scene } from '@/scenes/Ch2Scene';
import { Ch3Scene } from '@/scenes/Ch3Scene';
import { Ch4Screen } from '@/screens/Ch4Screen';
import { Ch5Screen } from '@/screens/Ch5Screen';
import { playChapterMusic } from '@/lib/chapterMusic';
import { SketchDebugPanel } from '@/components/effects/SketchDebugPanel';

const SKETCH_DEBUG = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('sketch') === '1';

const CHAPTERS: Chapter[] = ['START', 'INTRO', 'CH1', 'CH2', 'CH3', 'CH4', 'CH5'];

const ChapterHUD: React.FC<{ chapter: string }> = ({ chapter }) => {
  const goToChapter = useGameStore(s => s.goToChapter);

  return (
    <div style={{
      position: 'fixed',
      top: 16,
      left: 16,
      fontFamily: 'monospace',
      fontSize: 12,
      color: 'rgba(255,255,255,0.5)',
      zIndex: 500,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    }}>
      <span style={{ pointerEvents: 'none', marginBottom: 4 }}>{chapter}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {CHAPTERS.map(ch => (
          <button
            key={ch}
            onClick={() => goToChapter(ch)}
            style={{
              padding: '2px 6px',
              fontSize: 10,
              fontFamily: 'monospace',
              background: ch === chapter ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.2)',
              cursor: 'pointer',
              borderRadius: 2,
            }}
          >
            {ch}
          </button>
        ))}
      </div>
    </div>
  );
};

export const Game: React.FC = () => {
  const chapter = useGameStore(s => s.chapter);
  const resetChapterState = useGameStore(s => s.resetChapterState);
  const prevChapterRef = useRef<Chapter>(chapter);

  useEffect(() => {
    // START는 user gesture 전이라 BGM 트리거를 StartScreen 1차 클릭에 위임
    // INTRO는 영상 canplay 시점에 IntroScene이 BGM·영상 동시 트리거 (sync)
    if (chapter === 'START' || chapter === 'INTRO') return;
    playChapterMusic(chapter);
  }, [chapter]);

  // 챕터 exit 시 떠나는 챕터의 store 상태 초기화 (씬 점프 버튼·재방문 대응)
  useEffect(() => {
    const prev = prevChapterRef.current;
    if (prev !== chapter) {
      resetChapterState(prev);
      prevChapterRef.current = chapter;
    }
  }, [chapter, resetChapterState]);

  // Space는 점프 전용 — 마지막에 클릭한 버튼이 focus를 유지한 채 Space로 재트리거되는 것 차단
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'Space') return;
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement) {
        active.blur();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  // 디버그: ?sketch=1 → CH3로 바로 진입 (스케치 효과 상시 full은 Ch3Effects가 처리)
  useEffect(() => {
    if (SKETCH_DEBUG) useGameStore.setState({ chapter: 'CH3' });
  }, []);

  const renderScene = () => {
    switch (chapter) {
      case 'START': return <StartScreen />;
      case 'INTRO': return <IntroScene />;
      case 'CH1': return <Ch1Scene />;
      case 'CH2': return <Ch2Scene />;
      case 'CH3': return <Ch3Scene />;
      case 'CH4': return <Ch4Screen />;
      case 'CH5':
        // HUD-direct entry simulates the post-ink-bleed state: black backdrop
        // standing in for the ink-bleed residue, CH.5 rendered in overlayMode.
        return (
          <>
            <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 19 }} />
            <Ch5Screen overlayMode />
          </>
        );
      default: return <StartScreen />;
    }
  };

  return (
    <>
      {renderScene()}
      <ChapterHUD chapter={chapter} />
      <FadeOverlay />
      <EffectOverlay />
      {SKETCH_DEBUG && <SketchDebugPanel />}
    </>
  );
};
