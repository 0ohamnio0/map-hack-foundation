import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useGameStore } from '@/store/useGameStore';
import { useSoundManager } from '@/hooks/useSoundManager';

const BASE = import.meta.env.BASE_URL;
const SOURCES = [
  `${BASE}assets/ch4/1.png`,  // A: 텍스트 사과문
  `${BASE}assets/ch4/2.png`,  // B: 텍스트 + 실사 합성
  `${BASE}assets/ch4/3.png`,  // C: 실사 이미지
];
const CYCLE_INTERVAL = 4000;
const MAX_UPDATE_SIZE = 0.3;
const DURATION = 20000;

export const Ch4Screen: React.FC = () => {
  const goToChapter = useGameStore(s => s.goToChapter);
  const { play, stop } = useSoundManager();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const images = useRef<HTMLImageElement[]>([]);
  const currentSource = useRef(0);
  const startTime = useRef(0);
  const frameId = useRef(0);
  const [phase, setPhase] = useState<'freeze' | 'ending'>('freeze');
  const [endingVisible, setEndingVisible] = useState(false);

  // Preload images
  useEffect(() => {
    images.current = SOURCES.map(src => {
      const img = new Image();
      img.src = src;
      return img;
    });
  }, []);

  // Sound
  useEffect(() => {
    play('phone_ring');
    return () => { stop('phone_ring'); };
  }, [play, stop]);

  const handleFreezeComplete = useCallback(() => {
    stop('phone_ring');
    setPhase('ending');
  }, [stop]);

  // Random Freeze animation
  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const elapsed = Date.now() - startTime.current;
    const cycleIndex = Math.floor(elapsed / CYCLE_INTERVAL) % SOURCES.length;
    currentSource.current = cycleIndex;

    const img = images.current[currentSource.current];
    if (!img.complete) {
      frameId.current = requestAnimationFrame(animate);
      return;
    }

    const progress = Math.min(elapsed / DURATION, 1);
    const updateSize = MAX_UPDATE_SIZE + progress * 0.2;

    const w = canvas.width;
    const h = canvas.height;
    const rectW = Math.random() * updateSize * w;
    const rectH = Math.random() * updateSize * h;
    let rectX = Math.random() * w;
    let rectY = Math.random() * h;
    if (rectX + rectW > w) rectX = w - rectW;
    if (rectY + rectH > h) rectY = h - rectH;

    ctx.drawImage(
      img,
      (rectX / w) * img.naturalWidth,
      (rectY / h) * img.naturalHeight,
      (rectW / w) * img.naturalWidth,
      (rectH / h) * img.naturalHeight,
      rectX, rectY, rectW, rectH,
    );

    if (elapsed > DURATION) {
      cancelAnimationFrame(frameId.current);
      handleFreezeComplete();
      return;
    }

    frameId.current = requestAnimationFrame(animate);
  }, [handleFreezeComplete]);

  // Start animation
  useEffect(() => {
    if (phase !== 'freeze') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const img = images.current[0];
    const tryDraw = () => {
      if (img.complete) {
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        startTime.current = Date.now();
        frameId.current = requestAnimationFrame(animate);
      } else {
        img.onload = tryDraw;
      }
    };
    tryDraw();

    return () => cancelAnimationFrame(frameId.current);
  }, [phase, animate]);

  // Ending phase
  useEffect(() => {
    if (phase !== 'ending') return;
    const t1 = setTimeout(() => setEndingVisible(true), 500);
    const t2 = setTimeout(() => {
      play('screen_on');
      goToChapter('CH5');
    }, 5000);
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
      zIndex: 100,
    }}>
      {phase === 'freeze' && (
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
          }}
        />
      )}

      {phase === 'ending' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: endingVisible ? 1 : 0,
          transition: 'opacity 2s ease',
        }}>
          <p style={{
            fontFamily: 'monospace',
            fontStyle: 'italic',
            color: '#fff',
            fontSize: 18,
            textAlign: 'center',
            padding: '0 2rem',
          }}>
            기억으로 연속되는 자아로부터의 일시적인 망명.
          </p>
        </div>
      )}
    </div>
  );
};
