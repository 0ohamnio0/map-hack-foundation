import { useEffect, useState } from 'react';
import { Howler } from 'howler';

let globalMuted = false;
const listeners = new Set<(v: boolean) => void>();

function setGlobalMuted(v: boolean) {
  globalMuted = v;
  Howler.mute(v);
  listeners.forEach(fn => fn(v));
}

export function useMute(): [boolean, () => void] {
  const [muted, setMuted] = useState(globalMuted);

  useEffect(() => {
    const handler = (v: boolean) => setMuted(v);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);

  return [muted, () => setGlobalMuted(!globalMuted)];
}
