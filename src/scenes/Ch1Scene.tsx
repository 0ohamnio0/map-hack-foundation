import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '@/store/useGameStore';
import { useSoundManager } from '@/hooks/useSoundManager';
import { MultiCubeTransition } from '@/components/effects/MultiCubeTransition';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';

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
  const [cubeProgress, setCubeProgress] = useState(-1); // -1 = not started
  const cubeStart = useRef(0);

  // Auto cutscene timeline
  useEffect(() => {
    // 7.5s: hallucination glitch (was 3s × 2.5)
    const t1 = setTimeout(() => {
      if (triggerEvent('ch1_hallucination')) {
        setActiveEffect('glitch', 2000);
      }
      setPhase(1);
    }, 7500);

    // 13.75s: settle on door, ready for input (was 5.5s × 2.5)
    const t2 = setTimeout(() => {
      setPhase(2);
    }, 13750);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [triggerEvent, setActiveEffect, setPhase]);

  // Door interaction — any key press or mouse click during phase 2
  useEffect(() => {
    const openDoor = () => {
      if (phase < 2 || doorOpened.current) return;
      doorOpened.current = true;
      play('door_creak');
      setCubeProgress(0);
      cubeStart.current = performance.now();
    };
    window.addEventListener('keydown', openDoor);
    window.addEventListener('click', openDoor);
    return () => {
      window.removeEventListener('keydown', openDoor);
      window.removeEventListener('click', openDoor);
    };
  }, [phase, play]);

  // Animate Multi Cube transition progress (4 seconds)
  const TRANSITION_DURATION = 4000;
  useFrame(() => {
    if (cubeProgress < 0) return;
    const elapsed = performance.now() - cubeStart.current;
    const p = Math.min(elapsed / TRANSITION_DURATION, 1);
    setCubeProgress(p);
  });

  const handleCubeComplete = () => {
    goToChapter('CH2');
  };

  return (
    <>
      <ambientLight intensity={0.2} color="#ff2200" />
      <pointLight position={[0, 2.5, 0]} intensity={1.5} color="#ff0000" />
      <Room />
      <CutsceneCamera phase={phase} />
      {/* Simple post-processing for door room (main effects moved to INTRO) */}
      <EffectComposer>
        <Bloom luminanceThreshold={0.5} luminanceSmoothing={0.9} intensity={0.8} />
        <Vignette offset={0.3} darkness={0.7} />
      </EffectComposer>
      {/* STEP 9: Multi Cube door transition (REF-12) */}
      {cubeProgress >= 0 && (
        <MultiCubeTransition progress={cubeProgress} onComplete={handleCubeComplete} />
      )}
    </>
  );
};

/** Door prompt overlay */
const DoorPrompt: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 15000);
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
      fontFamily: '"Unifont", monospace',
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


