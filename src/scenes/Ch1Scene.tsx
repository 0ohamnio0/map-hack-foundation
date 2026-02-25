import React, { useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { PlayerController } from '@/components/game/PlayerController';
import { useGameStore } from '@/store/useGameStore';
import { useSoundManager } from '@/hooks/useSoundManager';

const Room: React.FC = () => {
  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[4, 4]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 3, 0]}>
        <planeGeometry args={[4, 4]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      {/* Walls */}
      {/* Left */}
      <mesh position={[-2, 1.5, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[4, 3]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Right */}
      <mesh position={[2, 1.5, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[4, 3]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Back */}
      <mesh position={[0, 1.5, 2]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[4, 3]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* North wall with door hole — two panels */}
      <mesh position={[-1.25, 1.5, -2]}>
        <planeGeometry args={[1.5, 3]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[1.25, 1.5, -2]}>
        <planeGeometry args={[1.5, 3]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      <mesh position={[0, 2.5, -2]}>
        <planeGeometry args={[1, 0.5]} />
        <meshStandardMaterial color="#1a1a1a" />
      </mesh>
      {/* Door */}
      <mesh position={[0, 1, -1.99]}>
        <boxGeometry args={[1, 2, 0.05]} />
        <meshStandardMaterial color="#333" />
      </mesh>
    </group>
  );
};

const Ch1Inner: React.FC = () => {
  const goToChapter = useGameStore(s => s.goToChapter);
  const triggerEvent = useGameStore(s => s.triggerEvent);
  const setActiveEffect = useGameStore(s => s.setActiveEffect);
  const { play } = useSoundManager();
  const hallTriggered = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      if (!hallTriggered.current) {
        hallTriggered.current = true;
        if (triggerEvent('ch1_hallucination')) {
          setActiveEffect('glitch', 2000);
        }
      }
    }, 3000);
    return () => clearTimeout(t);
  }, []);

  const handlePosition = (x: number, z: number) => {
    // Door trigger: near z = -2
    if (z < -1.5) {
      if (triggerEvent('ch1_door')) {
        play('door_creak');
        setActiveEffect('glitch', 300);
        setTimeout(() => goToChapter('CH2'), 400);
      }
    }
  };

  return (
    <>
      <ambientLight intensity={0.05} color="#ff2200" />
      <pointLight position={[0, 2.5, 0]} intensity={0.3} color="#ff0000" />
      <Room />
      <PlayerController mode="1st" bounds={{ minX: -1.5, maxX: 1.5, minZ: -1.5, maxZ: 1.5 }} onPosition={handlePosition} />
    </>
  );
};

export const Ch1Scene: React.FC = () => {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <Canvas camera={{ fov: 75, position: [0, 1.6, 0] }} style={{ background: '#0a0a0a' }}>
        <Ch1Inner />
      </Canvas>
    </div>
  );
};
