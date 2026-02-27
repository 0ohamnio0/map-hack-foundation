import React from 'react';
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

  const renderScene = () => {
    switch (chapter) {
      case 'START': return <StartScreen />;
      case 'INTRO': return <IntroScene />;
      case 'CH1': return <Ch1Scene />;
      case 'CH2': return <Ch2Scene />;
      case 'CH3': return <Ch3Scene />;
      case 'CH4': return <Ch4Screen />;
      case 'CH5': return <Ch5Screen />;
      default: return <StartScreen />;
    }
  };

  return (
    <>
      {renderScene()}
      <ChapterHUD chapter={chapter} />
      <FadeOverlay />
      <EffectOverlay />
    </>
  );
};
