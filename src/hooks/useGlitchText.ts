import { useEffect, useRef, useState } from 'react';

const SCRAMBLE_POOL = '░▒▓█▌▐▀▄ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789가나다라마바사아자차카타파하';

function pick(): string {
  return SCRAMBLE_POOL[Math.floor(Math.random() * SCRAMBLE_POOL.length)];
}

interface Options {
  interval?: number;   // 다음 텍스트로 넘어가는 주기 (ms)
  scrambleMs?: number; // 트랜지션 총 시간 (phase1 + phase2)
  delayMs?: number;    // 첫 등장 지연
}

/**
 * 한·영 등 다국어 텍스트 루프 토글 글리치.
 * - 첫 등장: 노이즈 → texts[0] 타이핑-인
 * - 그 다음 interval마다: 현재 → 노이즈(phase1) → 다음(phase2) 두-phase 트랜지션
 *   (백지에서 다시 타이핑되는 게 아니라, 글자가 깨졌다가 새 글자로 굳음)
 */
export function useGlitchText(texts: string[], opts: Options = {}): string {
  const interval = opts.interval ?? 5500;
  const scrambleMs = opts.scrambleMs ?? 800;
  const delayMs = opts.delayMs ?? 0;
  const [display, setDisplay] = useState(texts[0] ?? '');
  const stateRef = useRef<{
    idx: number;
    raf: number;
    timer: ReturnType<typeof setTimeout> | null;
  }>({ idx: 0, raf: 0, timer: null });

  useEffect(() => {
    let cancelled = false;
    stateRef.current.idx = 0;

    const cleanup = () => {
      if (stateRef.current.timer) clearTimeout(stateRef.current.timer);
      cancelAnimationFrame(stateRef.current.raf);
    };

    if (texts.length === 0) {
      setDisplay('');
      return cleanup;
    }

    const passthrough = (ch: string) => ch === ' ' || ch === '\n' || ch === '\t';

    // ── 첫 등장: 노이즈 → texts[0] 타이핑-인 ──
    const initialTarget = texts[0];
    const initialStart = performance.now() + delayMs;
    const initialThresh = Array.from(initialTarget).map((_, i) =>
      (i / Math.max(initialTarget.length, 1)) * 0.5 + Math.random() * 0.5
    );

    const scheduleNext = () => {
      if (texts.length < 2) return;
      stateRef.current.timer = setTimeout(() => {
        if (cancelled) return;
        const fromIdx = stateRef.current.idx;
        const toIdx = (fromIdx + 1) % texts.length;
        runTransition(fromIdx, toIdx);
      }, interval);
    };

    const runTransition = (fromIdx: number, toIdx: number) => {
      const from = texts[fromIdx];
      const to = texts[toIdx];
      const halfMs = scrambleMs / 2;
      const startTs = performance.now();
      // phase1: 우측부터 깨짐 (threshold가 좌→우로 큼 → 작은 값일수록 빨리 random됨)
      const phase1Thresh = Array.from(from).map((_, i) =>
        (1 - i / Math.max(from.length, 1)) * 0.6 + Math.random() * 0.4
      );
      // phase2: 좌측부터 굳음 (threshold가 좌→우로 큼)
      const phase2Thresh = Array.from(to).map((_, i) =>
        (i / Math.max(to.length, 1)) * 0.6 + Math.random() * 0.4
      );

      const tick = (now: number) => {
        if (cancelled) return;
        const elapsed = now - startTs;
        if (elapsed < halfMs) {
          const p = elapsed / halfMs;
          const out = Array.from(from).map((ch, i) =>
            passthrough(ch) ? ch : (p > phase1Thresh[i] ? pick() : ch)
          ).join('');
          setDisplay(out);
          stateRef.current.raf = requestAnimationFrame(tick);
        } else if (elapsed < scrambleMs) {
          const p = (elapsed - halfMs) / halfMs;
          const out = Array.from(to).map((ch, i) =>
            passthrough(ch) ? ch : (p > phase2Thresh[i] ? ch : pick())
          ).join('');
          setDisplay(out);
          stateRef.current.raf = requestAnimationFrame(tick);
        } else {
          setDisplay(to);
          stateRef.current.idx = toIdx;
          scheduleNext();
        }
      };
      stateRef.current.raf = requestAnimationFrame(tick);
    };

    const initialTick = (now: number) => {
      if (cancelled) return;
      const elapsed = now - initialStart;
      if (elapsed < 0) {
        stateRef.current.raf = requestAnimationFrame(initialTick);
        return;
      }
      const p = Math.min(elapsed / scrambleMs, 1);
      const out = Array.from(initialTarget).map((ch, i) =>
        passthrough(ch) ? ch : (p > initialThresh[i] ? ch : pick())
      ).join('');
      setDisplay(out);
      if (p < 1) {
        stateRef.current.raf = requestAnimationFrame(initialTick);
      } else {
        setDisplay(initialTarget);
        scheduleNext();
      }
    };

    stateRef.current.raf = requestAnimationFrame(initialTick);
    return cleanup;
  }, [texts, interval, scrambleMs, delayMs]);

  return display;
}
