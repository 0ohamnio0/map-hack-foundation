import React from 'react';
import { useGameStore } from '@/store/useGameStore';
import { StartScreen } from '@/components/game/StartScreen';
import { FadeOverlay } from '@/components/game/FadeOverlay';
import { EffectOverlay } from '@/components/game/EffectOverlay';
import { IntroScene } from '@/scenes/IntroScene';
import { Ch1Scene } from '@/scenes/Ch1Scene';
import { Ch2Scene } from '@/scenes/Ch2Scene';
import { Ch3Scene } from '@/scenes/Ch3Scene';
import { Ch4Screen } from '@/screens/Ch4Screen';
import { Ch5Screen } from '@/screens/Ch5Screen';

const ChapterHUD: React.FC<{ chapter: string }> = ({ chapter }) => {
  if (chapter === 'START' || chapter === 'INTRO' || chapter === 'END') return null;
  return (
    <div style={{
      position: 'fixed',
      top: 16,
      right: 16,
      fontFamily: 'monospace',
      fontSize: 12,
      color: 'rgba(255,255,255,0.3)',
      zIndex: 500,
      pointerEvents: 'none',
    }}>
      {chapter}
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
