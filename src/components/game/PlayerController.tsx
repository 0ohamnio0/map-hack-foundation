import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useFixedFramerate } from '@/hooks/useFixedFramerate';
import { useGameStore } from '@/store/useGameStore';

const ACCEL = 18;
const FRICTION = 6;
const MAX_SPEED = 4;
const SNAP_UNIT = 0.05;
const CAM_SNAP = 0.02;
const CAM_LERP = 0.06;

function snap(v: number, unit: number) {
  return Math.round(v / unit) * unit;
}

interface Props {
  mode: '1st' | '3rd';
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  onPosition?: (x: number, z: number) => void;
  startPosition?: [number, number, number];
}

export const PlayerController: React.FC<Props> = ({ mode, bounds, onPosition, startPosition }) => {
  const keys = useKeyboard();
  const { shouldUpdate } = useFixedFramerate(24);
  const { camera } = useThree();
  const chapter = useGameStore(s => s.chapter);
  const addMovement = useGameStore(s => s.addMovement);

  const pos = useRef(new THREE.Vector3(...(startPosition || [0, 0.5, 0])));
  const vel = useRef(new THREE.Vector2(0, 0));
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (!shouldUpdate(delta)) return;

    const dt = 1 / 24;
    const k = keys.current;

    let inputX = 0;
    let inputZ = 0;

    if (k.has('ArrowLeft') || k.has('KeyA')) inputX = -1;
    if (k.has('ArrowRight') || k.has('KeyD')) inputX = 1;

    // Forward/backward for all modes
    if (k.has('ArrowUp') || k.has('KeyW')) inputZ = -1;
    if (k.has('ArrowDown') || k.has('KeyS')) inputZ = 1;

    // Track movement for CH2 sign logic
    if (chapter === 'CH2') {
      if (inputX < 0) addMovement('left', Math.abs(inputX) * dt);
      if (inputX > 0) addMovement('right', Math.abs(inputX) * dt);
    }

    // Apply acceleration
    if (inputX !== 0) vel.current.x += inputX * ACCEL * dt;
    else vel.current.x *= Math.exp(-FRICTION * dt);

    if (inputZ !== 0) vel.current.y += inputZ * ACCEL * dt;
    else vel.current.y *= Math.exp(-FRICTION * dt);

    // Clamp
    const speed = vel.current.length();
    if (speed > MAX_SPEED) vel.current.multiplyScalar(MAX_SPEED / speed);

    // Update position
    pos.current.x += vel.current.x * dt;
    pos.current.z += vel.current.y * dt;

    // Snap position
    pos.current.x = snap(pos.current.x, SNAP_UNIT);
    pos.current.z = snap(pos.current.z, SNAP_UNIT);

    // Bounds
    if (bounds) {
      pos.current.x = Math.max(bounds.minX, Math.min(bounds.maxX, pos.current.x));
      pos.current.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, pos.current.z));
    }


    // Camera follows pos directly (no lerp)
    if (mode === '1st') {
      camera.position.set(pos.current.x, 1.6, pos.current.z);
      camera.lookAt(pos.current.x, 1.6, pos.current.z - 5);
      if (Math.abs(vel.current.x) > 0.1 || Math.abs(vel.current.y) > 0.1) {
        const lookX = pos.current.x + vel.current.x;
        const lookZ = pos.current.z + vel.current.y;
        camera.lookAt(lookX, 1.6, lookZ);
      }
    } else {
      // 3rd person: camera sits behind+above pos, no lag
      camera.position.set(pos.current.x, pos.current.y + 2.5, pos.current.z + 3.5);
      camera.lookAt(pos.current.x, pos.current.y + 0.5, pos.current.z);
    }

    // Mesh fixed in front of camera (character always visible)
    if (meshRef.current) {
      meshRef.current.position.set(pos.current.x, pos.current.y, pos.current.z);
    }

    onPosition?.(pos.current.x, pos.current.z);
  });

  return (
    <mesh ref={meshRef} position={startPosition || [0, 0.5, 0]}>
      <boxGeometry args={[0.6, 1, 0.6]} />
      <meshStandardMaterial color="#888" />
    </mesh>
  );
};
