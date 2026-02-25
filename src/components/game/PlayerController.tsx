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

const CHAR_FORWARD_DIST = 2.0;
const CHAR_Y = 0.5; // character feet on ground

export interface WallAABB {
  minX: number; maxX: number; minZ: number; maxZ: number;
}

interface Props {
  mode: '1st' | '3rd';
  showCharacter?: boolean;
  bounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
  collisionWalls?: WallAABB[];
  onPosition?: (x: number, z: number) => void;
  startPosition?: [number, number, number];
}

const PLAYER_HALF = 0.3; // half-width of player box

function collidesWithWalls(px: number, pz: number, walls: WallAABB[]): boolean {
  const pMinX = px - PLAYER_HALF, pMaxX = px + PLAYER_HALF;
  const pMinZ = pz - PLAYER_HALF, pMaxZ = pz + PLAYER_HALF;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (pMaxX > w.minX && pMinX < w.maxX && pMaxZ > w.minZ && pMinZ < w.maxZ) return true;
  }
  return false;
}

export const PlayerController: React.FC<Props> = ({ mode, showCharacter, bounds, collisionWalls, onPosition, startPosition }) => {
  const keys = useKeyboard();
  const { shouldUpdate } = useFixedFramerate(24);
  const { camera } = useThree();
  const chapter = useGameStore(s => s.chapter);
  const addMovement = useGameStore(s => s.addMovement);

  const pos = useRef(new THREE.Vector3(...(startPosition || [0, 0.5, 0])));
  const vel = useRef(new THREE.Vector2(0, 0));
  const meshRef = useRef<THREE.Mesh>(null);
  const camDir = useRef(new THREE.Vector3());

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

    // No camera-relative rotation needed; CH2 showCharacter now uses same
    // 1st-person camera as CH3, character is just rendered in front.

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

    // Update position with per-axis collision
    const newX = pos.current.x + vel.current.x * dt;
    const newZ = pos.current.z + vel.current.y * dt;

    if (collisionWalls && collisionWalls.length > 0) {
      // Try X axis
      if (!collidesWithWalls(newX, pos.current.z, collisionWalls)) {
        pos.current.x = newX;
      } else {
        vel.current.x = 0;
      }
      // Try Z axis
      if (!collidesWithWalls(pos.current.x, newZ, collisionWalls)) {
        pos.current.z = newZ;
      } else {
        vel.current.y = 0;
      }
    } else {
      pos.current.x = newX;
      pos.current.z = newZ;
    }

    // Snap position
    pos.current.x = snap(pos.current.x, SNAP_UNIT);
    pos.current.z = snap(pos.current.z, SNAP_UNIT);

    // Bounds
    if (bounds) {
      pos.current.x = Math.max(bounds.minX, Math.min(bounds.maxX, pos.current.x));
      pos.current.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, pos.current.z));
    }


    // Camera — identical to CH3
    if (mode === '1st') {
      camera.position.set(pos.current.x, 1.8, pos.current.z);
      if (Math.abs(vel.current.x) > 0.1 || Math.abs(vel.current.y) > 0.1) {
        const lookX = pos.current.x + vel.current.x * 3;
        const lookZ = pos.current.z + vel.current.y * 3;
        camera.lookAt(lookX, 1.8, lookZ);
      } else {
        camera.lookAt(pos.current.x, 1.8, pos.current.z - 5);
      }
    } else {
      camera.position.set(pos.current.x, pos.current.y + 2.5, pos.current.z + 3.5);
      camera.lookAt(pos.current.x, pos.current.y + 0.5, pos.current.z);
    }

    // Place character mesh in front of camera using camera's actual forward direction
    if (meshRef.current) {
      if (showCharacter) {
        camera.getWorldDirection(camDir.current);
        const charX = pos.current.x + camDir.current.x * CHAR_FORWARD_DIST;
        const charZ = pos.current.z + camDir.current.z * CHAR_FORWARD_DIST;
        meshRef.current.position.set(charX, CHAR_Y, charZ);
        meshRef.current.rotation.y = Math.atan2(camDir.current.x, camDir.current.z);
      } else {
        meshRef.current.position.set(pos.current.x, pos.current.y, pos.current.z);
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
