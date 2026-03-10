import React from 'react';
import { useGameStore } from '@/store/useGameStore';

export const FadeOverlay: React.FC = () => {
  const isTransitioning = useGameStore(s => s.isTransitioning);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000',
        opacity: isTransitioning ? 1 : 0,
        transition: 'opacity 0.4s ease-in-out',
        pointerEvents: isTransitioning ? 'all' : 'none',
        zIndex: 9999,
      }}

    />
  );
};
