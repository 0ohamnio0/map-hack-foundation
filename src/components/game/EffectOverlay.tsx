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
      // whiteflash(흰약)는 여기서 풀스크린 흰색을 깔지 않는다 — Ch3Scene의 자체 whiteFlash(0.65s 반짝)
      // + ChapterEffects의 SketchEffect(빈 맵 위 라인 드로잉)가 연출을 담당. 여기서 opacity:1 흰색을
      // 깔면 activeEffect가 종료될 때까지 빈 네모·스케치를 영구히 덮어 "화이트아웃에서 안 돌아옴"이 된다.
      case 'glitch':
        return { ...base, backgroundColor: '#fff', opacity: 1, animation: 'glitchFlash 0.06s infinite' };
      default:
        return { ...base, opacity: 0 };
    }
  };

  return <div style={getStyle()} />;
};
