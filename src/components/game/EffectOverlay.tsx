import React from 'react';
import { useGameStore } from '@/store/useGameStore';

export const EffectOverlay: React.FC = () => {
  const activeEffect = useGameStore(s => s.activeEffect);

  const getStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      position: 'fixed',
      inset: 0,
      pointerEvents: 'none',
      zIndex: 9990,
      transition: 'all 0.3s ease',
    };

    switch (activeEffect) {
      case 'desaturate':
        return { ...base, backdropFilter: 'grayscale(50%)' };
      case 'blur':
        return { ...base, backdropFilter: 'blur(2px)' };
      case 'darken':
        return { ...base, backgroundColor: 'rgba(0,0,0,0.4)' };
      case 'whiteflash':
        return { ...base, backgroundColor: '#fff', opacity: 1 };
      case 'glitch':
        return { ...base, backgroundColor: '#fff', opacity: 1, animation: 'glitchFlash 0.06s infinite' };
      default:
        return { ...base, opacity: 0 };
    }
  };

  return <div style={getStyle()} />;
};
