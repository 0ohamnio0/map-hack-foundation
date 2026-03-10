import { useRef, useCallback } from 'react';

export function useFixedFramerate(fps: number = 24) {
  const accumulated = useRef(0);
  const interval = 1 / fps;

  const shouldUpdate = useCallback((delta: number): boolean => {
    // Clamp delta to 200ms to prevent post-tab-switch position jumps
    accumulated.current += Math.min(delta, 0.2);
    if (accumulated.current >= interval) {
      // Drain accumulator fully (modulo) instead of one frame at a time
      accumulated.current = accumulated.current % interval;
      return true;
    }
    return false;
  }, [interval]);

  return { shouldUpdate, interval };
}
