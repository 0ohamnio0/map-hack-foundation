import React, { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { useGameStore, type Chapter } from '@/store/useGameStore';
import { r3f } from '@/lib/r3fTunnel';
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
import { playChapterMusic, stopChapterMusic } from '@/lib/chapterMusic';
import { SketchDebugPanel } from '@/components/effects/SketchDebugPanel';
import { useIsMobileDevice } from '@/hooks/useIsMobileDevice';
import { useWebGLAvailable } from '@/hooks/useWebGLAvailable';
import { WebGLBlock } from '@/components/game/WebGLBlock';

const SKETCH_DEBUG = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('sketch') === '1';

const DEBUG_HUD = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('debug') === '1';

const CHAPTERS: Chapter[] = ['START', 'INTRO', 'CH1', 'CH2', 'CH3', 'CH4', 'CH5'];

// 챕터 이동 버튼에 표기할 한글 이름 (INTRO·CH1 둘 다 '침대')
const CHAPTER_LABELS: Partial<Record<Chapter, string>> = {
  START: '버튼', INTRO: '···', CH1: '침대에서', CH2: '골목', CH3: '마트에서', CH4: '병원으로', CH5: '블로그',
};

// 무거운 영상이 "필요한 순간 마운트→로드"라 늦게 뜨던 문제 —
// 현재 챕터 동안 다음에 쓸 영상을 hidden video(preload=auto)로 미리 받아 캐시에 올려둔다.
const VIDEO_BASE = `${import.meta.env.BASE_URL ?? '/'}assets/video/`;
const PRELOAD_NEXT_VIDEOS: Partial<Record<Chapter, string[]>> = {
  START: ['intro_final.mp4'],            // → INTRO 인트로 영상 (68M)
  INTRO: ['airport.mp4', 'letter.mp4'],  // → CH.2 공항 환각 + 편지 영상
  CH1: ['airport.mp4', 'letter.mp4'],    // CH.1 동안에도 계속 버퍼링
};

const VideoPreloader: React.FC<{ chapter: Chapter }> = ({ chapter }) => {
  const srcs = PRELOAD_NEXT_VIDEOS[chapter] ?? [];
  if (srcs.length === 0) return null;
  return (
    <div aria-hidden style={{ position: 'fixed', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {srcs.map(s => (
        <video key={s} src={`${VIDEO_BASE}${s}`} preload="auto" muted playsInline />
      ))}
    </div>
  );
};

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
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {CHAPTERS.map(ch => (
          <button
            key={ch}
            onClick={() => goToChapter(ch)}
            style={{
              padding: '2px 6px',
              fontSize: 10,
              fontFamily: '"Unifont", monospace',
              background: ch === chapter ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.2)',
              cursor: 'pointer',
              borderRadius: 2,
            }}
          >
            {CHAPTER_LABELS[ch] ?? ch}
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
  const webglAvailable = useWebGLAvailable();
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
    // 완주(크레딧) 후 챕터 버튼으로 2회차 플레이 — BGM 음악은 뮤트(SFX는 그대로). 의도된 동작.
    // getState()로 즉시 읽어 deps에 gameCompleted를 넣지 않음 → 1회차 크레딧 음악이 끊기지 않음.
    if (useGameStore.getState().gameCompleted) { stopChapterMusic(); return; }
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
  // WebGL 생성 불가 환경(GPU 블록리스트·하드웨어가속 off 등)은 Canvas 마운트 전에 막고
  // 왜 검은 화면인지 안내. 정상 환경에선 절대 안 보임(사전 감지 통과).
  if (!webglAvailable) return <WebGLBlock reason="unavailable" />;

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

  // 단일 영속 WebGL 컨텍스트 — CH.1~3 동안 마운트 유지. 각 씬은 3D 내용을 r3f 터널로
  // 이 Canvas 안에 넣는다(<r3f.Out/>). 챕터 전환 시 컨텍스트 재생성이 없어 약한/제한된 GPU에서
  // "컨텍스트 누적→생성 실패" 검은 화면을 줄인다. 씬 HUD는 Canvas 바깥(더 높은 zIndex)에 그대로.
  const show3DCanvas = chapter === 'CH1' || chapter === 'CH2' || chapter === 'CH3';

  return (
    <>
      {show3DCanvas && (
        <Canvas
          style={{ position: 'fixed', inset: 0, zIndex: 0, background: '#000' }}
          shadows
          dpr={[1, 1.5]}
          gl={{ failIfMajorPerformanceCaveat: false, powerPreference: 'high-performance' }}
          camera={{ fov: 75, position: [0, 1.8, 0], near: 0.1, far: 100 }}
        >
          <r3f.Out />
        </Canvas>
      )}
      {renderScene()}
      <VideoPreloader chapter={chapter} />
      {showIntroMedia && <IntroMedia />}
      {(DEBUG_HUD || gameCompleted) && <ChapterHUD chapter={chapter} />}
      <FadeOverlay />
      <EffectOverlay />
      {SKETCH_DEBUG && <SketchDebugPanel />}
      {webglLost && <WebGLBlock reason="lost" />}
    </>
  );
};
