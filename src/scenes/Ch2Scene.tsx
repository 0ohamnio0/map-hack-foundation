import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { KeyboardControls, useFBX, useAnimations, useKeyboardControls } from '@react-three/drei';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { Physics, RigidBody, CuboidCollider } from '@react-three/rapier';
import Ecctrl, { EcctrlJoystick } from 'ecctrl';
import { useGameStore } from '@/store/useGameStore';
import { useDevMode } from '@/hooks/useDevMode';
import { Ch2Effects } from '@/components/effects/ChapterEffects';
import { CloudSkyBackground } from '@/components/effects/CloudSkyBackground';
import { NPC } from '@/components/game/NPC';
import { SignpostManager, MovementTracker } from '@/components/game/SignpostManager';
import { Ch2SoundManager } from '@/components/game/Ch2SoundManager';
import { Note } from '@/components/game/Note';
import { NoteReader } from '@/components/game/NoteReader';
import { Ch2Decor } from '@/components/game/Ch2Decor';
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

// Decorative street objects — base values
const DECOR_RAW: { x: number; z: number; w: number; d: number; h: number; color: string }[] = [
  { x: -5, z: -6,  w: 0.15, d: 0.15, h: 3.5, color: '#aa8800' },
  { x: 5,  z: -16, w: 0.15, d: 0.15, h: 3.5, color: '#aa8800' },
  { x: -5, z: -26, w: 0.15, d: 0.15, h: 3.5, color: '#aa8800' },
  { x: 15, z: -35, w: 1.2,  d: 1.2,  h: 1.5, color: '#777' },
  { x: 25, z: -48, w: 0.15, d: 0.15, h: 3.5, color: '#aa8800' },
  { x: 10, z: -65, w: 1.5,  d: 1.0,  h: 1.2, color: '#777' },
  { x: -5, z: -78, w: 0.15, d: 0.15, h: 3.5, color: '#aa8800' },
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

// ---------- Street geometry + physics ----------

// 벽 PBR 텍스처 — wall-low-poly 팩에서 추출 (1024×1024)
// (wall.glb 직접 인스턴싱은 origin offset + scale 결합 시 위치 어긋남 + WebP 디코딩 이슈로 보류)
const WALL_TEX_BASE_URL  = `${BASE}assets/textures/wall_basecolor.jpg`;
const WALL_TEX_NORMAL_URL = `${BASE}assets/textures/wall_normal.png`;
const WALL_TEX_ROUGH_URL  = `${BASE}assets/textures/wall_roughness.jpg`;

useLoader.preload(THREE.TextureLoader, WALL_TEX_BASE_URL);
useLoader.preload(THREE.TextureLoader, WALL_TEX_NORMAL_URL);
useLoader.preload(THREE.TextureLoader, WALL_TEX_ROUGH_URL);

const StreetScene: React.FC = () => {
  // 벽 PBR 텍스처 — sRGB 색공간 + flipY=false (GLB UV 컨벤션) + UV repeat 2×1
  const wallBase  = useLoader(THREE.TextureLoader, WALL_TEX_BASE_URL);
  const wallNorm  = useLoader(THREE.TextureLoader, WALL_TEX_NORMAL_URL);
  const wallRough = useLoader(THREE.TextureLoader, WALL_TEX_ROUGH_URL);

  const wallMaterial = useMemo(() => {
    // BaseColor만 sRGB, normal/rough는 linear 유지
    wallBase.colorSpace = THREE.SRGBColorSpace;
    [wallBase, wallNorm, wallRough].forEach(t => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(2, 1);
      t.anisotropy = 4;
      t.needsUpdate = true;
    });
    return new THREE.MeshStandardMaterial({
      map: wallBase,
      normalMap: wallNorm,
      roughnessMap: wallRough,
      roughness: 1.0,
      metalness: 0.0,
    });
  }, [wallBase, wallNorm, wallRough]);

  return (
    <>
      {/* Floor */}
      <RigidBody type="fixed">
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[10 * SCALE_X, 0, -43 * SCALE_Z]}>
          <planeGeometry args={[50 * SCALE_X, 100 * SCALE_Z]} />
          <meshStandardMaterial color="#666" roughness={1} />
        </mesh>
        <CuboidCollider args={[25 * SCALE_X, 0.1, 50 * SCALE_Z]} position={[10 * SCALE_X, -0.1, -43 * SCALE_Z]} />
      </RigidBody>

      {/* Walls — boxGeometry + 콘크리트 PBR 머티리얼 (위치 절대 안 어긋남) */}
      {WALL_DEFS.map(([x, z, w, d], i) => (
        <RigidBody key={i} type="fixed" position={[x, WALL_HEIGHT / 2, z]}>
          <mesh material={wallMaterial}>
            <boxGeometry args={[w, WALL_HEIGHT, d]} />
          </mesh>
          <CuboidCollider args={[w / 2, WALL_HEIGHT / 2, d / 2]} />
        </RigidBody>
      ))}

      {/* Decorative props (no colliders needed) */}
      {DECOR.map((obj, i) => (
        <mesh key={i} position={[obj.x, obj.h / 2, obj.z]}>
          <boxGeometry args={[obj.w, obj.h, obj.d]} />
          <meshStandardMaterial color={obj.color} />
        </mesh>
      ))}

      {/* Exit marker */}
      <mesh position={[0, 1.5, -87 * SCALE_Z]}>
        <boxGeometry args={[3, 3, 0.3]} />
        <meshStandardMaterial color="#4a4" emissive="#0f0" emissiveIntensity={0.2} />
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
      {NPC_POSITIONS.map((npc, i) => (
        <NPC
          key={i}
          position={[npc.x, 0, npc.z]}
          isSpecial={npc.isSpecial}
        />
      ))}

      {/* 떨어진 쪽지 — 패닉어택 슈퍼스타 시 5편 */}
      {NOTE_POSITIONS.map(n => (
        <Note key={n.id} noteId={n.id} position={n.worldPos} />
      ))}

      {/* 거리 데코 — electric-box / trashes / concrete-pile / 도시 단편 */}
      <Ch2Decor />

      {/* STEP 1: Signposts + movement tracking */}
      <MovementTracker />
      <SignpostManager />

      {/* STEP 3: Distance-based spatial sound */}
      <Ch2SoundManager />

      <KeyboardControls map={keyboardMap}>
        {physicsReady && (
          <Ecctrl
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
  const goToChapter  = useGameStore(s => s.goToChapter);
  const activeNoteId = useGameStore(s => s.activeNoteId);
  const visitedEvents = useGameStore(s => s.visitedEvents);
  const openNote     = useGameStore(s => s.openNote);
  const devMode      = useDevMode();
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

      {/* Mobile joystick — touch devices only */}
      {'ontouchstart' in window && <EcctrlJoystick />}

      {devMode && !airportActive && (
        <div style={{ position: 'fixed', top: 12, left: 12, zIndex: 9999, background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '10px 14px', fontFamily: '"Unifont", monospace', fontSize: 11, color: '#ccc', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
          <div style={{ color: '#ff0', fontSize: 10, letterSpacing: 2, marginBottom: 2 }}>DEV MODE</div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <DevButton label="Airport Cutscene" onClick={() => { if (!airportActive) startAirport(); }} />
          <DevButton label="Skip → CH3" onClick={() => goToChapter('CH3')} />
          <DevButton label="Skip → CH1" onClick={() => goToChapter('CH1')} />
          <div style={{ color: '#555', fontSize: 9, marginTop: 2 }}>Q to close</div>
        </div>
      )}
    </div>
  );
};
