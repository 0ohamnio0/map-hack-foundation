import { useRef, useCallback } from 'react';

export function useFixedFramerate(fps: number = 24) {
  const accumulated = useRef(0);
  const interval = 1 / fps;

  const shouldUpdate = useCallback((delta: number): boolean => {
    accumulated.current += delta;
    if (accumulated.current >= interval) {
      accumulated.current -= interval;
      return true;
    }
    return false;
  }, [interval]);

  return { shouldUpdate, interval };
}
