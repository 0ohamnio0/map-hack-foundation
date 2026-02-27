import { useEffect, useState } from 'react';

/** Toggle dev mode with backtick (`) key. State persists within the session. */
let globalDevMode = false;
const listeners = new Set<(v: boolean) => void>();

function setGlobal(v: boolean) {
  globalDevMode = v;
  listeners.forEach(fn => fn(v));
}

export function useDevMode() {
  const [devMode, setDevMode] = useState(globalDevMode);

  useEffect(() => {
    const handler = (v: boolean) => setDevMode(v);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyQ') {
        e.preventDefault();
        setGlobal(!globalDevMode);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return devMode;
}
