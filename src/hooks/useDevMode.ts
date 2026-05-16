import { useEffect, useState } from 'react';

/** Toggle dev mode with P key. State persists within the session. */
let globalDevMode = false;
const listeners = new Set<(v: boolean) => void>();

function setGlobal(v: boolean) {
  globalDevMode = v;
  listeners.forEach(fn => fn(v));
}

// P 키 리스너는 모듈 레벨에서 단 한 번만 등록 — 훅 인스턴스마다 등록하면
// 동시 마운트(예: Scene + NoteReader) 시 한 번의 P가 N번 토글되어 상쇄됨.
// HMR 중복 바인딩은 window 플래그로 가드.
declare global { interface Window { __mhDevKeyBound?: boolean } }
if (typeof window !== 'undefined' && !window.__mhDevKeyBound) {
  window.__mhDevKeyBound = true;
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'KeyP') {
      e.preventDefault();
      setGlobal(!globalDevMode);
    }
  });
}

export function useDevMode() {
  const [devMode, setDevMode] = useState(globalDevMode);

  useEffect(() => {
    const handler = (v: boolean) => setDevMode(v);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  return devMode;
}
