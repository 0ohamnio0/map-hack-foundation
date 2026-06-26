import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { Howl } from 'howler';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useFixedFramerate } from '@/hooks/useFixedFramerate';
import { useGameStore } from '@/store/useGameStore';

const ACCEL = 18;
const FRICTION = 6;
const MAX_SPEED = 4;
const SNAP_UNIT = 0.05;

// CH.3 카트 이동 튜닝 — dev 패널(P)의 슬라이더로 라이브 조절. 객체를 mutate하므로 useFrame이 매 프레임 최신값을 읽음.
//   gridStep: 양자화 끊김 단위(작을수록 잘게 부드럽게, CELL_SIZE 7의 약수 권장). posLerp: 슬라이드 속도(클수록 빠르게 끊어 이동).
export const cartTuning = {
  gridStep: 0.875, // 해민 확정 — 잘게 끊겨 부드럽게 (CELL_SIZE 7의 1/8)
  posLerp: 1,      // 해민 확정 — 느린 슬라이드 = 묵직한 카트 느낌
};
const FACING_STEP = Math.PI / 12; // CH.3 — 회전 각도 양자화(15°) → 회전도 프레임 뺀 듯 끊기게 (전진 끊김과 톤 맞춤)
const GRID_FACING_LERP = 12;
const GRID_INPUT_COOLDOWN = 0.22; // seconds between inputs
const CART_VOL = 0.5;   // CH.3 롤링 카트 사운드 볼륨
const CART_FADE = 6;    // 이동 시작/정지 시 볼륨 페이드 속도(자연스러운 멈춤)

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
  /** Override grid input cooldown in seconds. Default 0.22. */
  gridInputCooldown?: number;
  /** When true, suppress the CH.3 rolling-cart sound (e.g. during cutscenes). */
  cartMuted?: boolean;
  /** When true, ignore movement input (e.g. while a note/fragment overlay is open). */
  freeze?: boolean;
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
  startPosition, initialLookDir, gridCellSize, gridInputCooldown, cartMuted, freeze,
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

  // CH.3 롤링 카트 — 이동(위치 변화) 중 루프, 멈추면 볼륨 페이드아웃. 전역 Howler.mute 자동 적용
  const cartHowl = useMemo(() => new Howl({
    src: [`${import.meta.env.BASE_URL ?? '/'}assets/audio/ch3/rolling_cart.mp3`],
    loop: true, volume: 0, preload: false,
  }), []);
  useEffect(() => {
    if (chapter === 'CH3') cartHowl.load();        // CH.3에서만 미리 로드 (CH.2 등엔 안 깔림)
    return () => { cartHowl.stop(); };
  }, [chapter, cartHowl]);

  // 약 먹어 미로가 재생성되면 — 플레이어 정면이 새 벽이면 열린 방향으로 카메라를 즉시 회전.
  // "빨간약 먹고 벽 마주본 리스폰" + 그로 인한 "유령 정면 fallback이 벽에 막혀 안 보임"을 함께 해소.
  useEffect(() => {
    if (!gridCellSize || !collisionWalls || collisionWalls.length === 0) return;
    const open = (yaw: number) => {
      const fx = Math.round(Math.sin(yaw));
      const fz = Math.round(Math.cos(yaw));
      const nx = gridTargetPos.current.x + fx * gridCellSize;
      const nz = gridTargetPos.current.z + fz * gridCellSize;
      const mx = (gridTargetPos.current.x + nx) / 2;
      const mz = (gridTargetPos.current.z + nz) / 2;
      return !collidesWithWalls(mx, mz, collisionWalls) && !collidesWithWalls(nx, nz, collisionWalls);
    };
    const yaw = gridTargetFacing.current;
    if (open(yaw)) return; // 정면이 통로면 그대로
    for (const turn of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
      if (open(yaw + turn)) {
        gridTargetFacing.current = yaw + turn;
        gridCurrentFacing.current = yaw + turn;
        break;
      }
    }
  }, [collisionWalls, gridCellSize]);

  useFrame((_, delta) => {
    if (!shouldUpdate(delta)) return;
    const dt = 1 / 24;
    const k = keys.current;

    if (gridCellSize) {
      // ---- Grid movement mode (PS1/DOS maze style) ----
      const cooldown = gridInputCooldown ?? GRID_INPUT_COOLDOWN;
      gridCooldown.current = Math.max(0, gridCooldown.current - dt);

      if (gridCooldown.current <= 0 && !freeze) {
        const left = k.has('ArrowLeft') || k.has('KeyA');
        const right = k.has('ArrowRight') || k.has('KeyD');
        const forward = k.has('ArrowUp') || k.has('KeyW');
        const backward = k.has('ArrowDown') || k.has('KeyS');
        const prevLeft = prevKeys.current.has('ArrowLeft') || prevKeys.current.has('KeyA');
        const prevRight = prevKeys.current.has('ArrowRight') || prevKeys.current.has('KeyD');
        const prevForward = prevKeys.current.has('ArrowUp') || prevKeys.current.has('KeyW');
        const prevBackward = prevKeys.current.has('ArrowDown') || prevKeys.current.has('KeyS');

        if (left && !prevLeft) {
          gridTargetFacing.current += Math.PI / 2;
          gridCooldown.current = cooldown;
          if (chapter === 'CH2') addMovement('left', 1);
        } else if (right && !prevRight) {
          gridTargetFacing.current -= Math.PI / 2;
          gridCooldown.current = cooldown;
          if (chapter === 'CH2') addMovement('right', 1);
        } else if (forward && !prevForward) {
          const yaw = gridTargetFacing.current;
          const fx = Math.round(Math.sin(yaw));
          const fz = Math.round(Math.cos(yaw));
          const nx = gridTargetPos.current.x + fx * gridCellSize;
          const nz = gridTargetPos.current.z + fz * gridCellSize;
          // Check midpoint (cell boundary) where maze walls actually sit
          const mx = (gridTargetPos.current.x + nx) / 2;
          const mz = (gridTargetPos.current.z + nz) / 2;
          const blocked = collisionWalls &&
            (collidesWithWalls(mx, mz, collisionWalls) || collidesWithWalls(nx, nz, collisionWalls));
          if (!blocked) {
            gridTargetPos.current = { x: nx, z: nz };
          }
          gridCooldown.current = cooldown;
        } else if (backward && !prevBackward) {
          const yaw = gridTargetFacing.current;
          const fx = Math.round(Math.sin(yaw));
          const fz = Math.round(Math.cos(yaw));
          const nx = gridTargetPos.current.x - fx * gridCellSize;
          const nz = gridTargetPos.current.z - fz * gridCellSize;
          // Check midpoint (cell boundary) where maze walls actually sit
          const mx = (gridTargetPos.current.x + nx) / 2;
          const mz = (gridTargetPos.current.z + nz) / 2;
          const blocked = collisionWalls &&
            (collidesWithWalls(mx, mz, collisionWalls) || collidesWithWalls(nx, nz, collisionWalls));
          if (!blocked) {
            gridTargetPos.current = { x: nx, z: nz };
          }
          gridCooldown.current = cooldown;
        }
      }

      prevKeys.current = new Set(k);

      // Lerp position toward target
      const lp = 1 - Math.exp(-cartTuning.posLerp * dt);
      gridCurrentPos.current.x += (gridTargetPos.current.x - gridCurrentPos.current.x) * lp;
      gridCurrentPos.current.z += (gridTargetPos.current.z - gridCurrentPos.current.z) * lp;

      // Lerp facing toward target (shortest arc)
      const lf = 1 - Math.exp(-GRID_FACING_LERP * dt);
      gridCurrentFacing.current += shortestAngleDelta(gridCurrentFacing.current, gridTargetFacing.current) * lf;

      if (bounds) {
        gridTargetPos.current.x = Math.max(bounds.minX, Math.min(bounds.maxX, gridTargetPos.current.x));
        gridTargetPos.current.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, gridTargetPos.current.z));
        gridCurrentPos.current.x = Math.max(bounds.minX, Math.min(bounds.maxX, gridCurrentPos.current.x));
        gridCurrentPos.current.z = Math.max(bounds.minZ, Math.min(bounds.maxZ, gridCurrentPos.current.z));
      }

      // 뻑뻑한 전진+회전 — 위치는 GRID_STEP, 각도는 FACING_STEP 격자에 양자화 → 칸칸·각각 끊어 움직임(프레임 뺀 느낌)
      //   (천장 추가로 '벽 위 검은 하늘' 노출이 없어져 회전 양자화 안전)
      // 양자화 격자를 셀 중심(cellToWorld = gx*cs + cs/2)에 위상 정렬. GRID_STEP=cellSize일 때
      // 정렬 안 하면 round 경계(x.5)가 셀 중심과 어긋나 lerp가 경계를 못 넘어 카트가 한 칸에 고정됨.
      const qHalf = gridCellSize / 2;
      const gs = cartTuning.gridStep;
      const qx = Math.round((gridCurrentPos.current.x - qHalf) / gs) * gs + qHalf;
      const qz = Math.round((gridCurrentPos.current.z - qHalf) / gs) * gs + qHalf;
      const qFacing = Math.round(gridCurrentFacing.current / FACING_STEP) * FACING_STEP;
      camera.position.set(qx, 1.8, qz);
      camera.lookAt(
        qx + Math.sin(qFacing) * 10,
        1.8,
        qz + Math.cos(qFacing) * 10,
      );
      onPosition?.(gridCurrentPos.current.x, gridCurrentPos.current.z);

      // 롤링 카트 사운드 (CH.3) — 위치 lerp 진행 중이면 이동 = 재생, 멈추면 자연 페이드아웃
      if (chapter === 'CH3') {
        const moving =
          Math.abs(gridTargetPos.current.x - gridCurrentPos.current.x) +
          Math.abs(gridTargetPos.current.z - gridCurrentPos.current.z) > 0.03;
        const targetVol = (moving && !cartMuted) ? CART_VOL : 0;
        const cur = cartHowl.volume() as number;
        const nv = cur + (targetVol - cur) * (1 - Math.exp(-CART_FADE * dt));
        cartHowl.volume(nv);
        if (targetVol > 0 && !cartHowl.playing()) cartHowl.play();
        else if (targetVol === 0 && nv < 0.01 && cartHowl.playing()) cartHowl.pause();
      }
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

  // 1인칭 — 더미 캐릭터 박스 제거. 카메라/이동/충돌은 pos.current 기반이라 시각 mesh 불필요.
  return null;
};
