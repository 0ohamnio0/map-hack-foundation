import React, { useRef, useMemo, useEffect, useState, useCallback, Suspense } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { KeyboardControls, useFBX, useAnimations, useKeyboardControls } from '@react-three/drei';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import Ecctrl, { EcctrlJoystick } from 'ecctrl';
import type { CustomEcctrlRigidBody } from 'ecctrl';
import { useGameStore } from '@/store/useGameStore';
import { useDevMode } from '@/hooks/useDevMode';
import { useMute } from '@/hooks/useMute';
import { useCh2Toggles } from '@/hooks/useCh2Toggles';
import { Ch2Effects } from '@/components/effects/ChapterEffects';
import { CloudSkyBackground } from '@/components/effects/CloudSkyBackground';
import { NPC } from '@/components/game/NPC';
import { SignpostManager, MovementTracker } from '@/components/game/SignpostManager';
import { Ch2SoundManager } from '@/components/game/Ch2SoundManager';
import { Note } from '@/components/game/Note';
import { NoteReader } from '@/components/game/NoteReader';
import { Ch2Decor } from '@/components/game/Ch2Decor';
import { Ch2AihubProps } from '@/components/game/Ch2AihubProps';
import { Ch2Signs, type SignBuilding } from '@/components/game/Ch2Signs';
import { CH2_NOTES } from '@/data/ch2Notes';

const BASE = import.meta.env.BASE_URL;

const WALL_HEIGHT = 4;

/** Scale factors live in @/scenes/ch2Layout to keep Ch2Scene <-> SignpostManager
 *  free of a circular import. */
import { SCALE_X, SCALE_Z } from '@/scenes/ch2Layout';
import { useSoundManager } from '@/hooks/useSoundManager';

/*
 * S-shaped winding street layout (top-down) — base values, scaled at runtime:
 *
 *  V1: x∈[-7, 7]   south from z=3 to z=-40
 *  H1: x∈[-7, 27]  east  at z∈[-30, -40]   (turn right)
 *  V2: x∈[13, 27]  south from z=-40 to z=-60
 *  H2: x∈[-7, 27]  west  at z∈[-60, -70]   (turn left)
 *  V3: x∈[-7, 7]   south from z=-70 to z=-90  (exit)
 */

// Wall segments: [centerX, centerZ, width(x), depth(z)] — base values
const WALL_DEFS_RAW: [number, number, number, number][] = [
  // --- Outer perimeter ---
  [0,      3,      14.6,  0.3],
  [7.15,  -13.5,   0.3,   33.3],
  [17,    -30,     20.3,  0.3],
  [27.15, -50,     0.3,   40.3],
  [17,    -70,     20.3,  0.3],
  [7.15,  -80,     0.3,   20.3],
  [0,     -90,     14.6,  0.3],
  [-7.15, -43.5,   0.3,   93.3],
  // --- Inner walls (S-turns) ---
  [3,     -40,     20.3,  0.3],
  [13,    -50,     0.3,   20.3],
  [3,     -60,     20.3,  0.3],
];
const WALL_DEFS: [number, number, number, number][] = WALL_DEFS_RAW.map(
  ([cx, cz, w, d]) => [cx * SCALE_X, cz * SCALE_Z, w * SCALE_X, d * SCALE_Z],
);

// 배경 빌딩 layer — outer wall(0~7) 너머로 spawn하는 솟은 빌딩들. 도로 정면 라인
// 뒤편에 추가 layer로 깔려 골목 너머로 보이는 5~9층 silhouette을 만듦.
// 콜라이더 없음 (도로 영역 침범 X).
//
// outward 방향은 명시 lookup — wall center 부호 자동 추정이 corner wall (특히 H1
// 위벽 wall 2: cz=-30)에서 도로 안쪽을 outward로 오판함.
const OUTER_OUTWARD: Array<[number, number]> = [
  [0,  1],  // wall 0: 북쪽 가로 (z=3) → +Z
  [1,  0],  // wall 1: V1 동 (x=+7.15) → +X
  [0,  1],  // wall 2: H1 위 (z=-30) → +Z  ★ 자동 추정이 -Z(=H1 도로 안쪽)였던 문제 fix
  [1,  0],  // wall 3: V2 동 (x=+27.15) → +X
  [0, -1],  // wall 4: H2 아래 (z=-70) → -Z
  [1,  0],  // wall 5: V3 동 (x=+7.15) → +X
  [0, -1],  // wall 6: 남쪽 가로 (z=-90) → -Z
  [-1, 0],  // wall 7: 서쪽 outer (x=-7.15) → -X
];
type BgBuilding = { x: number; z: number; w: number; h: number; d: number; texSeed: number };
const BG_BUILDINGS: BgBuilding[] = (() => {
  const out: BgBuilding[] = [];
  WALL_DEFS_RAW.forEach(([cx, cz, w, d], wallIdx) => {
    if (wallIdx >= 8) return; // outer perimeter만
    const isHoriz = w > d;
    const totalLen = isHoriz ? w : d;
    const [outwardSignX, outwardSignZ] = OUTER_OUTWARD[wallIdx];
    const count = 3 + (wallIdx % 2); // wall당 3~4개
    for (let i = 0; i < count; i++) {
      const seed = wallIdx * 47 + i * 13;
      const r1 = ((seed * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff;
      const r2 = (((seed + 99) * 22695477 + 1) & 0x7fffffff) / 0x7fffffff;
      const r3 = (((seed + 7)  * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const r4 = (((seed + 13) * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff;
      const t = (i + 0.5) / count + (r1 - 0.5) * 0.4;
      const localPos = (t - 0.5) * totalLen;
      const offsetOutward = 5 + r2 * 7; // 정면 라인에서 5~12m 뒤로
      const bx = (cx + (isHoriz ? localPos : outwardSignX * offsetOutward)) * SCALE_X;
      const bz = (cz + (isHoriz ? outwardSignZ * offsetOutward : localPos)) * SCALE_Z;
      const bw = 5 + r3 * 6;  // 5~11m
      const bh = 12 + r4 * 16; // 12~28m (4~9층)
      const bd = 7 + r1 * 7;  // 7~14m
      const texSeed = wallIdx * 7 + i * 11;
      out.push({ x: bx, z: bz, w: bw, h: bh, d: bd, texSeed });
    }
  });
  return out;
})();

// 원경 layer — 도로 bbox 밖 4방향(동/서/북/남)에 솟은 고층빌딩. 30~80m. fog 위로
// silhouette처럼 보이는 도시 거리감. 콜라이더 없음.
const FAR_BUILDINGS: BgBuilding[] = (() => {
  const out: BgBuilding[] = [];
  // [중심cx, 중심cz, 개수] — raw 좌표. 도로 bbox x∈[-7,27], z∈[-90,3] 바깥.
  const clusters: Array<[number, number, number]> = [
    [60,   -10, 5],  // 동쪽 멀리
    [-50,  -40, 4],  // 서쪽 멀리
    [10,    40, 4],  // 북쪽 멀리
    [10,  -130, 5],  // 남쪽 멀리
  ];
  clusters.forEach(([cx, cz, count], ci) => {
    for (let i = 0; i < count; i++) {
      const seed = ci * 97 + i * 31;
      const r1 = ((seed * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff;
      const r2 = (((seed + 5)  * 22695477   + 1)     & 0x7fffffff) / 0x7fffffff;
      const r3 = (((seed + 11) * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      const r4 = (((seed + 17) * 1664525    + 1013904223) & 0x7fffffff) / 0x7fffffff;
      const bx = (cx + (r1 - 0.5) * 30) * SCALE_X;  // ±15 raw 분산
      const bz = (cz + (r2 - 0.5) * 30) * SCALE_Z;
      const bw = 8 + r3 * 10;    // 8~18m
      const bh = 30 + r4 * 50;   // 30~80m
      const bd = 8 + r1 * 10;
      const texSeed = ci * 13 + i * 7;
      out.push({ x: bx, z: bz, w: bw, h: bh, d: bd, texSeed });
    }
  });
  return out;
})();

// Decorative street objects — base values
const DECOR_RAW: { x: number; z: number; w: number; d: number; h: number; color: string }[] = [
  // (#aa8800 placeholder pole 5개 제거 — aihub pole로 대체됨)
  { x: 15, z: -35, w: 1.2,  d: 1.2,  h: 1.5, color: '#777' },
  { x: 10, z: -65, w: 1.5,  d: 1.0,  h: 1.2, color: '#777' },
];
const DECOR = DECOR_RAW.map(o => ({ ...o, x: o.x * SCALE_X, z: o.z * SCALE_Z }));

const AIRPORT_TRIGGER = { x: 5 * SCALE_X, z: -16 * SCALE_Z, radius: 4.5 * SCALE_X };

// STEP 2: NPC positions along the S-curve — base values
const NPC_POSITIONS_RAW: { x: number; z: number; isSpecial?: boolean }[] = [
  { x: -3, z: -8 },
  { x: 4,  z: -15 },
  { x: -2, z: -25 },
  { x: 18, z: -38 },
  { x: 18, z: -45, isSpecial: true },  // "살아있는 척" 특수 NPC
  { x: 24, z: -50 },
  { x: 15, z: -63 },
  { x: -4, z: -72 },
  { x: 2,  z: -80 },
];
const NPC_POSITIONS = NPC_POSITIONS_RAW.map(n => ({ ...n, x: n.x * SCALE_X, z: n.z * SCALE_Z }));

// CH2_NOTES base 좌표를 길의 SCALE에 맞춰 변환
const NOTE_POSITIONS = CH2_NOTES.map(n => ({
  ...n,
  worldPos: [n.position[0] * SCALE_X, 0.15, n.position[1] * SCALE_Z] as [number, number, number],
}));

const AIRPORT_DURATION = 5200;
const AIRPORT_FADE = 220;

// Keyboard map for ecctrl
const keyboardMap = [
  { name: 'forward',   keys: ['ArrowUp',    'KeyW'] },
  { name: 'backward',  keys: ['ArrowDown',  'KeyS'] },
  { name: 'leftward',  keys: ['ArrowLeft',  'KeyA'] },
  { name: 'rightward', keys: ['ArrowRight', 'KeyD'] },
  { name: 'jump',      keys: ['Space'] },
  { name: 'run',       keys: ['Shift'] },
];

// ecctrl animation name → FBX clip name
const IDLE_CLIP = 'Short_Breathe_and_Look_Around'; // renamed from idle FBX at load time

const WALK_CLIP = 'Walking_frame_rate_24.fbx';

// ---------- FlickerLight ----------

const FlickerLight: React.FC = () => {
  const lightRef = useRef<THREE.AmbientLight>(null);
  useFrame(({ clock }) => {
    if (lightRef.current) {
      lightRef.current.intensity =
        0.7 + Math.sin(clock.elapsedTime * 8) * 0.08 + Math.sin(clock.elapsedTime * 13) * 0.04;
    }
  });
  return <ambientLight ref={lightRef} intensity={0.7} color="#f0f0e8" />;
};

// ---------- Airport Cutscene (unchanged) ----------

const AirportCutscene: React.FC<{ active: boolean; onDone: () => void }> = ({ active, onDone }) => {
  const [phase, setPhase] = useState<'in' | 'show' | 'out' | null>(null);

  useEffect(() => {
    if (!active) { setPhase(null); return; }
    setPhase('in');
    const t1 = setTimeout(() => setPhase('show'), AIRPORT_FADE);
    const t2 = setTimeout(() => setPhase('out'), AIRPORT_DURATION - AIRPORT_FADE);
    const t3 = setTimeout(() => { setPhase(null); onDone(); }, AIRPORT_DURATION);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [active, onDone]);

  if (!phase) return null;

  const opacity = phase === 'out' ? 0 : 1;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      opacity,
      transition: `opacity ${AIRPORT_FADE}ms ease`,
      overflow: 'hidden',
      pointerEvents: 'none',
      background: 'transparent',
      animation: 'airportCameraShake 0.18s steps(1, end) infinite',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(180deg, rgba(159,208,255,0.72) 0%, rgba(125,183,243,0.6) 42%, rgba(217,231,247,0.5) 43%, rgba(240,243,248,0.4) 100%)',
        filter: 'contrast(1.08) saturate(1.08)',
        mixBlendMode: 'screen',
      }} />
      <div style={{
        position: 'absolute', left: '8%', right: '8%', top: '12%', bottom: '20%',
        border: '8px solid rgba(235,245,255,0.65)',
        boxShadow: 'inset 0 0 0 1px rgba(120,160,210,0.35)',
        background: 'linear-gradient(180deg, rgba(152,201,255,0.95) 0%, rgba(202,229,255,0.95) 65%, rgba(230,240,250,0.95) 100%)',
        opacity: 0.72, mixBlendMode: 'screen',
      }}>
        {[18, 36, 54, 72].map(x => (
          <div key={x} style={{ position: 'absolute', top: 0, bottom: 0, left: `${x}%`, width: 2, background: 'rgba(195,215,240,0.7)' }} />
        ))}
      </div>
      <div style={{
        position: 'absolute', top: '18%', left: '50%', transform: 'translateX(-50%)',
        fontFamily: '"Unifont", monospace', color: 'rgba(19,42,84,0.95)', letterSpacing: 7, fontSize: 15,
        textShadow: '0 0 15px rgba(255,255,255,0.7)',
        animation: 'airportPulse 0.2s steps(2, end) infinite',
      }}>GATE 14</div>
      <div style={{
        position: 'absolute', left: '15%', right: '15%', bottom: '22%', height: '28%',
        transform: 'skewY(-18deg)',
        borderTop: '1px solid rgba(202,220,255,0.22)',
        filter: 'blur(0.4px)',
      }}>
        <div style={{ position: 'absolute', left: '62%', bottom: '30%', width: 10, height: 56, background: 'rgba(244,126,126,0.82)', boxShadow: '0 0 22px rgba(255,84,84,0.7)', animation: 'airportSlide 0.9s linear infinite' }} />
        <div style={{ position: 'absolute', left: '60%', bottom: '63%', width: 42, height: 5,  background: 'rgba(244,126,126,0.82)', boxShadow: '0 0 22px rgba(255,84,84,0.7)', animation: 'airportSlide 0.9s linear infinite' }} />
      </div>
      {[
        { left: '6%',  top: '10%', rot: -8, tint: 'rgba(255,70,70,0.34)',   label: 'ANGEL' },
        { left: '67%', top: '22%', rot:  9, tint: 'rgba(70,120,255,0.28)',  label: 'CROSS' },
        { left: '22%', top: '58%', rot: -5, tint: 'rgba(255,255,255,0.3)',  label: 'RUNWAY' },
      ].map((card, i) => (
        <div key={card.label} style={{
          position: 'absolute', left: card.left, top: card.top, width: 190, height: 108,
          transform: `rotate(${card.rot}deg)`,
          background: `linear-gradient(135deg, rgba(255,255,255,0.62), ${card.tint})`,
          border: '1px solid rgba(255,255,255,0.65)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.2)',
          mixBlendMode: 'screen',
          animation: `airportCardFlicker ${0.65 + i * 0.1}s steps(2, end) infinite`,
        }}>
          <div style={{ position: 'absolute', left: 10, top: 10, fontFamily: '"Unifont", monospace', fontSize: 10, letterSpacing: 2, color: 'rgba(14,28,54,0.8)' }}>{card.label}</div>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 40%, rgba(255,255,255,0.7) 0%, transparent 52%)' }} />
        </div>
      ))}
      <div style={{
        position: 'absolute', left: '8%', top: '12%', fontFamily: '"Unifont", monospace',
        color: 'rgba(255,255,255,0.85)', fontSize: 12, letterSpacing: 2, lineHeight: 1.8,
        textTransform: 'uppercase',
        animation: 'airportGlitch 0.14s steps(2, end) infinite', mixBlendMode: 'screen',
      }}>
        <div>boarding</div><div>departure</div><div>where are you</div>
      </div>
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 3px)', mixBlendMode: 'screen', opacity: 0.24, animation: 'airportRoll 0.24s linear infinite' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.9)', mixBlendMode: 'color-dodge', animation: 'airportStrobe 0.36s steps(2, end) infinite' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(255,40,40,0.16), transparent 28%, transparent 72%, rgba(80,140,255,0.16))', mixBlendMode: 'screen', animation: 'airportGlitch 0.15s steps(2, end) infinite' }} />
      <style>{`
        @keyframes airportPulse { 0% { opacity:.45; transform:translateX(-50%) scale(.995); } 100% { opacity:1; transform:translateX(-50%) scale(1.025); } }
        @keyframes airportGlitch { 0% { transform:translate(0,0); opacity:.95; } 50% { transform:translate(-2px,1px); opacity:.55; } 100% { transform:translate(2px,-1px); opacity:.95; } }
        @keyframes airportSlide { 0% { transform:translate(0,0); opacity:.95; } 100% { transform:translate(-220px,-110px); opacity:.16; } }
        @keyframes airportRoll { 0% { transform:translateY(0); } 100% { transform:translateY(3px); } }
        @keyframes airportStrobe { 0%,42% { opacity:0; } 43%,56% { opacity:.35; } 57%,100% { opacity:0; } }
        @keyframes airportCardFlicker { 0% { opacity:.2; } 50% { opacity:.62; } 100% { opacity:.28; } }
        @keyframes airportCameraShake { 0% { transform:translate(0,0) rotate(0deg); } 25% { transform:translate(-1px,1px) rotate(-.07deg); } 50% { transform:translate(1px,-1px) rotate(.07deg); } 75% { transform:translate(-1px,0) rotate(-.05deg); } 100% { transform:translate(1px,1px) rotate(.05deg); } }
      `}</style>
    </div>
  );
};

// ---------- Player Character (FBX + animations) ----------

const MAIN_FBX_URL = `${BASE}assets/characters_biped/Meshy_AI_biped/Meshy_AI_Animation_Walking_frame_rate_24.fbx`;
const IDLE_FBX_URL = `${BASE}assets/characters_biped/Meshy_AI_biped/Meshy_AI_Animation_Long_Breathe_and_Look_Around_frame_rate_24.fbx`;
const WALK_FBX_URL = `${BASE}assets/characters_biped/Meshy_AI_biped/Meshy_AI_Animation_Walking_frame_rate_24.fbx`;
const HEADACHE_FBX_URL = `${BASE}assets/characters_biped/Meshy_AI_biped/Meshy_AI_Animation_Headache_Relief_frame_rate_24.fbx`;
const INJURED_FBX_URL = `${BASE}assets/characters_biped/Meshy_AI_biped/Meshy_AI_Animation_Injured_Walk_frame_rate_24.fbx`;
const DIFFUSE_URL = `${BASE}assets/characters_biped/Meshy_AI_biped/Meshy_AI_texture_0.png`;
const METALLIC_URL = `${BASE}assets/characters_biped/Meshy_AI_biped/Meshy_AI_texture_0_metallic.png`;
const NORMAL_URL = `${BASE}assets/characters_biped/Meshy_AI_biped/Meshy_AI_texture_0_normal.png`;
const ROUGHNESS_URL = `${BASE}assets/characters_biped/Meshy_AI_biped/Meshy_AI_texture_0_roughness.png`;
// SKY_TEX_URL removed — SkyBackdrop replaced by CloudSkyBackground
const MODEL_YAW_OFFSET = 0;

// Preload key assets so first-visit and cached-visit paths stay as close as possible.
useFBX.preload(MAIN_FBX_URL);
useFBX.preload(IDLE_FBX_URL);
useFBX.preload(WALK_FBX_URL);
useFBX.preload(HEADACHE_FBX_URL);
useFBX.preload(INJURED_FBX_URL);
useLoader.preload(THREE.TextureLoader, DIFFUSE_URL);
useLoader.preload(THREE.TextureLoader, METALLIC_URL);
useLoader.preload(THREE.TextureLoader, NORMAL_URL);
useLoader.preload(THREE.TextureLoader, ROUGHNESS_URL);
// SkyBackdrop removed — replaced by CloudSkyBackground (REF-9)

const PlayerCharacter: React.FC<{ airportActive: boolean }> = ({ airportActive }) => {
  const groupRef = useRef<THREE.Group>(null);
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);
  const loggedActionNames = useRef(false);
  const [, getKeys] = useKeyboardControls();

  // Load main FBX with Suspense (single event — Physics mounts once, safely)
  const fbx = useFBX(MAIN_FBX_URL);

  // Load PBR textures
  const diffuse   = useLoader(THREE.TextureLoader, DIFFUSE_URL);
  const metallic  = useLoader(THREE.TextureLoader, METALLIC_URL);
  const normalMap = useLoader(THREE.TextureLoader, NORMAL_URL);
  const roughness = useLoader(THREE.TextureLoader, ROUGHNESS_URL);

  // Animation setup from main FBX (walking source)
  const { actions, mixer } = useAnimations(fbx.animations, groupRef);

  // Load extra clips manually after Physics is running (NO Suspense → NO Physics remount)
  const [idleAction, setIdleAction] = useState<THREE.AnimationAction | null>(null);
  const [walkAction, setWalkAction] = useState<THREE.AnimationAction | null>(null);
  const [headacheAction, setHeadacheAction] = useState<THREE.AnimationAction | null>(null);
  const [injuredAction, setInjuredAction] = useState<THREE.AnimationAction | null>(null);
  useEffect(() => {
    if (!mixer) return;
    let cancelled = false;
    const loader = new FBXLoader();

    loader.load(IDLE_FBX_URL, (idleFbx) => {
      if (cancelled || !groupRef.current) return;
      if (idleFbx.animations.length > 0) {
        const clip = idleFbx.animations[0].clone();
        clip.name = IDLE_CLIP;
        setIdleAction(mixer.clipAction(clip, groupRef.current));
      }
    });

    loader.load(WALK_FBX_URL, (walkFbx) => {
      if (cancelled || !groupRef.current) return;
      if (walkFbx.animations.length > 0) {
        const clip = walkFbx.animations[0].clone();
        clip.name = WALK_CLIP;
        setWalkAction(mixer.clipAction(clip, groupRef.current));
      }
    });

    loader.load(HEADACHE_FBX_URL, (headacheFbx) => {
      if (cancelled || !groupRef.current) return;
      if (headacheFbx.animations.length > 0) {
        const clip = headacheFbx.animations[0].clone();
        clip.name = 'Headache_Relief_frame_rate_24.fbx';
        setHeadacheAction(mixer.clipAction(clip, groupRef.current));
      }
    });

    loader.load(INJURED_FBX_URL, (injuredFbx) => {
      if (cancelled || !groupRef.current) return;
      if (injuredFbx.animations.length > 0) {
        const clip = injuredFbx.animations[0].clone();
        clip.name = 'Injured_Walk_frame_rate_24.fbx';
        setInjuredAction(mixer.clipAction(clip, groupRef.current));
      }
    });

    return () => { cancelled = true; };
  }, [mixer]);

  // Apply PBR textures to all meshes
  useEffect(() => {
    fbx.traverse(child => {
      if (!(child instanceof THREE.Mesh)) return;
      child.material = new THREE.MeshStandardMaterial({
        map:          diffuse,
        metalnessMap: metallic,
        normalMap:    normalMap,
        roughnessMap: roughness,
        metalness:    0.25,
        roughness:    0.72,
      });
      child.castShadow = true;
    });
  }, [fbx, diffuse, metallic, normalMap, roughness]);

  const findActionByIncludes = useCallback((needle: string): THREE.AnimationAction | null => {
    const lowerNeedle = needle.toLowerCase();
    for (const [name, action] of Object.entries(actions)) {
      if (!action) continue;
      if (name.toLowerCase().includes(lowerNeedle)) return action;
    }
    return null;
  }, [actions]);

  useEffect(() => {
    if (loggedActionNames.current) return;
    const names = Object.keys(actions);
    if (names.length === 0) return;
    loggedActionNames.current = true;
    console.log('[CH2][ANIM] action keys', names);
  }, [actions]);

  // Force animation state by input:
  // no input => idle loop, input => walk loop, airport => injured walk loop.
  useFrame(() => {
    const { forward, backward, leftward, rightward } = getKeys() as {
      forward?: boolean;
      backward?: boolean;
      leftward?: boolean;
      rightward?: boolean;
    };
    const moving = !!(forward || backward || leftward || rightward);
    const clipName = airportActive
      ? 'Headache_Relief_frame_rate_24.fbx'
      : (moving ? WALK_CLIP : IDLE_CLIP);

    let nextAction: THREE.AnimationAction | null = null;
    if (clipName === 'Headache_Relief_frame_rate_24.fbx') {
      nextAction = headacheAction ?? findActionByIncludes('headache_relief_frame_rate_24') ?? walkAction ?? findActionByIncludes('walking_frame_rate_24');
    } else if (clipName === 'Injured_Walk_frame_rate_24.fbx') {
      nextAction = injuredAction ?? walkAction ?? findActionByIncludes('injured_walk_frame_rate_24') ?? findActionByIncludes('walking_frame_rate_24');
    } else if (clipName === IDLE_CLIP) {
      nextAction = idleAction ?? walkAction ?? findActionByIncludes('walking_frame_rate_24');
    } else {
      nextAction = walkAction ?? findActionByIncludes('walking_frame_rate_24');
    }
    if (!nextAction) return;

    // Hard block any non-selected clip (including run-turn clips).
    for (const action of Object.values(actions)) {
      if (!action || action === nextAction) continue;
      action.stop();
      action.enabled = false;
      action.setEffectiveWeight(0);
    }

    if (activeActionRef.current === nextAction) return;
    if (activeActionRef.current) activeActionRef.current.fadeOut(0.1);
    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setEffectiveWeight(1);
    nextAction.setLoop(THREE.LoopRepeat, Infinity);
    nextAction.clampWhenFinished = false;
    nextAction.fadeIn(0.15).play();
    activeActionRef.current = nextAction;
  });

  useEffect(() => {
    return () => {
      if (!activeActionRef.current) return;
      activeActionRef.current.stop();
      activeActionRef.current = null;
    };
  }, []);

  return (
    <group ref={groupRef}>
      {/* Meshy AI exports in cm — scale down to meters */}
      <primitive object={fbx} scale={0.01} rotation={[0, MODEL_YAW_OFFSET, 0]} />
    </group>
  );
};

// ---------- Trigger watcher (reads camera position each frame) ----------
// Camera follows character closely enough for zone detection

const TriggerWatcher: React.FC<{
  onAirportTrigger: () => void;
  onExitZoneChange: (inZone: boolean) => void;
  disabled: boolean;
}> = ({ onAirportTrigger, onExitZoneChange, disabled }) => {
  const triggerEvent = useGameStore(s => s.triggerEvent);
  const inExitRef = useRef(false);

  useFrame(({ camera }) => {
    if (disabled) return;
    const px = camera.position.x;
    const pz = camera.position.z;

    // Airport hallucination — auto fire (one-shot via triggerEvent)
    const dx = px - AIRPORT_TRIGGER.x;
    const dz = pz - AIRPORT_TRIGGER.z;
    if (Math.sqrt(dx * dx + dz * dz) < AIRPORT_TRIGGER.radius) {
      if (triggerEvent('ch2_airport')) onAirportTrigger();
    }

    // Chapter exit zone — proximity-only state, confirmed by E key in Ch2Scene
    const inExit = pz < -82 * SCALE_Z;
    if (inExit !== inExitRef.current) {
      inExitRef.current = inExit;
      onExitZoneChange(inExit);
    }
  });

  return null;
};

// ---------- Road surface markings ----------
// 원본 한글 파일명 → ASCII 슬러그 매핑 (public/assets/tex/road-markings/)
// !속도제한30!.png       → speed-limit-30.png
// !유턴금지!.png         → no-u-turn.png
// !장애인!.png           → disabled.png
// !종점!.png             → terminus.png
// !직진!.png             → straight-ahead.png
// !횡단보도주의!.png     → crosswalk-caution.png
// 어 린 이 보호구역…png  → school-zone-slow.png
// 어어_.png              → uh-uh.png
// 일방통행_.png          → one-way.png
// 흠_.png                → hmm.png

const RM = `${BASE}assets/tex/road-markings/`;

// [url, centerX(base), centerZ(base), planeW, planeH]
// base 좌표는 SCALE 적용 전 — 위치 조정 시 이 배열만 수정하면 됨
const ROAD_MARKING_DEFS: [string, number, number, number, number][] = [
  [`${RM}speed-limit-30.png`,   2,   -10,  2.4, 4.0],
  [`${RM}no-u-turn.png`,       -2,   -22,  2.4, 3.6],
  [`${RM}straight-ahead.png`,   2,   -35,  2.0, 4.8],
  [`${RM}school-zone-slow.png`, 18,  -44,  4.0, 11.4],
  [`${RM}one-way.png`,          20,  -58,  2.4, 3.2],
  [`${RM}crosswalk-caution.png`,-2,  -75,  3.2, 4.0],
  [`${RM}terminus.png`,          2,  -85,  2.4, 3.2],
  [`${RM}hmm.png`,              -3,  -30,  1.6, 2.4],
  [`${RM}uh-uh.png`,            22,  -50,  1.6, 2.4],
  [`${RM}disabled.png`,        -4,   -70,  2.4, 3.2],
];

const RoadMarkings: React.FC = () => {
  const [textures, setTextures] = useState<(THREE.Texture | null)[]>(
    () => ROAD_MARKING_DEFS.map(() => null),
  );

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    ROAD_MARKING_DEFS.forEach(([url], i) => {
      loader.loadAsync(url).then(tex => {
        if (cancelled) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
        setTextures(prev => {
          const next = [...prev];
          next[i] = tex;
          return next;
        });
      }).catch(err => {
        console.warn('[CH2] road marking load failed:', url, err);
      });
    });
    return () => { cancelled = true; };
  }, []);

  return (
    <group name="road_markings">
      {ROAD_MARKING_DEFS.map(([url, bx, bz, pw, ph], i) => {
        const tex = textures[i];
        if (!tex) return null;
        const slug = url.split('/').pop()?.replace('.png', '') ?? `marking-${i}`;
        return (
          <mesh
            key={i}
            name={`road_marking-${String(i).padStart(2, '0')}-${slug}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[bx * SCALE_X, 0.01, bz * SCALE_Z]}
            onPointerDown={(e) => {
              e.stopPropagation();
              console.log(`[RoadMarking] #${i}  slug=${slug}  pos=[${bx}, ${bz}]  size=[${pw}, ${ph}]`);
            }}
          >
            <planeGeometry args={[pw * SCALE_X, ph * SCALE_Z]} />
            <meshStandardMaterial
              map={tex}
              transparent
              alphaTest={0.5}
              depthWrite={false}
              roughness={1.0}
              metalness={0.0}
            />
          </mesh>
        );
      })}
    </group>
  );
};

// ---------- Street geometry + physics ----------

// 빌딩 텍스처 메타 — sips로 측정한 실 픽셀 사이즈 (빌드 타임 고정)
const BUILDING_TEX_META: { slug: string; w: number; h: number }[] = [
  { slug: 'building-019', w: 640, h: 480 },
  { slug: 'building-026', w: 480, h: 640 },
  { slug: 'building-027', w: 480, h: 640 },
  { slug: 'building-028', w: 480, h: 640 },
  { slug: 'building-031', w: 640, h: 480 },
  { slug: 'building-035', w: 640, h: 480 },
  { slug: 'building-036', w: 640, h: 480 },
  { slug: 'building-037', w: 640, h: 480 },
  { slug: 'building-050', w: 480, h: 640 },
  { slug: 'building-074', w: 640, h: 480 },
  { slug: 'building-096', w: 640, h: 480 },
  { slug: 'building-097', w: 640, h: 480 },
  { slug: 'building-098', w: 480, h: 640 },
  { slug: 'building-104', w: 640, h: 480 },
  { slug: 'building-122', w: 640, h: 480 },
  { slug: 'building-134', w: 480, h: 640 },
  { slug: 'building-135', w: 480, h: 640 },
  { slug: 'building-148', w: 480, h: 640 },
  { slug: 'building-149', w: 480, h: 640 },
  { slug: 'building-150', w: 480, h: 640 },
  { slug: 'building-151', w: 480, h: 640 },
  { slug: 'building-172', w: 480, h: 640 },
  { slug: 'building-178', w: 640, h: 480 },
  { slug: 'building-179', w: 640, h: 480 },
  { slug: 'building-219', w: 480, h: 640 },
  { slug: 'building-233', w: 640, h: 480 },
  { slug: 'building-234', w: 640, h: 480 },
  { slug: 'building-235', w: 640, h: 480 },
  { slug: 'building-236', w: 640, h: 480 },
  { slug: 'building-237', w: 480, h: 640 },
  { slug: 'building-251', w: 480, h: 640 },
  { slug: 'building-257', w: 640, h: 480 },
  { slug: 'building-258', w: 640, h: 480 },
  { slug: 'building-267', w: 640, h: 480 },
];

// 벽 세그먼트 분할 — 각 WALL_DEF에 대해 텍스처 한 장씩, 종횡비 보존
// segW = wallHeight * (texW / texH), 마지막 세그먼트는 남은 폭에 맞게 잘라맞춤
type WallSegment = {
  wallIndex: number;   // 원본 WALL_DEF index
  texIndex: number;    // BUILDING_TEX_META index
  offsetX: number;     // 세그먼트 좌측 끝에서의 오프셋 (긴 축 방향)
  segW: number;        // 세그먼트 폭 (월드 단위)
  repeatX: number;     // UV repeat.x (1.0 = 전체, <1 = 잘라맞춤)
};

function buildWallSegments(): WallSegment[] {
  const segments: WallSegment[] = [];
  // 의사난수 시드: 벽 index + 세그먼트 index 기반 해시
  function pickTex(wallIdx: number, segIdx: number): number {
    return (wallIdx * 7 + segIdx * 13) % BUILDING_TEX_META.length;
  }
  // 폭 변동 — 2.4~3.0배.
  function pickWidthVar(wallIdx: number, segIdx: number): number {
    const s = wallIdx * 41 + segIdx * 23;
    const r = ((s * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff;
    return 2.4 + r * 0.6;
  }

  WALL_DEFS.forEach(([, , w, d], wallIdx) => {
    // 긴 축 길이 결정: w > d 이면 가로 분할, 아니면 depth 방향 분할
    const totalLen = w > d ? w : d;
    let filled = 0;
    let segIdx = 0;
    while (filled < totalLen) {
      const tIdx = pickTex(wallIdx, segIdx);
      const meta = BUILDING_TEX_META[tIdx];
      const naturalSegW = WALL_HEIGHT * (meta.w / meta.h) * pickWidthVar(wallIdx, segIdx);
      const remaining = totalLen - filled;
      if (naturalSegW <= remaining) {
        segments.push({ wallIndex: wallIdx, texIndex: tIdx, offsetX: filled, segW: naturalSegW, repeatX: 1.0 });
        filled += naturalSegW;
      } else {
        // 마지막 세그먼트: 남은 폭에 잘라맞춤 + UV repeat.x 비례 축소
        const repeatX = remaining / naturalSegW;
        segments.push({ wallIndex: wallIdx, texIndex: tIdx, offsetX: filled, segW: remaining, repeatX });
        filled = totalLen;
      }
      segIdx++;
    }
  });
  return segments;
}

const WALL_SEGMENTS = buildWallSegments();

// 빌딩 박스 파라미터 — 각 세그먼트를 실제 3D 건물 박스로 확장
// height: WALL_HEIGHT × [0.7, 1.6] 범위 의사난수
// buildingDepth: [4, 8] 범위 의사난수 (도로에서 멀어지는 방향)
// 박스 중심은 정면이 원래 벽 라인에 flush되도록 depth/2 바깥으로 이동
type BuildingParams = {
  height: number;        // 실제 렌더 높이
  buildingDepth: number; // 도로 직각 방향 깊이
};

function getBuildingParams(wallIdx: number, segIdx: number): BuildingParams {
  // LCG 의사난수 — 시드 기반으로 결정론적
  const seed = wallIdx * 31 + segIdx * 17;
  const r1 = ((seed * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff;
  const r2 = (((seed + 99) * 22695477 + 1) & 0x7fffffff) / 0x7fffffff;
  const r3 = (((seed + 7) * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  // bimodal — 35% 솟은 빌딩(8~28m, 5~9층) + 65% 낮은 점포(6~14m, 2~4층). 하한 2m는
  // 너무 짓눌려 보였음 → 3배(6m)로. 그래도 솟은 빌딩과 명확한 두 layer 유지.
  const isTall = r3 < 0.35;
  const height = isTall
    ? WALL_HEIGHT * (2.0 + r1 * 5.0)
    : WALL_HEIGHT * (1.5 + r1 * 2.0);
  const buildingDepth = 4 + r2 * 8;              // 4 ~ 12 units (vol감)
  return { height, buildingDepth };
}

// wallIdx별로 segments를 미리 분류해서 segIdx를 부여
function buildSegmentIndexMap(): Map<number, number> {
  const map = new Map<number, number>();
  const counters = new Map<number, number>();
  WALL_SEGMENTS.forEach((seg, globalIdx) => {
    const c = counters.get(seg.wallIndex) ?? 0;
    map.set(globalIdx, c);
    counters.set(seg.wallIndex, c + 1);
  });
  return map;
}

const SEG_INDEX_MAP = buildSegmentIndexMap();

// 간판 부착용 빌딩 인스턴스 — WALL_SEGMENTS 렌더 시 사용하는 동일 좌표/치수/정면 방향.
// face = -outwardSign (도로 쪽). Ch2Signs가 의사난수로 ~50% 배치.
const SIGN_BUILDINGS: SignBuilding[] = (() => {
  const out: SignBuilding[] = [];
  WALL_DEFS.forEach(([cx, cz, w, d], wallIdx) => {
    const isHoriz = w > d;
    const segs = WALL_SEGMENTS.filter(s => s.wallIndex === wallIdx);
    const totalLen = isHoriz ? w : d;
    const outwardSignX = isHoriz ? 0 : (cx >= 0 ? 1 : -1);
    const outwardSignZ = isHoriz ? (cz >= 0 ? 1 : -1) : 0;
    segs.forEach((seg, si) => {
      const globalIdx = WALL_SEGMENTS.indexOf(seg);
      const segIdx = SEG_INDEX_MAP.get(globalIdx) ?? si;
      const { height, buildingDepth } = getBuildingParams(wallIdx, segIdx);
      const localPos = seg.offsetX + seg.segW / 2 - totalLen / 2;
      const posX = cx + (isHoriz ? localPos : outwardSignX * buildingDepth / 2);
      const posZ = cz + (isHoriz ? outwardSignZ * buildingDepth / 2 : localPos);
      const boxW = isHoriz ? seg.segW : buildingDepth;
      const boxD = isHoriz ? buildingDepth : seg.segW;
      out.push({
        cx: posX, cy: height / 2, cz: posZ,
        w: boxW, h: height, d: boxD,
        faceX: -outwardSignX, faceZ: -outwardSignZ,
        seed: wallIdx * 1009 + segIdx * 7919,
      });
    });
  });
  return out;
})();

const ASPHALT_TEX_URL = `${BASE}assets/tex/full/ASPHALT2.jpg`;
const DOOR09_TEX_URL = `${BASE}assets/tex/doors/door-09.png`;

const StreetScene: React.FC = () => {
  // 아스팔트 텍스처 — useLoader(Suspense throw) 대신 useEffect+loadAsync로 로드
  // StreetScene은 Suspense 경계 없이 Physics 직하에 mount되어 useLoader가 unmount를 유발함
  const [asphaltTex, setAsphaltTex] = useState<THREE.Texture | null>(null);
  const [doorTex, setDoorTex] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.loadAsync(ASPHALT_TEX_URL).then(tex => {
      if (cancelled) return;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(20, 40);
      tex.needsUpdate = true;
      setAsphaltTex(tex);
    }).catch(err => {
      console.error('[CH2] asphalt texture load failed:', ASPHALT_TEX_URL, err);
    });
    return () => { cancelled = true; };
  }, []);

  const asphaltMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    map: asphaltTex ?? undefined,
    roughness: 0.95,
  }), [asphaltTex]);

  // CH3 도어 텍스처 (DOOR0009.png — 480×640, 세로 비율 4:3)
  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.loadAsync(DOOR09_TEX_URL).then(tex => {
      if (cancelled) return;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.repeat.set(1, 1);
      tex.needsUpdate = true;
      setDoorTex(tex);
    }).catch(err => {
      console.warn('[CH2] door texture load failed:', DOOR09_TEX_URL, err);
    });
    return () => { cancelled = true; };
  }, []);

  const doorMaterial = useMemo(() => new THREE.MeshStandardMaterial({
    map: doorTex ?? undefined,
    roughness: 0.8,
    metalness: 0.0,
  }), [doorTex]);

  // 빌딩 텍스처 — BUILDING_TEX_META 인덱스별로 한 번만 로드
  const [buildingTextures, setBuildingTextures] = useState<(THREE.Texture | null)[]>(
    () => BUILDING_TEX_META.map(() => null),
  );

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    // WALL_SEGMENTS에서 실제 사용하는 texIndex 집합만 로드
    const usedIndices = new Set(WALL_SEGMENTS.map(s => s.texIndex));
    usedIndices.forEach(i => {
      const url = `${BASE}assets/tex/building/${BUILDING_TEX_META[i].slug}.png`;
      loader.loadAsync(url).then(tex => {
        if (cancelled) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.anisotropy = 4;
        tex.needsUpdate = true;
        setBuildingTextures(prev => {
          const next = [...prev];
          next[i] = tex;
          return next;
        });
      }).catch(err => {
        console.warn('[CH2] building texture load failed:', url, err);
      });
    });
    return () => { cancelled = true; };
  }, []);

  // 원경 머티리얼 — FAR_BUILDINGS와 1:1 매핑
  const farMaterials = useMemo(() =>
    FAR_BUILDINGS.map(b => {
      const tex = buildingTextures[b.texSeed % BUILDING_TEX_META.length];
      if (tex) {
        const cloned = tex.clone();
        cloned.needsUpdate = true;
        return new THREE.MeshStandardMaterial({
          map: cloned,
          roughness: 0.95,
          metalness: 0.0,
        });
      }
      return new THREE.MeshStandardMaterial({ color: '#1f1f1f', roughness: 0.95 });
    }),
  [buildingTextures]);

  // 배경 빌딩 머티리얼 — BG_BUILDINGS와 1:1 매핑
  const bgMaterials = useMemo(() =>
    BG_BUILDINGS.map(b => {
      const tex = buildingTextures[b.texSeed % BUILDING_TEX_META.length];
      if (tex) {
        const cloned = tex.clone();
        cloned.needsUpdate = true;
        return new THREE.MeshStandardMaterial({
          map: cloned,
          roughness: 0.9,
          metalness: 0.0,
        });
      }
      return new THREE.MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.9 });
    }),
  [buildingTextures]);

  // 세그먼트별 머티리얼 — repeatX 반영
  const segmentMaterials = useMemo(() =>
    WALL_SEGMENTS.map(seg => {
      const tex = buildingTextures[seg.texIndex];
      if (tex) {
        const cloned = tex.clone();
        cloned.repeat.set(seg.repeatX, 1.0);
        cloned.needsUpdate = true;
        return new THREE.MeshStandardMaterial({
          map: cloned,
          roughness: 0.9,
          metalness: 0.0,
        });
      }
      return new THREE.MeshStandardMaterial({
        color: '#888888',
        roughness: 0.9,
        metalness: 0.0,
      });
    }),
  [buildingTextures]);

  return (
    <>
      {/* Floor */}
      <RigidBody type="fixed">
        <mesh name="floor_asphalt" rotation={[-Math.PI / 2, 0, 0]} position={[10 * SCALE_X, 0, -43 * SCALE_Z]}>
          <planeGeometry args={[50 * SCALE_X, 100 * SCALE_Z]} />
          <primitive object={asphaltMaterial} attach="material" />
        </mesh>
        <CuboidCollider args={[25 * SCALE_X, 0.1, 50 * SCALE_Z]} position={[10 * SCALE_X, -0.1, -43 * SCALE_Z]} />
      </RigidBody>

      {/* Walls — 세그먼트별 독립 3D 건물 박스 (높이·깊이 다양화) */}
      <group name="buildings">
      {WALL_DEFS.map(([cx, cz, w, d], wallIdx) => {
        const isHoriz = w > d; // 긴 축이 X면 가로 분할
        const segs = WALL_SEGMENTS.filter(s => s.wallIndex === wallIdx);
        const totalLen = isHoriz ? w : d;
        // 바깥 방향 부호: 가로 벽은 z 부호, 세로 벽은 x 부호
        // (center 좌표가 음수 → 음수 방향이 "도로 안쪽"이므로 부호 유지)
        const outwardSignX = isHoriz ? 0 : (cx >= 0 ? 1 : -1);
        const outwardSignZ = isHoriz ? (cz >= 0 ? 1 : -1) : 0;
        return segs.map((seg, si) => {
          const globalIdx = WALL_SEGMENTS.indexOf(seg);
          const segIdx = SEG_INDEX_MAP.get(globalIdx) ?? si;
          const { height, buildingDepth } = getBuildingParams(wallIdx, segIdx);
          const mat = segmentMaterials[globalIdx];

          // 세그먼트 중심의 긴 축 오프셋 (정면 라인 기준)
          const localPos = seg.offsetX + seg.segW / 2 - totalLen / 2;

          // 가로 세그먼트: X = localPos, Z = depth/2 바깥 이동
          // 세로 세그먼트: Z = localPos, X = depth/2 바깥 이동
          const posX = cx + (isHoriz ? localPos : outwardSignX * buildingDepth / 2);
          const posZ = cz + (isHoriz ? outwardSignZ * buildingDepth / 2 : localPos);
          const posY = height / 2;

          // 박스 실 크기
          const boxW = isHoriz ? seg.segW : buildingDepth;
          const boxD = isHoriz ? buildingDepth : seg.segW;

          return (
            <RigidBody key={`${wallIdx}-${si}`} type="fixed" position={[posX, posY, posZ]}>
              <mesh name={`building-w${wallIdx}-s${segIdx}-tex${seg.texIndex}`}>
                <boxGeometry args={[boxW, height, boxD]} />
                <primitive object={mat} attach="material" />
              </mesh>
              <CuboidCollider args={[boxW / 2, height / 2, boxD / 2]} />
            </RigidBody>
          );
        });
      })}
      </group>

      {/* 메인 거리 빌딩 간판 — WALL_SEGMENTS 박스의 ~50%에 정면/옆구리/옥상 배치 */}
      <Ch2Signs buildings={SIGN_BUILDINGS} />

      {/* 배경 빌딩 layer — outer wall 너머 5~12m 뒤로 솟은 빌딩. 콜라이더 없음 */}
      <group name="bg_buildings">
      {BG_BUILDINGS.map((b, i) => (
        <mesh key={`bg-${i}`} name={`bg_building-${String(i).padStart(2, '0')}`} position={[b.x, b.h / 2, b.z]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <primitive object={bgMaterials[i]} attach="material" />
        </mesh>
      ))}
      </group>

      {/* 원경 layer — 4방향 클러스터, 30~80m 고층빌딩. fog silhouette */}
      <group name="far_buildings">
      {FAR_BUILDINGS.map((b, i) => (
        <mesh key={`far-${i}`} name={`far_building-${String(i).padStart(2, '0')}`} position={[b.x, b.h / 2, b.z]}>
          <boxGeometry args={[b.w, b.h, b.d]} />
          <primitive object={farMaterials[i]} attach="material" />
        </mesh>
      ))}
      </group>

      {/* 노면 글씨 — ground보다 0.01 위, z-fighting 방지 */}
      <RoadMarkings />

      {/* Decorative props (no colliders needed) */}
      <group name="legacy_decor">
      {DECOR.map((obj, i) => (
        <mesh key={i} name={`legacy_decor-${String(i).padStart(2, '0')}`} position={[obj.x, obj.h / 2, obj.z]}>
          <boxGeometry args={[obj.w, obj.h, obj.d]} />
          <meshStandardMaterial color={obj.color} />
        </mesh>
      ))}
      </group>

      {/* Exit marker — CH3 door (DOOR0009.png, 480×640 → 3×4 world units) */}
      <mesh position={[0, 2, -87 * SCALE_Z]}>
        <boxGeometry args={[3, 4, 0.3]} />
        <primitive object={doorMaterial} attach="material" />
      </mesh>
    </>
  );
};

// ---------- Physics ready gate ----------
// Rapier crashes when world.castRay() is called in the very first frames.
// Let Physics step for MIN_SETTLE_FRAMES before enabling ecctrl controls.
const MIN_SETTLE_FRAMES = 10;

const PhysicsReadyGate: React.FC<{ onReady: () => void }> = ({ onReady }) => {
  const frameCount = useRef(0);
  const notified = useRef(false);
  useFrame(() => {
    if (notified.current) return;
    frameCount.current += 1;
    if (frameCount.current >= MIN_SETTLE_FRAMES) {
      notified.current = true;
      onReady();
    }
  });
  return null;
};

// ---------- Physics scene (only mounts after main FBX is cached) ----------
// useFBX here suspends at this component level, so <Suspense> above catches it.
// When it resolves, Physics mounts once and stays mounted — no more Rapier remount crash.

const Ch2PhysicsScene: React.FC<{
  airportActive: boolean;
  onAirportTrigger: () => void;
  onExitZoneChange: (inZone: boolean) => void;
  freezeControls: boolean;
}> = ({ airportActive, onAirportTrigger, onExitZoneChange, freezeControls }) => {
  // Suspends here until main FBX is cached — Physics only mounts after this resolves.
  // PlayerCharacter's own useFBX call then hits the warm cache and never re-suspends.
  useFBX(MAIN_FBX_URL);

  const [physicsReady, setPhysicsReady] = useState(false);
  const handlePhysicsReady = useCallback(() => setPhysicsReady(true), []);
  const [ch2Toggles] = useCh2Toggles();
  const ecctrlRef = useRef<CustomEcctrlRigidBody>(null);

  // freeze 시작/지속 동안 잔류 momentum 제거 — Ecctrl의 disableControl/maxVelLimit는
  // 새 입력만 막고 기존 linvel을 유지함. 비행기 컷씬 중에도 캐릭터가 미끄러지는 원인.
  useEffect(() => {
    if (!freezeControls) return;
    const zero = { x: 0, y: 0, z: 0 };
    const stop = () => {
      const rb = ecctrlRef.current?.group;
      if (!rb) return;
      rb.setLinvel(zero, true);
      rb.setAngvel(zero, true);
    };
    stop();
    const id = setInterval(stop, 33); // 매 프레임 강제 0 — Ecctrl 내부 impulse 누적 차단
    return () => clearInterval(id);
  }, [freezeControls]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'ArrowUp' && e.code !== 'KeyW') return;
      console.log('[CH2][INPUT] keydown', {
        code: e.code,
        t: performance.now(),
        physicsReady,
        freezeControls,
      });
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== 'ArrowUp' && e.code !== 'KeyW') return;
      console.log('[CH2][INPUT] keyup', {
        code: e.code,
        t: performance.now(),
        physicsReady,
        freezeControls,
      });
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [physicsReady, freezeControls]);

  useEffect(() => {
    console.log('[CH2][STATE] physicsReady changed', {
      physicsReady,
      t: performance.now(),
    });
  }, [physicsReady]);

  return (
    <Physics>
      <PhysicsReadyGate onReady={handlePhysicsReady} />
      <StreetScene />

      {/* STEP 2: NPCs along the S-curve */}
      <group name="npcs">
      {NPC_POSITIONS.map((npc, i) => (
        <NPC
          key={i}
          position={[npc.x, 0, npc.z]}
          isSpecial={npc.isSpecial}
        />
      ))}
      </group>

      {/* 떨어진 쪽지 — 패닉어택 슈퍼스타 시 5편 */}
      <group name="notes">
      {NOTE_POSITIONS.map(n => (
        <Note key={n.id} noteId={n.id} position={n.worldPos} />
      ))}
      </group>

      {/* 거리 데코 — electric-box / trashes / concrete-pile / 도시 단편 */}
      {ch2Toggles.showDecor && <Ch2Decor />}

      {/* AI Hub 71559 도로교통 시설 — 표지판·신호등·가로등·우체통 등 */}
      {ch2Toggles.showAihub && (
        <Suspense fallback={null}>
          <Ch2AihubProps />
        </Suspense>
      )}

      {/* STEP 1: Signposts + movement tracking */}
      <MovementTracker />
      <SignpostManager />

      {/* STEP 3: Distance-based spatial sound */}
      <Ch2SoundManager />

      <KeyboardControls map={keyboardMap}>
        {physicsReady && (
          <Ecctrl
            ref={ecctrlRef}
            camInitDis={-2.5}
            camMaxDis={-3.5}
            camMinDis={-1.2}
            camInitDir={{ x: 0.25, y: Math.PI }}
            camTargetPos={{ x: 0, y: 0.8, z: 0 }}
            characterInitDir={Math.PI}
            floatHeight={0.3}
            capsuleHalfHeight={0.5}
            capsuleRadius={0.2}
            maxVelLimit={freezeControls ? 0 : 5}
            jumpVel={2.5}
            camCollision={true}
            autoBalance={false}
            disableControl={freezeControls}
            position={[0, 2, -8]}
          >
            <PlayerCharacter airportActive={airportActive} />
          </Ecctrl>
        )}
      </KeyboardControls>

      <TriggerWatcher
        onAirportTrigger={onAirportTrigger}
        onExitZoneChange={onExitZoneChange}
        disabled={!physicsReady || freezeControls}
      />
    </Physics>
  );
};

// ---------- Inner scene (inside Canvas) ----------

const Ch2Inner: React.FC<{
  airportActive: boolean;
  onAirportTrigger: () => void;
  onExitZoneChange: (inZone: boolean) => void;
  freezeControls: boolean;
}> = ({ airportActive, onAirportTrigger, onExitZoneChange, freezeControls }) => {
  return (
    <>
      <color attach="background" args={['#0a0a0a']} />
      {/* STEP 9: Procedural cloud sky (REF-9) */}
      <CloudSkyBackground
        skycolor1={[0.15, 0.2, 0.35]}
        skycolor2={[0.25, 0.35, 0.5]}
        cloudcover={0.35}
        clouddark={0.7}
      />

      <FlickerLight />
      <hemisphereLight skyColor="#c7e6ff" groundColor="#6a7683" intensity={0.9} />
      <directionalLight position={[10, 15, -40]} intensity={1.15} color="#f8fbff" />
      <directionalLight position={[-8, 10, 14]} intensity={0.75} color="#deeeff" />

      {/* STEP 8: Post-processing — fog + Vignette + Noise */}
      <Ch2Effects />

      {/* Suspense boundary: Physics only mounts after main FBX is cached.
          This prevents Rapier from crashing due to cold-cache FBX load mid-flight. */}
      <React.Suspense fallback={null}>
        <Ch2PhysicsScene
          airportActive={airportActive}
          onAirportTrigger={onAirportTrigger}
          onExitZoneChange={onExitZoneChange}
          freezeControls={freezeControls}
        />
      </React.Suspense>
    </>
  );
};

// ---------- Dev buttons ----------

const DevButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    onClick={(e) => { onClick(); e.currentTarget.blur(); }}
    style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 3, color: '#ddd', fontFamily: '"Unifont", monospace', fontSize: 11, padding: '4px 8px', cursor: 'pointer', textAlign: 'left' }}
    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
  >{label}</button>
);

// ---------- Main export ----------

export const Ch2Scene: React.FC = () => {
  const [airportActive, setAirportActive] = useState(false);
  const [atExit, setAtExit] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 3000);
    return () => clearTimeout(t);
  }, []);
  const goToChapter  = useGameStore(s => s.goToChapter);
  const activeNoteId = useGameStore(s => s.activeNoteId);
  const visitedEvents = useGameStore(s => s.visitedEvents);
  const openNote     = useGameStore(s => s.openNote);
  const devMode      = useDevMode();
  const [muted, toggleMute] = useMute();
  const [ch2Toggles, toggleCh2] = useCh2Toggles();
  const { play } = useSoundManager();

  const collectedNotes = CH2_NOTES.filter(n => visitedEvents.has(`note_${n.id}`)).length;
  const totalNotes = CH2_NOTES.length;

  const startAirport = useCallback(() => setAirportActive(true),  []);
  const endAirport   = useCallback(() => setAirportActive(false), []);

  const freezeControls = airportActive || activeNoteId !== null;

  // freeze 전환 시 held movement key 강제 release —
  // cutscene/모달 동안 누르고 있던 방향키가 안 풀려 끝난 뒤 계속 전진하는 문제 방지
  useEffect(() => {
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach(code => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    });
  }, [airportActive, activeNoteId]);

  const allNotesCollected = collectedNotes === totalNotes;

  // E key — confirm exit (only when in zone, all notes collected, no note open, no airport cutscene)
  useEffect(() => {
    if (!atExit || !allNotesCollected || activeNoteId !== null || airportActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'KeyE') {
        e.preventDefault();
        play('transition');
        goToChapter('CH3');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [atExit, allNotesCollected, activeNoteId, airportActive, goToChapter]);

  const showExitPrompt = atExit && activeNoteId === null && !airportActive;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <Canvas camera={{ fov: 75 }} style={{ background: '#0a0a0a' }}>
        <Ch2Inner
          airportActive={airportActive}
          onAirportTrigger={startAirport}
          onExitZoneChange={setAtExit}
          freezeControls={freezeControls}
        />
      </Canvas>

      <AirportCutscene active={airportActive} onDone={endAirport} />
      <NoteReader />

      {showExitPrompt && (
        <div style={{
          position: 'fixed',
          left: '50%',
          bottom: '14%',
          transform: 'translateX(-50%)',
          zIndex: 1500,
          fontFamily: '"Unifont", monospace',
          fontSize: 14,
          letterSpacing: 4,
          color: allNotesCollected ? '#f3eedd' : 'rgba(243,238,221,0.45)',
          background: 'rgba(0,0,0,0.65)',
          padding: '8px 18px',
          border: `1px solid ${allNotesCollected ? 'rgba(243,238,221,0.35)' : 'rgba(243,238,221,0.18)'}`,
          textShadow: '0 0 6px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          {allNotesCollected ? '[E] 들어가기' : `쪽지를 모두 모아야 들어갈 수 있습니다  (${collectedNotes}/${totalNotes})`}
        </div>
      )}

      {/* 쪽지 수집 슬롯 — 좌하단 HUD */}
      {!airportActive && (
        <div style={{
          position: 'fixed',
          left: 24,
          bottom: 24,
          zIndex: 1500,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          pointerEvents: 'none',
          userSelect: 'none',
          filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.8))',
        }}>
          {CH2_NOTES.map(n => {
            const collected = visitedEvents.has(`note_${n.id}`);
            return (
              <svg
                key={n.id}
                viewBox="0 0 24 32"
                width="18"
                height="24"
                style={{
                  opacity: collected ? 1 : 0.5,
                  cursor: collected ? 'pointer' : 'default',
                  pointerEvents: collected ? 'auto' : 'none',
                  transition: 'transform 0.15s ease',
                }}
                onClick={collected ? () => openNote(n.id) : undefined}
                onMouseEnter={collected ? (e) => { e.currentTarget.style.transform = 'scale(1.18)'; } : undefined}
                onMouseLeave={collected ? (e) => { e.currentTarget.style.transform = 'scale(1)'; } : undefined}
              >
                <path
                  d="M3 2 L17 2 L21 6 L21 30 L3 30 Z"
                  fill={collected ? '#ffffff' : 'transparent'}
                  stroke={collected ? '#ffffff' : '#a0a0a0'}
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path
                  d="M17 2 L17 6 L21 6"
                  fill="none"
                  stroke={collected ? '#1a1a1a' : '#a0a0a0'}
                  strokeWidth="1.2"
                />
              </svg>
            );
          })}
        </div>
      )}

      {/* Mobile joystick — hidden per request */}
      {false && 'ontouchstart' in window && window.matchMedia('(pointer: coarse)').matches && <EcctrlJoystick />}

      {devMode && !airportActive && (
        <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 9999, background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '10px 14px', fontFamily: '"Unifont", monospace', fontSize: 11, color: '#ccc', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
          <div style={{ color: '#ff0', fontSize: 10, letterSpacing: 2, marginBottom: 2 }}>DEV MODE</div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <DevButton label="Airport Cutscene" onClick={() => { if (!airportActive) startAirport(); }} />
          <DevButton label="Skip → CH3" onClick={() => goToChapter('CH3')} />
          <DevButton label="Skip → CH1" onClick={() => goToChapter('CH1')} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <DevButton label={`Decor: ${ch2Toggles.showDecor ? 'ON' : 'OFF'}`} onClick={() => toggleCh2('showDecor')} />
          <DevButton label={`Aihub: ${ch2Toggles.showAihub ? 'ON' : 'OFF'}`} onClick={() => toggleCh2('showAihub')} />
          <DevButton label={`Signs Lineup: ${ch2Toggles.signsLineup ? 'ON' : 'OFF'}`} onClick={() => toggleCh2('signsLineup')} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <DevButton label={`Sound: ${muted ? 'OFF' : 'ON'}`} onClick={toggleMute} />
          <div style={{ color: '#555', fontSize: 9, marginTop: 2 }}>P to close</div>
        </div>
      )}

      {loading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: '#000',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: '#f3eedd',
          fontFamily: '"Unifont", monospace',
          animation: 'ch2LoadingFadeOut 0.25s ease-in 2.75s forwards',
        }}>
          <div style={{ fontSize: 26, marginBottom: 14, animation: 'ch2LoadingSpin 1s linear infinite' }}>↻</div>
          <div style={{ fontSize: 15, letterSpacing: 8, marginBottom: 56 }}>l o a d i n g . . .</div>
          <div style={{ fontSize: 13, lineHeight: 1.75, textAlign: 'center' }}>
            팁: 사정할 때 숨을 참으면 분출되는 액체가 더 멀리 날아갑니다.
          </div>
          <style>{`
            @keyframes ch2LoadingSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes ch2LoadingFadeOut { to { opacity: 0; } }
          `}</style>
        </div>
      )}
    </div>
  );
};
