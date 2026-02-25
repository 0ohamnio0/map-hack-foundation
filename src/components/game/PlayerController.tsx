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

const GRID_POS_LERP = 10;
const GRID_FACING_LERP = 12;
const GRID_INPUT_COOLDOWN = 0.22; // seconds between inputs

function snap(v: number, unit: number) {
  return Math.round(v / unit) * unit;
}

function shortestAngleDelta(from: number, to: number): number {
  let d = ((to - from) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  return d;
}

const CHAR_FORWARD_DIST = 2.0;
const CHAR_Y = 0.5;

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
  /** Initial look direction as [dx, dz]. Defaults to [0, -1] (look toward -Z). */
  initialLookDir?: [number, number];
  /** Forward direction on Z axis: -1 (CH3 style), +1 (opposite). */
  forwardZSign?: 1 | -1;
  /** When set, enables grid-based movement (PS1/DOS maze style). Value = cell size in world units. */
  gridCellSize?: number;
}

const PLAYER_HALF = 0.3;

function collidesWithWalls(px: number, pz: number, walls: WallAABB[]): boolean {
  const pMinX = px - PLAYER_HALF, pMaxX = px + PLAYER_HALF;
  const pMinZ = pz - PLAYER_HALF, pMaxZ = pz + PLAYER_HALF;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (pMaxX > w.minX && pMinX < w.maxX && pMaxZ > w.minZ && pMinZ < w.maxZ) return true;
  }
  return false;
}

export const PlayerController: React.FC<Props> = ({
  mode, showCharacter, bounds, collisionWalls, onPosition,
  startPosition, initialLookDir, gridCellSize,
}) => {
  const keys = useKeyboard();
  const { shouldUpdate } = useFixedFramerate(24);
  const { camera } = useThree();
  const chapter = useGameStore(s => s.chapter);
  const addMovement = useGameStore(s => s.addMovement);

  const initPos = startPosition || [0, 0.5, 0];
  const pos = useRef(new THREE.Vector3(initPos[0], initPos[1], initPos[2]));
  const vel = useRef(new THREE.Vector2(0, 0));
  const meshRef = useRef<THREE.Mesh>(null);
  const camDir = useRef(new THREE.Vector3());

  const initLook = initialLookDir || [0, -1];
  const lastLookDir = useRef({ x: initLook[0], z: initLook[1] });
  const axes = useRef({
    forward: new THREE.Vector2(initLook[0], initLook[1]).normalize(),
    right: new THREE.Vector2(-initLook[1], initLook[0]).normalize(),
  });

  // Grid mode refs
  const initYaw = Math.atan2(initLook[0], initLook[1]);
  const gridCurrentPos = useRef({ x: initPos[0], z: initPos[2] });
  const gridTargetPos = useRef({ x: initPos[0], z: initPos[2] });
  const gridCurrentFacing = useRef(initYaw);
  const gridTargetFacing = useRef(initYaw);
  const gridCooldown = useRef(0);
  const prevKeys = useRef<Set<string>>(new Set());

  useFrame((_, delta) => {
    if (!shouldUpdate(delta)) return;
    const dt = 1 / 24;
    const k = keys.current;

    if (gridCellSize) {
      // ---- Grid movement mode (PS1/DOS maze style) ----
      gridCooldown.current = Math.max(0, gridCooldown.current - dt);

      if (gridCooldown.current <= 0) {
        const left = k.has('ArrowLeft') || k.has('KeyA');
        const right = k.has('ArrowRight') || k.has('KeyD');
        const forward = k.has('ArrowUp') || k.has('KeyW');
        const backward = k.has('ArrowDown') || k.has('KeyS');
        const prevLeft = prevKeys.current.has('ArrowLeft') || prevKeys.current.has('KeyA');
        const prevRight = prevKeys.current.has('ArrowRight') || prevKeys.current.has('KeyD');
        const prevForward = prevKeys.current.has('ArrowUp') || prevKeys.current.has('KeyW');
        const prevBackward = prevKeys.current.has('ArrowDown') || prevKeys.current.has('KeyS');

        if (left && !prevLeft) {
          gridTargetFacing.current -= Math.PI / 2;
          gridCooldown.current = GRID_INPUT_COOLDOWN;
          if (chapter === 'CH2') addMovement('left', 1);
        } else if (right && !prevRight) {
          gridTargetFacing.current += Math.PI / 2;
          gridCooldown.current = GRID_INPUT_COOLDOWN;
          if (chapter === 'CH2') addMovement('right', 1);
        } else if (forward && !prevForward) {
          const yaw = gridTargetFacing.current;
          const fx = Math.round(Math.sin(yaw));
          const fz = Math.round(Math.cos(yaw));
          const nx = gridTargetPos.current.x + fx * gridCellSize;
          const nz = gridTargetPos.current.z + fz * gridCellSize;
          if (!collisionWalls || !collidesWithWalls(nx, nz, collisionWalls)) {
            gridTargetPos.current = { x: nx, z: nz };
          }
          gridCooldown.current = GRID_INPUT_COOLDOWN;
        } else if (backward && !prevBackward) {
          const yaw = gridTargetFacing.current;
          const fx = Math.round(Math.sin(yaw));
          const fz = Math.round(Math.cos(yaw));
          const nx = gridTargetPos.current.x - fx * gridCellSize;
          const nz = gridTargetPos.current.z - fz * gridCellSize;
          if (!collisionWalls || !collidesWithWalls(nx, nz, collisionWalls)) {
            gridTargetPos.current = { x: nx, z: nz };
          }
          gridCooldown.current = GRID_INPUT_COOLDOWN;
        }
      }

      prevKeys.current = new Set(k);

      // Lerp position toward target
      const lp = 1 - Math.exp(-GRID_POS_LERP * dt);
      gridCurrentPos.current.x += (gridTargetPos.current.x - gridCurrentPos.current.x) * lp;
      gridCurrentPos.current.z += (gridTargetPos.current.z - gridCurrentPos.current.z) * lp;

      // Lerp facing toward target (shortest arc)
      const lf = 1 - Math.exp(-GRID_FACING_LERP * dt);
      gridCurrentFacing.current += shortestAngleDelta(gridCurrentFacing.current, gridTargetFacing.current) * lf;

      if (bounds) {
        gridCurrentPos.current.x = Math.max(bounds.minX, Math.min(bounds.maxX, gridCurrentPos.current.x));
        gridCurrentPos.current.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, gridCurrentPos.current.z));
      }

      camera.position.set(gridCurrentPos.current.x, 1.8, gridCurrentPos.current.z);
      camera.lookAt(
        gridCurrentPos.current.x + Math.sin(gridCurrentFacing.current) * 10,
        1.8,
        gridCurrentPos.current.z + Math.cos(gridCurrentFacing.current) * 10,
      );
      onPosition?.(gridCurrentPos.current.x, gridCurrentPos.current.z);
      return;
    }

    // ---- Continuous movement mode ----
    let inputRight = 0;
    let inputForward = 0;

    if (k.has('ArrowLeft') || k.has('KeyA')) inputRight -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) inputRight += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) inputForward += 1;
    if (k.has('ArrowDown') || k.has('KeyS')) inputForward -= 1;

    const moveX = inputRight * axes.current.right.x + inputForward * axes.current.forward.x;
    const moveZ = inputRight * axes.current.right.y + inputForward * axes.current.forward.y;

    if (chapter === 'CH2') {
      if (inputRight < 0) addMovement('left', Math.abs(inputRight) * dt);
      if (inputRight > 0) addMovement('right', Math.abs(inputRight) * dt);
    }

    if (moveX !== 0) vel.current.x += moveX * ACCEL * dt;
    else vel.current.x *= Math.exp(-FRICTION * dt);

    if (moveZ !== 0) vel.current.y += moveZ * ACCEL * dt;
    else vel.current.y *= Math.exp(-FRICTION * dt);

    const speed = vel.current.length();
    if (speed > MAX_SPEED) vel.current.multiplyScalar(MAX_SPEED / speed);

    const newX = pos.current.x + vel.current.x * dt;
    const newZ = pos.current.z + vel.current.y * dt;

    if (collisionWalls && collisionWalls.length > 0) {
      if (!collidesWithWalls(newX, pos.current.z, collisionWalls)) {
        pos.current.x = newX;
      } else {
        vel.current.x = 0;
      }
      if (!collidesWithWalls(pos.current.x, newZ, collisionWalls)) {
        pos.current.z = newZ;
      } else {
        vel.current.y = 0;
      }
    } else {
      pos.current.x = newX;
      pos.current.z = newZ;
    }

    pos.current.x = snap(pos.current.x, SNAP_UNIT);
    pos.current.z = snap(pos.current.z, SNAP_UNIT);

    if (bounds) {
      pos.current.x = Math.max(bounds.minX, Math.min(bounds.maxX, pos.current.x));
      pos.current.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, pos.current.z));
    }

    if (mode === '1st') {
      camera.position.set(pos.current.x, 1.8, pos.current.z);
      if (Math.abs(vel.current.x) > 0.1 || Math.abs(vel.current.y) > 0.1) {
        lastLookDir.current = { x: vel.current.x, z: vel.current.y };
        camera.lookAt(pos.current.x + vel.current.x * 3, 1.8, pos.current.z + vel.current.y * 3);
      } else {
        camera.lookAt(pos.current.x + lastLookDir.current.x * 5, 1.8, pos.current.z + lastLookDir.current.z * 5);
      }
    } else {
      camera.position.set(pos.current.x, pos.current.y + 2.5, pos.current.z + 3.5);
      camera.lookAt(pos.current.x, pos.current.y + 0.5, pos.current.z);
    }

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
