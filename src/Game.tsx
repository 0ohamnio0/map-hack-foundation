import React, { useEffect, useRef, useState } from 'react';
import { useGameStore, type Chapter } from '@/store/useGameStore';
import { StartScreen } from '@/components/game/StartScreen';
import { MobileBlock } from '@/components/game/MobileBlock';
import { FadeOverlay } from '@/components/game/FadeOverlay';
import { EffectOverlay } from '@/components/game/EffectOverlay';
import { IntroMedia } from '@/components/game/IntroMedia';
import { Ch1Scene } from '@/scenes/Ch1Scene';
import { Ch2Scene } from '@/scenes/Ch2Scene';
import { Ch3Scene } from '@/scenes/Ch3Scene';
import { Ch4Screen } from '@/screens/Ch4Screen';
import { Ch5Screen } from '@/screens/Ch5Screen';
import { playChapterMusic } from '@/lib/chapterMusic';
import { SketchDebugPanel } from '@/components/effects/SketchDebugPanel';
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';

const SKETCH_DEBUG = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('sketch') === '1';

const DEBUG_HUD = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('debug') === '1';

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
  const gameCompleted = useGameStore(s => s.gameCompleted);
  const introAudioActive = useGameStore(s => s.introAudioActive);
  const prevChapterRef = useRef<Chapter>(chapter);
  const isMobileDevice = useIsMobileDevice();
  const [webglLost, setWebglLost] = useState(false);

  // WebGL 컨텍스트 손실 감지 — R3F 씬(CH.1~3)이 검은 화면으로 영구 프리즈되는 대신 안내 표시.
  // webglcontextlost는 버블 안 하지만 캡처 단계(3번째 인자 true)로 모든 Canvas를 전역 포착.
  useEffect(() => {
    const onLost = (e: Event) => { e.preventDefault(); setWebglLost(true); };
    const onRestored = () => setWebglLost(false);
    document.addEventListener('webglcontextlost', onLost, true);
    document.addEventListener('webglcontextrestored', onRestored, true);
    return () => {
      document.removeEventListener('webglcontextlost', onLost, true);
      document.removeEventListener('webglcontextrestored', onRestored, true);
    };
  }, []);

  useEffect(() => {
    // START는 user gesture 전이라 BGM 트리거를 StartScreen 1차 클릭에 위임.
    // INTRO는 IntroMedia가 영상 자체 baked 오디오로 음악을 담당(별도 BGM 없음).
    if (chapter === 'START' || chapter === 'INTRO') return;
    // CH.1은 인트로 영상 오디오(ch1.mp3 baked)가 그대로 이어지는 동안 ch1.mp3 중복 재생 금지.
    if (chapter === 'CH1' && useGameStore.getState().introAudioActive) return;
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

  // 모바일/태블릿은 게임(R3F 캔버스)을 마운트하기 전에 차단.
  if (isMobileDevice) return <MobileBlock />;

  const renderScene = () => {
    switch (chapter) {
      case 'START': return <StartScreen />;
      // INTRO 비주얼은 영속 레이어의 IntroMedia가 담당 (씬 스위치 바깥 — CH.1 전환에도 오디오 유지)
      case 'INTRO': return null;
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

  // 인트로 영상은 INTRO 동안, 그리고 CH.1에서 오디오가 캐리되는 동안 영속 마운트.
  // 씬 스위치 바깥에 두어 INTRO→CH.1 전환에도 언마운트되지 않고 오디오가 끊김 없이 이어진다.
  const showIntroMedia = chapter === 'INTRO' || (chapter === 'CH1' && introAudioActive);

  return (
    <>
      {renderScene()}
      {showIntroMedia && <IntroMedia />}
      {(DEBUG_HUD || gameCompleted) && <ChapterHUD chapter={chapter} />}
      <FadeOverlay />
      <EffectOverlay />
      {SKETCH_DEBUG && <SketchDebugPanel />}
      {webglLost && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: '#000',
          color: '#f3eedd', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 18,
          fontFamily: '"Unifont", monospace', textAlign: 'center', padding: 24,
        }}>
          <div style={{ fontSize: 15, letterSpacing: 2, lineHeight: 1.9 }}>
            그래픽(WebGL) 컨텍스트가 손실되었습니다.<br />
            브라우저 하드웨어 가속을 켠 뒤 새로고침해 주세요.<br />
            <span style={{ opacity: 0.6, fontSize: 12 }}>
              Chrome 설정 → 시스템 → "사용 가능한 경우 하드웨어 가속 사용" ON → 재시작
            </span>
          </div>
          <button
            onClick={() => window.location.reload()}
            style={{
              fontFamily: '"Unifont", monospace', fontSize: 13, letterSpacing: 2,
              color: '#f3eedd', background: 'transparent',
              border: '1px solid rgba(243,238,221,0.5)', borderRadius: 2,
              padding: '8px 20px', cursor: 'pointer',
            }}
          >
            새로고침 / Reload
          </button>
        </div>
      )}
    </>
  );
};
