import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
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
      {/* North wall panels */}
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

/** Automated camera cutscene — slowly pans around the room then settles facing the door */
const CutsceneCamera: React.FC<{ phase: number }> = ({ phase }) => {
  const elapsed = useRef(0);

  useFrame(({ camera }, delta) => {
    elapsed.current += delta;
    const t = elapsed.current;

    if (phase === 0) {
      // Phase 0: slow look around (0-3s)
      camera.position.set(0, 1.6, 0);
      const angle = Math.sin(t * 0.4) * 0.6;
      camera.lookAt(Math.sin(angle) * 3, 1.6, Math.cos(angle) * -3);
    } else if (phase === 1) {
      // Phase 1: glitch happened, camera shakes slightly then faces door
      camera.position.set(0, 1.6, 0);
      const shake = Math.max(0, 1 - (t - 3) * 0.5) * 0.05;
      camera.lookAt(
        Math.random() * shake,
        1.6 + Math.random() * shake,
        -2,
      );
    } else {
      // Phase 2: waiting for door input — steady on door
      camera.position.set(0, 1.6, 0);
      camera.lookAt(0, 1.2, -2);
    }
  });

  return null;
};

const Ch1Inner: React.FC = () => {
  const goToChapter = useGameStore(s => s.goToChapter);
  const triggerEvent = useGameStore(s => s.triggerEvent);
  const setActiveEffect = useGameStore(s => s.setActiveEffect);
  const { play } = useSoundManager();
  const [phase, setPhase] = useState(0);
  const doorOpened = useRef(false);

  // Auto cutscene timeline
  useEffect(() => {
    // 3s: hallucination glitch
    const t1 = setTimeout(() => {
      if (triggerEvent('ch1_hallucination')) {
        setActiveEffect('glitch', 2000);
      }
      setPhase(1);
    }, 3000);

    // 5.5s: settle on door, ready for input
    const t2 = setTimeout(() => {
      setPhase(2);
    }, 5500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [triggerEvent, setActiveEffect]);

  // Door interaction — any key press during phase 2
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase < 2 || doorOpened.current) return;
      doorOpened.current = true;
      play('door_creak');
      setActiveEffect('glitch', 300);
      setTimeout(() => goToChapter('CH2'), 400);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, goToChapter, setActiveEffect, play]);

  return (
    <>
      <ambientLight intensity={0.2} color="#ff2200" />
      <pointLight position={[0, 2.5, 0]} intensity={1.5} color="#ff0000" />
      <Room />
      <CutsceneCamera phase={phase} />
    </>
  );
};

/** Door prompt overlay */
const DoorPrompt: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 6000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      bottom: '20%',
      left: 0,
      right: 0,
      textAlign: 'center',
      fontFamily: 'monospace',
      fontSize: 14,
      color: 'rgba(255,255,255,0.4)',
      zIndex: 100,
      animation: 'blink 1.5s step-end infinite',
    }}>
      아무 키나 누르세요
    </div>
  );
};

export const Ch1Scene: React.FC = () => {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <Canvas camera={{ fov: 75, position: [0, 1.6, 0] }} style={{ background: '#0a0a0a' }}>
        <Ch1Inner />
      </Canvas>
      <DoorPrompt />
    </div>
  );
};


