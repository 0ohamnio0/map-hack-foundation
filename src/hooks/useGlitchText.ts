import { useEffect, useRef, useState } from 'react';

const SCRAMBLE_POOL = '░▒▓█▌▐▀▄ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789가나다라마바사아자차카타파하';

function pick(): string {
  return SCRAMBLE_POOL[Math.floor(Math.random() * SCRAMBLE_POOL.length)];
}

interface Options {
  interval?: number;   // 다음 텍스트로 넘어가는 주기 (ms)
  scrambleMs?: number; // 스크램블 → 수렴 지속 시간
  delayMs?: number;    // 시작 지연 (라인별 phase 분리)
}

/**
 * shuffle-text 류 글리치 스크램블로 여러 텍스트를 루프 토글.
 * 각 자리는 progress가 자기 threshold를 넘으면 정답으로 고정 → 점진 수렴.
 */
export function useGlitchText(texts: string[], opts: Options = {}): string {
  const interval = opts.interval ?? 3000;
  const scrambleMs = opts.scrambleMs ?? 700;
  const delayMs = opts.delayMs ?? 0;
  const [idx, setIdx] = useState(0);
  const [display, setDisplay] = useState(texts[0] ?? '');
  const thresholdsRef = useRef<number[]>([]);

  useEffect(() => {
    if (texts.length < 2) return;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    const startId = setTimeout(() => {
      intervalId = setInterval(() => setIdx(i => (i + 1) % texts.length), interval);
    }, delayMs);
    return () => {
      clearTimeout(startId);
      if (intervalId) clearInterval(intervalId);
    };
  }, [texts, interval, delayMs]);

  useEffect(() => {
    const target = texts[idx];
    if (!target) return;
    // 자리별 random threshold — 좌→우 점진 수렴 + 약간의 randomness
    thresholdsRef.current = Array.from(target).map((_, i) => {
      const base = (i / Math.max(target.length, 1)) * 0.5;
      return base + Math.random() * 0.5;
    });

    const startTs = performance.now();
    let raf = 0;

    const tick = (now: number) => {
      const progress = Math.min((now - startTs) / scrambleMs, 1);
      const out = Array.from(target).map((ch, i) => {
        if (ch === ' ') return ' ';
        return progress > (thresholdsRef.current[i] ?? 1) ? ch : pick();
      }).join('');
      setDisplay(out);
      if (progress < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setDisplay(target);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [idx, texts, scrambleMs]);

  return display;
}
