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

const BACK_DIST = 1.8;
const BACK_HEIGHT = 1.0;

interface Props {
  mode: '1st' | '3rd';
  showCharacter?: boolean;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  onPosition?: (x: number, z: number) => void;
  startPosition?: [number, number, number];
}

export const PlayerController: React.FC<Props> = ({ mode, showCharacter, bounds, onPosition, startPosition }) => {
  const keys = useKeyboard();
  const { shouldUpdate } = useFixedFramerate(24);
  const { camera } = useThree();
  const chapter = useGameStore(s => s.chapter);
  const addMovement = useGameStore(s => s.addMovement);

  const pos = useRef(new THREE.Vector3(...(startPosition || [0, 0.5, 0])));
  const vel = useRef(new THREE.Vector2(0, 0));
  const meshRef = useRef<THREE.Mesh>(null);
  // Holds last known "behind" direction so camera doesn't snap when player stops
  const lastBehindDir = useRef({ x: 0, z: 1 });

  useFrame((_, delta) => {
    if (!shouldUpdate(delta)) return;

    const dt = 1 / 24;
    const k = keys.current;

    let inputX = 0;
    let inputZ = 0;

    if (k.has('ArrowLeft') || k.has('KeyA')) inputX = -1;
    if (k.has('ArrowRight') || k.has('KeyD')) inputX = 1;
    if (k.has('ArrowUp') || k.has('KeyW')) inputZ = -1;
    if (k.has('ArrowDown') || k.has('KeyS')) inputZ = 1;

    // When in back-view (showCharacter), rotate input to be camera-relative
    if (showCharacter && (inputX !== 0 || inputZ !== 0)) {
      const dir = lastBehindDir.current;
      const angle = Math.atan2(dir.x, dir.z);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const rx = inputX * cos - inputZ * sin;
      const rz = inputX * sin + inputZ * cos;
      inputX = rx;
      inputZ = rz;
    }

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
      if (showCharacter) {
        // Back-view: camera stays behind character based on movement direction
        if (speed > 0.2) {
          lastBehindDir.current = {
            x: vel.current.x / speed,
            z: vel.current.y / speed, // vel.y maps to world Z
          };
        }
        const camX = pos.current.x - lastBehindDir.current.x * BACK_DIST;
        const camZ = pos.current.z - lastBehindDir.current.z * BACK_DIST;
        camera.position.set(camX, pos.current.y + BACK_HEIGHT, camZ);
        camera.lookAt(pos.current.x, pos.current.y + 0.5, pos.current.z);
      } else {
        camera.position.set(pos.current.x, 1.8, pos.current.z);
        if (Math.abs(vel.current.x) > 0.1 || Math.abs(vel.current.y) > 0.1) {
          const lookX = pos.current.x + vel.current.x * 3;
          const lookZ = pos.current.z + vel.current.y * 3;
          camera.lookAt(lookX, 1.8, lookZ);
        } else {
          camera.lookAt(pos.current.x, 1.8, pos.current.z - 5);
        }
      }
    } else {
      // 3rd person: camera sits behind+above pos, no lag
      camera.position.set(pos.current.x, pos.current.y + 2.5, pos.current.z + 3.5);
      camera.lookAt(pos.current.x, pos.current.y + 0.5, pos.current.z);
    }

    // Update character mesh position + rotate to face movement direction
    if (meshRef.current) {
      meshRef.current.position.set(pos.current.x, pos.current.y, pos.current.z);
      if (showCharacter && speed > 0.2) {
        // atan2(x, -z): face the direction of travel
        meshRef.current.rotation.y = Math.atan2(vel.current.x, -vel.current.y);
      }
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
