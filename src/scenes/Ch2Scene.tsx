import React, { useRef, useMemo, useEffect, useState, useCallback, Suspense } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { KeyboardControls, useFBX, useAnimations, useKeyboardControls, PerspectiveCamera } from '@react-three/drei';
import { r3f } from '@/lib/r3fTunnel';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { SceneExporter } from '@/components/dev/SceneExporter';
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
import { Note, SPARKLE_COLOR, DEFAULT_SPARKLE } from '@/components/game/Note';
import { NoteReader } from '@/components/game/NoteReader';
import { Ch2Decor } from '@/components/game/Ch2Decor';
import { Ch2AihubProps } from '@/components/game/Ch2AihubProps';
import { Ch2Signs, type SignBuilding } from '@/components/game/Ch2Signs';
import { Ch2FlatProps } from '@/components/game/Ch2FlatProps';
import { Ch2CustomBuildings } from '@/components/game/Ch2CustomBuildings';
import { Ch2Graffiti } from '@/components/game/Ch2Graffiti';
import { CameraOrbitOverride } from '@/components/game/CameraOrbitOverride';
import { Ch2CamCuts } from '@/components/game/Ch2CamCuts';
import { CH2_NOTES } from '@/data/ch2Notes';

const BASE = import.meta.env.BASE_URL;

const WALL_HEIGHT = 4;

/** Scale factors live in @/scenes/ch2Layout to keep Ch2Scene <-> SignpostManager
 *  free of a circular import. */
import { SCALE_X, SCALE_Z } from '@/scenes/ch2Layout';
import { FAR_BUILDINGS, type BgBuilding } from '@/scenes/ch2FarBuildings';
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

// Decorative street objects — base values
const DECOR_RAW: { x: number; z: number; w: number; d: number; h: number; color: string }[] = [
  // 초기 더미 그레이박스(#777) 2개 제거 — 실제 prop으로 대체됨
];
const DECOR = DECOR_RAW.map(o => ({ ...o, x: o.x * SCALE_X, z: o.z * SCALE_Z }));

// 공항 환각 트리거 — V2(3구간, base x∈[13,27] z -40→-60) 중앙
const AIRPORT_TRIGGER = { x: 20 * SCALE_X, z: -50 * SCALE_Z, radius: 4.5 * SCALE_X };

// 기존 aihub 우체통 prop (Ch2AihubProps PLACEMENTS: id RTF4201220801_0182L_01,
// pos [5,-85] → world x=5*SCALE_X, z=-85*SCALE_Z). 다가가면 [E] 편지 보내기
const MAILBOX = { x: 5 * SCALE_X, z: -85 * SCALE_Z, radius: 6 };
// 출구 문 위치(빌딩 면 z=-90*SCALE_Z+0.1, x=0) 기준 반경 — 카메라가 캐릭터
// 뒤로 ~3유닛 떨어지므로 반경을 넉넉히
const DOOR = { x: 0, z: -90 * SCALE_Z + 0.1, radius: 7 };
// '인터넷 / 70 90 생음악' 출입구 — 아주 가까이(벽에 부딪힐 만큼) 가면 evil laugh 랜덤 재생.
// target은 base [x,z] (SCALE 적용 전). 좌표는 dev HUD로 확정 (문 앞 플레이어 위치).
const INTERNET_DOOR = { x: -4.2 * SCALE_X, z: -39.0 * SCALE_Z, radius: 4 };
const EVIL_LAUGH_COOLDOWN = 2.6;  // 초 — 벽에 계속 붙어있으면 이 간격으로 반복
// VLALL 사운드 존 — 근접 시 vlall_1 재생 (진입 + 머물면 쿨다운 반복)
const VLALL_ZONE = { x: -5.1 * SCALE_X, z: -63.8 * SCALE_Z, radius: 4 };
const VLALL_COOLDOWN = 2.6;
// dev HUD가 읽는 플레이어 base 좌표 (TriggerWatcher가 매 프레임 기록)
const devPlayerPos = { x: 0, z: 0 };
const POSTAL_VIDEO = `${BASE}assets/video/letter.mp4`;
const AIRPORT_VIDEO = `${BASE}assets/video/airport.mp4`;

// STEP 2: NPC positions along the S-curve — base values
const NPC_POSITIONS_RAW: { x: number; z: number; isSpecial?: boolean }[] = [
  { x: -3, z: -8 },
  { x: 4,  z: -15 },
  { x: -2, z: -25 },
  { x: 18, z: -38 },
  { x: 8,  z: -34, isSpecial: true },  // "살아있는 척" 특수 NPC — 2구간(H1) 이동
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
// 공항 환각 픽셀라이즈 — CH.3 마트벽(WALL_PIXELIZE)과 동일한 블록 픽셀 룩.
// 가로 블록 수(작을수록 더 거침). backing canvas를 이 폭으로 그린 뒤 pixelated 업스케일.
const AIRPORT_PIX_COLS = 200;

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { play } = useSoundManager();

  // 공항 환각 영상 — active 동안 처음부터 재생, 끝나면 정지.
  // 사운드는 영상(muted)이 아니라 SoundManager SFX로 분리 재생 → 컷신 비주얼이 5.2s에 끝나도
  // 환각음은 Howler가 본래 길이(~7.85s) 끝까지 꼬리로 재생된다.
  useEffect(() => {
    // 환각음(SFX)은 video 엘리먼트 마운트 여부와 무관하게 active 시 재생.
    // video는 phase 세팅(아래 다른 effect) 후에야 렌더돼 이 effect 첫 실행 땐 videoRef.current가 null —
    // 과거엔 `if (!v) return`이 play까지 막아 환각음이 안 났다(영상은 autoPlay라 따로 떴음).
    if (active) play('airport_hallucination');
    const v = videoRef.current;
    if (!v) return;
    if (active) { v.currentTime = 0; v.play().catch(() => {}); }
    else { v.pause(); }
  }, [active, play]);

  useEffect(() => {
    if (!active) { setPhase(null); return; }
    setPhase('in');
    const t1 = setTimeout(() => setPhase('show'), AIRPORT_FADE);
    const t2 = setTimeout(() => setPhase('out'), AIRPORT_DURATION - AIRPORT_FADE);
    const t3 = setTimeout(() => { setPhase(null); onDone(); }, AIRPORT_DURATION);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [active, onDone]);

  // 픽셀라이즈 — 비디오를 작은 backing canvas에 nearest-neighbor로 그린 뒤
  // CSS image-rendering: pixelated 업스케일. CH.3 마트벽 UV-snap과 동일한 블록 룩.
  useEffect(() => {
    if (!phase) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    let stop = false;
    let raf = 0;
    const draw = () => {
      if (stop) return;
      const vw = v.videoWidth, vh = v.videoHeight;
      if (vw && vh) {
        const cols = AIRPORT_PIX_COLS;
        const rows = Math.max(1, Math.round(cols * window.innerHeight / window.innerWidth));
        if (c.width !== cols || c.height !== rows) { c.width = cols; c.height = rows; }
        ctx.imageSmoothingEnabled = false;
        // 뷰포트 비율에 맞춘 cover 크롭 (기존 objectFit: cover와 동일)
        const scale = Math.max(cols / vw, rows / vh);
        const sw = cols / scale, sh = rows / scale;
        ctx.drawImage(v, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, cols, rows);
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { stop = true; cancelAnimationFrame(raf); };
  }, [phase]);

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
    }}>
      {/* 비디오는 픽셀라이즈 소스로만 사용 — 화면엔 canvas를 띄움 (재생/사운드는 유지) */}
      <video
        ref={videoRef}
        src={AIRPORT_VIDEO}
        playsInline
        loop
        autoPlay
        muted
        style={{
          position: 'absolute', width: 2, height: 2, top: 0, left: 0,
          opacity: 0, pointerEvents: 'none',
        }}
      />
      {/* 공항 환각 = 픽셀라이즈된 영상. overlay 블렌드로 투명하게 겹침 */}
      <canvas
        ref={canvasRef}
        style={{
          // 전체화면 fill — backing이 뷰포트 비율이라 그대로 늘림. pixelated = 블록 픽셀
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          imageRendering: 'pixelated',
          mixBlendMode: 'screen',
          opacity: 0.2,
          pointerEvents: 'none',
          animation: 'airportGlowFlicker 0.16s steps(2, end) infinite',
        }}
      />
      <style>{`
        @keyframes airportGlowFlicker {
          0%   { box-shadow: 0 0 18px 4px rgba(159,208,255,0.55), 0 0 40px 10px rgba(120,180,255,0.30); }
          50%  { box-shadow: 0 0 8px 2px rgba(159,208,255,0.25), 0 0 22px 6px rgba(120,180,255,0.14); }
          100% { box-shadow: 0 0 26px 7px rgba(200,225,255,0.70), 0 0 56px 16px rgba(120,180,255,0.40); }
        }
      `}</style>
    </div>
  );
};

// ---------- Postal Cutscene (우체통 편지 영상) ----------

const PostalCutscene: React.FC<{ active: boolean; onEnded: () => void }> = ({ active, onEnded }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!active) { doneRef.current = false; return; }
    const v = videoRef.current;
    if (v) { v.currentTime = 0; v.play().catch(() => {}); }
  }, [active]);

  if (!active) return null;

  // 영상이 한 번만 끝/실패 콜백되도록 가드 (onEnded·onError 중복 방지)
  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onEnded();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: '#000' }}>
      <video
        ref={videoRef}
        src={POSTAL_VIDEO}
        autoPlay
        playsInline
        onEnded={finish}
        onError={finish}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

// ---------- CCTV Glitch (감시카메라 채널 전환 깜빡) ----------
// CCTV 컷 진입/복귀 순간에 짧게 깔려 하드컷 + 복귀 스왑(~200ms)을 가린다.

const CCTV_GLITCH_MS = 240;

const CctvGlitch: React.FC<{ flickerKey: number }> = ({ flickerKey }) => {
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    if (flickerKey === 0) return; // 초기 마운트엔 안 침
    setShowing(true);
    const t = setTimeout(() => setShowing(false), CCTV_GLITCH_MS);
    return () => clearTimeout(t);
  }, [flickerKey]);

  if (!showing) return null;

  return (
    <div
      key={flickerKey}
      style={{
        position: 'fixed', inset: 0, zIndex: 1800,
        pointerEvents: 'none',
        mixBlendMode: 'screen',
        animation: `cctvGlitchFlicker ${CCTV_GLITCH_MS}ms steps(1, end) forwards`,
      }}
    >
      <style>{`
        @keyframes cctvGlitchFlicker {
          0%   { background: #000; opacity: 1; }
          16%  { background: repeating-linear-gradient(0deg, #fff 0 2px, #000 2px 4px); opacity: 0.85; transform: translateY(-3px); }
          32%  { background: #0a0a0a; opacity: 1; }
          48%  { background: repeating-linear-gradient(0deg, #9fd0ff 0 1px, #000 1px 3px); opacity: 0.6; transform: translateY(2px); }
          64%  { background: #000; opacity: 0.9; }
          80%  { background: repeating-linear-gradient(0deg, #fff 0 1px, transparent 1px 5px); opacity: 0.4; }
          100% { background: transparent; opacity: 0; }
        }
      `}</style>
    </div>
  );
};

// ---------- Peek Pillarbox (건물 틈으로 훔쳐보기 페이크) ----------
// peek 컷 동안 화면 양옆에 검은 세로 블랙바 — 가운데 좁은 세로 슬릿만 보임.
// 안쪽 가장자리는 살짝 그라데이션으로 흐려 하드 사각형 티 안 나게.
const PeekBars: React.FC<{ active: boolean }> = ({ active }) => {
  if (!active) return null;
  const bar = (side: 'left' | 'right'): React.CSSProperties => ({
    position: 'fixed', top: 0, bottom: 0, [side]: 0, width: '31vw',
    background: '#000',
    boxShadow: side === 'left'
      ? '8px 0 18px 2px rgba(0,0,0,0.9)'
      : '-8px 0 18px 2px rgba(0,0,0,0.9)',
    zIndex: 1700, pointerEvents: 'none',
  });
  return (
    <>
      <div style={bar('left')} />
      <div style={bar('right')} />
    </>
  );
};

// ---------- Player Character (FBX + animations) ----------

const MAIN_FBX_URL = `${BASE}assets/characters_biped/Meshy_AI_biped/Meshy_AI_Animation_Walking_frame_rate_24.fbx`;
const IDLE_FBX_URL = `${BASE}assets/characters_biped/Meshy_AI_biped/Meshy_AI_Animation_Long_Breathe_and_Look_Around_frame_rate_24.fbx`;
const WALK_FBX_URL = `${BASE}assets/characters_biped/Meshy_AI_biped/Meshy_AI_Animation_Walking_frame_rate_24.fbx`;
const HEADACHE_FBX_URL = `${BASE}assets/characters_biped/Meshy_AI_biped/Meshy_AI_Animation_Headache_Relief_frame_rate_24.fbx`;
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
useLoader.preload(THREE.TextureLoader, DIFFUSE_URL);
useLoader.preload(THREE.TextureLoader, METALLIC_URL);
useLoader.preload(THREE.TextureLoader, NORMAL_URL);
useLoader.preload(THREE.TextureLoader, ROUGHNESS_URL);
// SkyBackdrop removed — replaced by CloudSkyBackground (REF-9)

const PlayerCharacter: React.FC<{ airportActive: boolean }> = ({ airportActive }) => {
  const groupRef = useRef<THREE.Group>(null);
  const activeActionRef = useRef<THREE.AnimationAction | null>(null);
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
  onMailboxZoneChange: (inZone: boolean) => void;
  disabled: boolean;
}> = ({ onAirportTrigger, onExitZoneChange, onMailboxZoneChange, disabled }) => {
  const triggerEvent = useGameStore(s => s.triggerEvent);
  const { play } = useSoundManager();
  const inExitRef = useRef(false);
  const inMailboxRef = useRef(false);
  const inDoorRef = useRef(false);
  const lastLaughRef = useRef(-Infinity);
  const inVlallRef = useRef(false);
  const lastVlallRef = useRef(-Infinity);

  useFrame(({ camera, clock }) => {
    // dev HUD용 좌표는 항상 기록 (disabled여도)
    devPlayerPos.x = camera.position.x / SCALE_X;
    devPlayerPos.z = camera.position.z / SCALE_Z;
    if (disabled) return;
    const px = camera.position.x;
    const pz = camera.position.z;

    // '인터넷' 출입구 — 근접 시 evil laugh 랜덤 재생. 진입 즉시 1회 + 머무르면 쿨다운 간격 반복
    const idx = px - INTERNET_DOOR.x;
    const idz = pz - INTERNET_DOOR.z;
    const inDoor = Math.sqrt(idx * idx + idz * idz) < INTERNET_DOOR.radius;
    if (inDoor && (!inDoorRef.current || clock.elapsedTime - lastLaughRef.current > EVIL_LAUGH_COOLDOWN)) {
      play(`evil_laugh_${1 + Math.floor(Math.random() * 5)}`);
      lastLaughRef.current = clock.elapsedTime;
    }
    inDoorRef.current = inDoor;

    // VLALL 사운드 존 — 근접 시 vlall_1 재생. 진입 즉시 1회 + 머무르면 쿨다운 간격 반복
    const vdx = px - VLALL_ZONE.x;
    const vdz = pz - VLALL_ZONE.z;
    const inVlall = Math.sqrt(vdx * vdx + vdz * vdz) < VLALL_ZONE.radius;
    if (inVlall && (!inVlallRef.current || clock.elapsedTime - lastVlallRef.current > VLALL_COOLDOWN)) {
      play('vlall_1');
      lastVlallRef.current = clock.elapsedTime;
    }
    inVlallRef.current = inVlall;

    // Airport hallucination — auto fire (one-shot via triggerEvent)
    const dx = px - AIRPORT_TRIGGER.x;
    const dz = pz - AIRPORT_TRIGGER.z;
    if (Math.sqrt(dx * dx + dz * dz) < AIRPORT_TRIGGER.radius) {
      if (triggerEvent('ch2_airport')) onAirportTrigger();
    }

    // Chapter exit zone — 문 위치 기준 반경 (confirmed by E key in Ch2Scene)
    const edx = px - DOOR.x;
    const edz = pz - DOOR.z;
    const inExit = Math.sqrt(edx * edx + edz * edz) < DOOR.radius;
    if (inExit !== inExitRef.current) {
      inExitRef.current = inExit;
      onExitZoneChange(inExit);
    }

    // Mailbox zone — proximity-only state, confirmed by E key in Ch2Scene
    const mdx = px - MAILBOX.x;
    const mdz = pz - MAILBOX.z;
    const inMailbox = Math.sqrt(mdx * mdx + mdz * mdz) < MAILBOX.radius;
    if (inMailbox !== inMailboxRef.current) {
      inMailboxRef.current = inMailbox;
      onMailboxZoneChange(inMailbox);
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
  [`${RM}speed-limit-30.webp`,   2,   -10,  2.4, 4.0],
  [`${RM}no-u-turn.webp`,       -2,   -22,  2.4, 3.6],
  [`${RM}straight-ahead.webp`,   2,   -35,  2.0, 4.8],
  [`${RM}school-zone-slow.webp`, 18,  -44,  4.0, 11.4],
  [`${RM}one-way.webp`,          20,  -58,  2.4, 3.2],
  [`${RM}crosswalk-caution.webp`,-2,  -75,  3.2, 4.0],
  [`${RM}terminus.webp`,          0,  -85,  2.4, 3.2],
  [`${RM}hmm.webp`,              -3,  -30,  1.6, 2.4],
  [`${RM}uh-uh.webp`,            22,  -50,  1.6, 2.4],
  [`${RM}disabled.webp`,        -4,   -70,  2.4, 3.2],
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
        const slug = url.split('/').pop()?.replace('.webp', '') ?? `marking-${i}`;
        return (
          <mesh
            key={i}
            name={`road_marking-${String(i).padStart(2, '0')}-${slug}`}
            rotation={[-Math.PI / 2, 0, 0]}
            position={[bx * SCALE_X, 0.01, bz * SCALE_Z]}
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
  // building-787 / building-814 는 투명 컷아웃 — 불투명 시드 풀에서 제외하고
  // Ch2CustomBuildings에서만 경로로 직접 로드 (여기 두면 일반 빌딩 면에 검은배경 발림)
];

// 폐허/잔해 텍스처 — 정형 박스 대신 '잔해 무더기'로 렌더 + 간판 배치 제외
const RUIN_SLUGS = new Set(['building-233', 'building-234', 'building-235', 'building-236']);
const RUIN_TEX_INDICES = new Set(
  BUILDING_TEX_META.map((m, i) => (RUIN_SLUGS.has(m.slug) ? i : -1)).filter(i => i >= 0),
);

// building-814 매핑 대상 — 이 base 좌표에 '가장 가까운 단일 WALL 세그먼트'에만 적용
// (반경 매칭은 도로 맞은편 건물까지 잡혀 1채만 선택하도록 변경)
const B814_TARGET: [number, number] = [12, -68];
const B814_FWD = 6; // 814 박스를 도로쪽으로 미는 양(앞 얇은 건물 가림 회피, world units)

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

  // 폐허는 맵 전체에서 최대 2곳만 — 초과분은 일반 건물 텍스처로 복구
  let ruinUsed = 0;
  const RUIN_MAX = 2;

  WALL_DEFS.forEach(([, , w, d], wallIdx) => {
    // 긴 축 길이 결정: w > d 이면 가로 분할, 아니면 depth 방향 분할
    const totalLen = w > d ? w : d;
    let filled = 0;
    let segIdx = 0;
    while (filled < totalLen) {
      let tIdx = pickTex(wallIdx, segIdx);
      if (RUIN_TEX_INDICES.has(tIdx)) {
        if (ruinUsed < RUIN_MAX) {
          ruinUsed++;
        } else {
          // 초과 폐허 → 가장 가까운 비-폐허 텍스처로 치환 (일반 건물 복구)
          let s = (tIdx + 1) % BUILDING_TEX_META.length;
          while (RUIN_TEX_INDICES.has(s)) s = (s + 1) % BUILDING_TEX_META.length;
          tIdx = s;
        }
      }
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

// 타깃 base 좌표에 가장 가까운 비-폐허 WALL 세그먼트의 globalIdx
function nearestSeg(target: [number, number]): number {
  let best = -1;
  let bestD = Infinity;
  WALL_DEFS.forEach(([cx, cz, w, d], wallIdx) => {
    const isHoriz = w > d;
    const segs = WALL_SEGMENTS.filter(s => s.wallIndex === wallIdx);
    const totalLen = isHoriz ? w : d;
    const outwardSignX = isHoriz ? 0 : (cx >= 0 ? 1 : -1);
    const outwardSignZ = isHoriz ? (cz >= 0 ? 1 : -1) : 0;
    segs.forEach((seg, si) => {
      if (RUIN_TEX_INDICES.has(seg.texIndex)) return;
      const globalIdx = WALL_SEGMENTS.indexOf(seg);
      const segIdx = SEG_INDEX_MAP.get(globalIdx) ?? si;
      const { buildingDepth } = getBuildingParams(wallIdx, segIdx);
      const localPos = seg.offsetX + seg.segW / 2 - totalLen / 2;
      const posX = cx + (isHoriz ? localPos : outwardSignX * buildingDepth / 2);
      const posZ = cz + (isHoriz ? outwardSignZ * buildingDepth / 2 : localPos);
      const dist = Math.hypot(posX / SCALE_X - target[0], posZ / SCALE_Z - target[1]);
      if (dist < bestD) { bestD = dist; best = globalIdx; }
    });
  });
  return best;
}
// 특정 텍스처 slug이 발린 비-폐허 세그먼트 중 ref base좌표에 가장 가까운 것의 base [x,z]
function segCoordByTexNear(slug: string, ref: [number, number]): [number, number] | null {
  const tIdx = BUILDING_TEX_META.findIndex(m => m.slug === slug);
  if (tIdx < 0) return null;
  let best: [number, number] | null = null;
  let bestD = Infinity;
  WALL_DEFS.forEach(([cx, cz, w, d], wallIdx) => {
    const isHoriz = w > d;
    const segs = WALL_SEGMENTS.filter(s => s.wallIndex === wallIdx);
    const totalLen = isHoriz ? w : d;
    const outwardSignX = isHoriz ? 0 : (cx >= 0 ? 1 : -1);
    const outwardSignZ = isHoriz ? (cz >= 0 ? 1 : -1) : 0;
    segs.forEach((seg, si) => {
      if (seg.texIndex !== tIdx || RUIN_TEX_INDICES.has(seg.texIndex)) return;
      const globalIdx = WALL_SEGMENTS.indexOf(seg);
      const segIdx = SEG_INDEX_MAP.get(globalIdx) ?? si;
      const { buildingDepth } = getBuildingParams(wallIdx, segIdx);
      const localPos = seg.offsetX + seg.segW / 2 - totalLen / 2;
      const posX = cx + (isHoriz ? localPos : outwardSignX * buildingDepth / 2);
      const posZ = cz + (isHoriz ? outwardSignZ * buildingDepth / 2 : localPos);
      const bx = posX / SCALE_X, bz = posZ / SCALE_Z;
      const dd = Math.hypot(bx - ref[0], bz - ref[1]);
      if (dd < bestD) { bestD = dd; best = [bx, bz]; }
    });
  });
  return best;
}
// IMG_0822 → building-267 텍스처 건물 (옛 위치서 제일 먼 곳 = Aihub#9 [20,-67] 인근)
// building-267 배정 세그먼트: [8.7,-17.7] / [24.0,-71.6] / [-8.1,-70.0] → [24,-71.6] 선택
const IMG0822_TARGET: [number, number] = segCoordByTexNear('building-267', [20, -67]) ?? [24, -71.6];

const B814_SEG = nearestSeg(B814_TARGET);          // building-814 (보류, 미렌더)
const TTZZ_TARGET: [number, number] = [22, -65];   // SCR-ttzz 건물 ≈ Aihub #4
const TTZZ_SEG = nearestSeg(TTZZ_TARGET);          // ttzz 간판 제외 → 타 빌딩 이동

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
      if (RUIN_TEX_INDICES.has(seg.texIndex)) return; // 폐허 빌딩엔 간판 X (자동 타 빌딩 이동)
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
        noSign: globalIdx === B814_SEG || globalIdx === TTZZ_SEG || undefined, // 814·ttzz 건물 간판 제외 → 타 빌딩 이동
      });
    });
  });
  return out;
})();

// 가장 낮은 빌딩 (도로반사경을 그 윗면에 올림)
const LOWEST_BLDG = SIGN_BUILDINGS.reduce(
  (a, b) => (b.h < a.h ? b : a), SIGN_BUILDINGS[0],
);

// 도로반사경(IMG_0812) — 제일 낮은 빌딩 윗면, 약간 우측 치우침, x2 크기
const MIRROR_URL = `${BASE}assets/tex/props/IMG_0812.webp`;
const MIRROR_W = 5.8;                          // 보정 기준(2.9) x2
const MIRROR_H = MIRROR_W * (1500 / 1081);     // IMG_0812 aspect
const Ch2RoofMirror: React.FC = () => {
  const tex = useLoader(THREE.TextureLoader, MIRROR_URL);
  const mat = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return new THREE.MeshStandardMaterial({
      map: tex, transparent: true, alphaTest: 0.1,
      roughness: 0.85, metalness: 0.05, side: THREE.DoubleSide,
    });
  }, [tex]);
  const b = LOWEST_BLDG;
  if (!b) return null;
  // 빌딩 정면(faceX,faceZ) 기준 오른쪽 = (faceZ, -faceX)
  const rOff = 0.28 * b.w;
  const x = b.cx + b.faceZ * rOff;
  const z = b.cz - b.faceX * rOff;
  const y = b.h + MIRROR_H / 2;
  const rotY = Math.atan2(b.faceX, b.faceZ);
  return (
    <mesh position={[x, y, z]} rotation={[0, rotY, 0]} material={mat} castShadow>
      <planeGeometry args={[MIRROR_W, MIRROR_H]} />
    </mesh>
  );
};

// 스택 간판(레이어2) — TTZZ 건물 좌측면 상단에 부착 (실제 빌딩 지오메트리 기준)
const TTZZ_BLDG = SIGN_BUILDINGS.reduce(
  (a, b) => (
    Math.hypot(b.cx / SCALE_X - TTZZ_TARGET[0], b.cz / SCALE_Z - TTZZ_TARGET[1]) <
    Math.hypot(a.cx / SCALE_X - TTZZ_TARGET[0], a.cz / SCALE_Z - TTZZ_TARGET[1]) ? b : a
  ),
  SIGN_BUILDINGS[0],
);
const STACK_URL = `${BASE}assets/tex/props/signboard-stack.webp`;
const Ch2StackSign: React.FC = () => {
  const tex = useLoader(THREE.TextureLoader, STACK_URL);
  const mat = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return new THREE.MeshStandardMaterial({
      map: tex, transparent: true, alphaTest: 0.1,
      roughness: 0.9, side: THREE.DoubleSide,
    });
  }, [tex]);
  const b = TTZZ_BLDG;
  if (!b) return null;
  // 좌측면 = 정면(faceX,faceZ)에 수직 왼쪽 = (-faceZ, faceX)
  const sx = -b.faceZ;
  const sz = b.faceX;
  const sideHalf = b.faceX !== 0 ? b.d / 2 : b.w / 2;
  const planeH = b.h * 0.5;
  const planeW = planeH * (738 / 1127);
  const x = b.cx + sx * (sideHalf + 0.06);
  const z = b.cz + sz * (sideHalf + 0.06);
  const y = b.h - planeH / 2 - 0.4;            // 상단
  const rotY = Math.atan2(sx, sz);
  return (
    <mesh position={[x, y, z]} rotation={[0, rotY, 0]} material={mat} castShadow>
      <planeGeometry args={[planeW, planeH]} />
    </mesh>
  );
};

// 지정 건물 고정 부착 사인 — target base 최근접 빌딩의 지정 면에. 자동 사인계와 분리.
type PinnedSign = {
  id: string; url: string; target: [number, number];
  face: 'front' | 'left' | 'right'; hFrac: number; aspectWH: number;
  yMode: 'ground' | 'top' | 'mid' | 'floor';  // floor = 이미지 하단이 바닥(y=0)에 정확히 닿음
  yFrac?: number;  // 지정 시 y = 빌딩높이 × yFrac (yMode 무시) — 미세 높이 조정용
  align?: 'left' | 'right';  // 벽(빌딩 면) 좌/우 끝에 plane 가장자리를 flush 정렬
  xFrac?: number;  // 가로 미세 이동 (면 폭 대비 비율, + = 플레이어 시점 오른쪽)
};
const PINNED_SIGNS: PinnedSign[] = [
  // SCR-ttfj — Aihub#7 벤치([-6,-38])가 바라보는 길 건너 건물 정면 (입구형: 지면 정렬)
  { id: 'ttfj', url: `${BASE}assets/tex/signs/SCR-20260513-ttfj.webp`, target: [-2, -38], face: 'front', hFrac: 0.6, aspectWH: 731 / 902, yMode: 'ground' }, // [7,-38]에서 서측 -2채
  // SCR-tuvg — ttfj 건물에서 -1채 (서측), 정면
  { id: 'tuvg', url: `${BASE}assets/tex/signs/SCR-20260513-tuvg.webp`, target: [-7, -20], face: 'front', hFrac: 0.28, aspectWH: 718 / 612, yMode: 'mid' }, // 서측벽, [-24]·[-17] 사이 건물, 0.7배
  // 셔터문 1776781721572 — 다시 -1채, 입구이미지 방식(정면·지면)
  { id: 'shutter', url: `${BASE}assets/tex/signs/1776781721572_tutvpw0yz8.webp`, target: [-11, -38], face: 'front', hFrac: 0.39, aspectWH: 1080 / 870, yMode: 'ground' }, // 1.3배, 하단 정중앙
  // 1776932608987 입구 이미지 — 초기 target 임시값, dev 클릭 로그로 정확 건물 확정 예정
  { id: 'door-1776932', url: `${BASE}assets/tex/signs/1776932608987_alatxeoo5uj.webp`, target: [7, -50], face: 'front', hFrac: 0.85, aspectWH: 811 / 1080, yMode: 'ground' },
  // IMG_0817 가로 간판 — 초기 target 임시값, dev 클릭 로그로 정확 건물 확정 예정
  { id: 'img0817', url: `${BASE}assets/tex/signs/IMG_0817.webp`, target: [-7, -30], face: 'front', hFrac: 0.3, aspectWH: 1500 / 894, yMode: 'top' },
  // IMG_0822 — building-219 텍스처 건물 정면(런타임 산출 좌표)
  { id: 'img0822', url: `${BASE}assets/tex/props/IMG_0822.webp`, target: IMG0822_TARGET, face: 'front', hFrac: 0.5, aspectWH: 1500 / 986, yMode: 'mid' },
  // 1778130927141 유리 현관문 — 자동배치서 겹쳐 PINNED 이관. target 임시값, dev 클릭 로그로 sign 없는 건물 확정 예정
  { id: 'door-1778', url: `${BASE}assets/tex/signs/1778130927141_drxo7cvrpnl.webp`, target: [7, -60], face: 'front', hFrac: 0.85, aspectWH: 810 / 1080, yMode: 'ground' },
  // Desktop/pics 사진 6장 — S자 경로 전체 빈 벽면에 분산. target은 빈 facade 근사값, dev 클릭 로그로 미세조정 가능
  { id: 'pic-0728', url: `${BASE}assets/tex/pics/IMG_0728.webp`, target: [7, -10],  face: 'front', hFrac: 0.4,  aspectWH: 4304 / 3024, yMode: 'mid' },   // V1 동측, 초입
  { id: 'pic-0841', url: `${BASE}assets/tex/pics/IMG_0841.webp`, target: [10, -40], face: 'front', hFrac: 0.04, aspectWH: 1996 / 1398, yMode: 'mid' },   // H1 내벽(wall8) — 길 향함 (1/10 축소)
  { id: 'pic-0843', url: `${BASE}assets/tex/pics/IMG_0843.webp`, target: [27, -48], face: 'front', hFrac: 0.071, aspectWH: 3024 / 4032, yMode: 'mid', yFrac: 0.167 },   // V2 동측 외벽 (1/7 축소, 높이 1/3)
  { id: 'pic-0849', url: `${BASE}assets/tex/pics/IMG_0849.webp`, target: [28, -38], face: 'front', hFrac: 0.5,  aspectWH: 3024 / 3855, yMode: 'floor' }, // 돌벽 building-257, 바닥 닿음
  { id: 'pic-0844', url: `${BASE}assets/tex/pics/IMG_0844.webp`, target: [-9, -5],  face: 'front', hFrac: 0.44, aspectWH: 3388 / 5138, yMode: 'mid' },   // 돌벽 building-258, V1 입구 서측 (0.8배)
  { id: 'pic-0852', url: `${BASE}assets/tex/pics/IMG_0852.webp`, target: [6, -16.2], face: 'front', hFrac: 0.64, aspectWH: 6098 / 3201, yMode: 'floor', align: 'left' }, // V1 동측(wall1) 길 향함, 바닥 닿음, 벽 왼쪽 끝 정렬 (파노라마, 2배)
];
const PinnedSignMesh: React.FC<{ p: PinnedSign }> = ({ p }) => {
  const tex = useLoader(THREE.TextureLoader, p.url);
  const mat = useMemo(() => {
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    return new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.1, roughness: 0.9, side: THREE.DoubleSide });
  }, [tex]);
  const b = SIGN_BUILDINGS.reduce(
    (a, c) => (
      Math.hypot(c.cx / SCALE_X - p.target[0], c.cz / SCALE_Z - p.target[1]) <
      Math.hypot(a.cx / SCALE_X - p.target[0], a.cz / SCALE_Z - p.target[1]) ? c : a
    ), SIGN_BUILDINGS[0]);
  if (!b) return null;
  // 면 노멀: front=(faceX,faceZ), left=(-faceZ,faceX), right=(faceZ,-faceX)
  const nx = p.face === 'front' ? b.faceX : p.face === 'left' ? -b.faceZ : b.faceZ;
  const nz = p.face === 'front' ? b.faceZ : p.face === 'left' ? b.faceX : -b.faceX;
  const half = Math.abs(nx) > 0.5 ? b.w / 2 : b.d / 2;
  const planeH = b.h * p.hFrac;
  const planeW = planeH * p.aspectWH;
  const y = p.yFrac != null ? b.h * p.yFrac : p.yMode === 'floor' ? planeH / 2 : p.yMode === 'ground' ? planeH / 2 - 1.5 : p.yMode === 'top' ? b.h - planeH / 2 - 0.3 : b.h / 2;
  // 벽 따라 가로 이동 — 면 노멀(nx,nz)에 수직인 수평 tangent. +방향 = 플레이어 시점 오른쪽.
  const frontWidth = Math.abs(nx) > 0.5 ? b.d : b.w;
  const tx = -nz, tz = nx;
  let shift = (p.xFrac ?? 0) * frontWidth;
  if (p.align === 'right') shift += (frontWidth - planeW) / 2;
  else if (p.align === 'left') shift -= (frontWidth - planeW) / 2;
  const x = b.cx + nx * (half + 0.06) + tx * shift;
  const z = b.cz + nz * (half + 0.06) + tz * shift;
  return (
    <mesh position={[x, y, z]} rotation={[0, Math.atan2(nx, nz), 0]} material={mat} castShadow>
      <planeGeometry args={[planeW, planeH]} />
    </mesh>
  );
};
const Ch2PinnedSigns: React.FC = () => (<>{PINNED_SIGNS.map(p => <PinnedSignMesh key={p.id} p={p} />)}</>);

const ASPHALT_TEX_URL = `${BASE}assets/tex/full/ASPHALT2.webp`;
const DOOR09_TEX_URL = `${BASE}assets/tex/doors/door-09.webp`;
const B814_FRONT_URL = `${BASE}assets/tex/building/building-814-front.webp`;
const B814_SIDE_URL = `${BASE}assets/tex/building/building-814-side.webp`;

// 폐허 텍스처 세그먼트 — 그냥 낮은 육면체 (정상 높이의 35~55%, 주변보다 낮음)
const RubbleMound: React.FC<{ boxW: number; boxD: number; height: number; mat: THREE.Material; seed: number }>
  = ({ boxW, boxD, height, mat, seed }) => {
  const lcg = (n: number) => (((n * 1664525 + 1013904223) & 0x7fffffff) / 0x7fffffff);
  const bodyH = height * (0.35 + lcg(seed) * 0.20);
  return (
    <>
      <mesh position={[0, bodyH / 2, 0]} material={mat} castShadow receiveShadow>
        <boxGeometry args={[boxW, bodyH, boxD]} />
      </mesh>
      <CuboidCollider args={[boxW / 2, bodyH / 2, boxD / 2]} position={[0, bodyH / 2, 0]} />
    </>
  );
};

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

  // building-814 코너 건물 — 정면(레이어3)/좌측면(레이어4) 텍스처
  const [b814Front, setB814Front] = useState<THREE.Texture | null>(null);
  const [b814Side, setB814Side] = useState<THREE.Texture | null>(null);
  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    loader.loadAsync(B814_FRONT_URL).then(t => { if (!cancelled) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; setB814Front(t); } }).catch(() => {});
    loader.loadAsync(B814_SIDE_URL).then(t => { if (!cancelled) { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; setB814Side(t); } }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const b814Mats = useMemo(() => {
    // 불투명 — 건물 면을 꽉 채우는 표면 텍스처(컷아웃 구멍 X)
    const front = new THREE.MeshStandardMaterial({ map: b814Front ?? undefined, roughness: 0.9 });
    const side = new THREE.MeshStandardMaterial({ map: b814Side ?? undefined, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: 0.95 });
    return { front, side, dark };
  }, [b814Front, b814Side]);
  // 박스 6면 [+X0,-X1,+Y2,-Y3,+Z4,-Z5]. 정면=도로면(faceX/faceZ),
  // 측면=정면에 수직인 두 면 모두(코너에서 어느 쪽이 보이든 측면 이미지 보장).
  const make814Array = (faceX: number, faceZ: number): THREE.Material[] => {
    const a: THREE.Material[] = [b814Mats.dark, b814Mats.dark, b814Mats.dark, b814Mats.dark, b814Mats.dark, b814Mats.dark];
    // front↔side 스왑: 도로면=side 이미지, 수직 양면=front 이미지
    if (faceX !== 0) {
      a[faceX === 1 ? 0 : 1] = b814Mats.side;  // 도로쪽 X면
      a[4] = b814Mats.front;                   // +Z 면
      a[5] = b814Mats.front;                   // -Z 면
    } else {
      a[faceZ === 1 ? 4 : 5] = b814Mats.side;  // 도로쪽 Z면
      a[0] = b814Mats.front;                   // +X 면
      a[1] = b814Mats.front;                   // -X 면
    }
    return a;
  };

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
      const url = `${BASE}assets/tex/building/${BUILDING_TEX_META[i].slug}.webp`;
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

          const isRuin = RUIN_TEX_INDICES.has(seg.texIndex);
          const is814 = !isRuin && globalIdx === B814_SEG;
          if (is814) return null; // building-814 보류 — 해당 건물 자체 미렌더
          const arr814: THREE.Material[] | null = null;
          // 814 박스는 도로쪽으로 B814_FWD 만큼 밀어 앞 얇은 건물 가림 회피
          const b814Pos: [number, number, number] = arr814
            ? [posX + (-outwardSignX) * B814_FWD, posY, posZ + (-outwardSignZ) * B814_FWD]
            : [posX, posY, posZ];
          return (
            <RigidBody key={`${wallIdx}-${si}`} type="fixed" position={isRuin ? [posX, 0, posZ] : b814Pos}>
              {isRuin ? (
                <RubbleMound boxW={boxW} boxD={boxD} height={height} mat={mat} seed={wallIdx * 1009 + segIdx * 7919} />
              ) : arr814 ? (
                <>
                  <mesh
                    name={`building814-w${wallIdx}-s${segIdx}`}
                    geometry={new THREE.BoxGeometry(boxW, height, boxD)}
                    material={arr814}
                  />
                  <CuboidCollider args={[boxW / 2, height / 2, boxD / 2]} />
                </>
              ) : (
                <>
                  <mesh name={`building-w${wallIdx}-s${segIdx}-tex${seg.texIndex}`}>
                    <boxGeometry args={[boxW, height, boxD]} />
                    <primitive object={mat} attach="material" />
                  </mesh>
                  <CuboidCollider args={[boxW / 2, height / 2, boxD / 2]} />
                </>
              )}
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

      {/* Exit marker — CH3 door. 남쪽 perimeter 빌딩 면(z=-90*SCALE_Z)에 부착:
          뒤 0.15는 벽에 묻히고 앞으로 ~0.35 돌출 (depth 0.5, center +0.1) */}
      {/* 출구 문 — 1.2배 (글로우 제거, 크기로 눈에 띄게) */}
      <mesh position={[0, 2.4, -90 * SCALE_Z + 0.1]}>
        <boxGeometry args={[2.97, 4.8, 0.6]} />
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
  onMailboxZoneChange: (inZone: boolean) => void;
  freezeControls: boolean;
  activeCut: string | null;
  onCutStart: (id: string) => void;
  onCutEnd: () => void;
}> = ({ airportActive, onAirportTrigger, onExitZoneChange, onMailboxZoneChange, freezeControls, activeCut, onCutStart, onCutEnd }) => {
  // Suspends here until main FBX is cached — Physics only mounts after this resolves.
  // PlayerCharacter's own useFBX call then hits the warm cache and never re-suspends.
  useFBX(MAIN_FBX_URL);

  const [physicsReady, setPhysicsReady] = useState(false);
  const markChapterReady = useGameStore(s => s.markChapterReady);
  const handlePhysicsReady = useCallback(() => {
    setPhysicsReady(true);
    // 로딩 커튼 해제 신호. physicsReady 직후 Ecctrl이 y=2에서 스폰돼 바닥까지 떨어지므로
    // (~0.6s), 착지 완료를 보장하는 여유를 두고 ready를 알린다. 그래야 커튼이 걷힐 때
    // 캐릭터가 공중이 아니라 바닥에 서 있다.
    window.setTimeout(() => markChapterReady(), 1500);
  }, [markChapterReady]);
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

      {/* 평면 PNG 소품 — 표지판 / 현수막 / 포스터 (고정 배치) */}
      <Suspense fallback={null}>
        <Ch2FlatProps />
        <Ch2RoofMirror />
        <Ch2StackSign />
        <Ch2PinnedSigns />
      </Suspense>

      {/* 맞춤 건물/사인 — 원경 컷아웃 / 코너 건물 / 코너 간판 */}
      <Suspense fallback={null}>
        <Ch2CustomBuildings />
        <Ch2Graffiti buildings={SIGN_BUILDINGS} />
      </Suspense>

      {/* STEP 1: Signposts + movement tracking */}
      <MovementTracker />
      <SignpostManager />

      {/* STEP 3: Distance-based spatial sound */}
      <Ch2SoundManager />

      <KeyboardControls map={keyboardMap}>
        {physicsReady && (
         <>
          <Ecctrl
            ref={ecctrlRef}
            mode="FixedCamera"
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
            disableFollowCam={activeCut !== null}
            position={[0, 2, -8]}
          >
            <PlayerCharacter airportActive={airportActive} />
          </Ecctrl>
          <CameraOrbitOverride targetRef={ecctrlRef} enabled={!freezeControls && activeCut === null} />
          <Ch2CamCuts
            targetRef={ecctrlRef}
            activeId={activeCut}
            enabled={!freezeControls}
            onStart={onCutStart}
            onEnd={onCutEnd}
          />
         </>
        )}
      </KeyboardControls>

      <TriggerWatcher
        onAirportTrigger={onAirportTrigger}
        onExitZoneChange={onExitZoneChange}
        onMailboxZoneChange={onMailboxZoneChange}
        disabled={!physicsReady || freezeControls || activeCut !== null}
      />
    </Physics>
  );
};

// ---------- Inner scene (inside Canvas) ----------

const Ch2Inner: React.FC<{
  airportActive: boolean;
  onAirportTrigger: () => void;
  onExitZoneChange: (inZone: boolean) => void;
  onMailboxZoneChange: (inZone: boolean) => void;
  freezeControls: boolean;
  activeCut: string | null;
  onCutStart: (id: string) => void;
  onCutEnd: () => void;
}> = ({ airportActive, onAirportTrigger, onExitZoneChange, onMailboxZoneChange, freezeControls, activeCut, onCutStart, onCutEnd }) => {
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
      <hemisphereLight color="#c7e6ff" groundColor="#6a7683" intensity={0.9} />
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
          onMailboxZoneChange={onMailboxZoneChange}
          freezeControls={freezeControls}
          activeCut={activeCut}
          onCutStart={onCutStart}
          onCutEnd={onCutEnd}
        />
      </React.Suspense>

      <SceneExporter chapter="ch2" />
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

// dev 좌표 readout — 매 100ms devPlayerPos를 읽어 표시. base [x,z] (사인 target과 동일 좌표계)
const DevPosReadout: React.FC = () => {
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick(t => t + 1), 100);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ color: '#8f8', fontSize: 11, fontFamily: '"Unifont", monospace' }}>
      pos [{devPlayerPos.x.toFixed(1)}, {devPlayerPos.z.toFixed(1)}]
    </div>
  );
};

// ---------- Main export ----------

export const Ch2Scene: React.FC = () => {
  const [airportActive, setAirportActive] = useState(false);
  const [activeCut, setActiveCut] = useState<string | null>(null);
  const [glitchKey, setGlitchKey] = useState(0);
  const [atExit, setAtExit] = useState(false);
  const [atMailbox, setAtMailbox] = useState(false);
  const [postalActive, setPostalActive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingFadeOut, setLoadingFadeOut] = useState(false);

  // 로딩 오버레이는 실제 로드 완료(chapterReady = 캐릭터 착지 신호)까지 유지하되 최소 노출 시간을 둔다.
  // chapterReady가 끝내 안 와도 MAX_SHOW 안에 강제 종료(영구 로딩 방지).
  useEffect(() => {
    const MIN_SHOW = 3500;   // 최소 노출 시간 — "조금 더 길게"
    const MAX_SHOW = 10000;  // 안전 상한
    const start = performance.now();
    let timer = 0;
    const tick = () => {
      const elapsed = performance.now() - start;
      const ready = useGameStore.getState().chapterReady;
      if ((ready && elapsed >= MIN_SHOW) || elapsed >= MAX_SHOW) {
        setLoadingFadeOut(true);
        window.setTimeout(() => setLoading(false), 260);
        return;
      }
      timer = window.setTimeout(tick, 80);
    };
    timer = window.setTimeout(tick, 80);
    return () => window.clearTimeout(timer);
  }, []);
  const goToChapter  = useGameStore(s => s.goToChapter);
  const activeNoteId = useGameStore(s => s.activeNoteId);
  const visitedEvents = useGameStore(s => s.visitedEvents);
  const openNote     = useGameStore(s => s.openNote);
  const letterSent   = useGameStore(s => s.letterSent);
  const sendLetter   = useGameStore(s => s.sendLetter);
  const gameCompleted = useGameStore(s => s.gameCompleted);
  const devMode      = useDevMode();
  const [muted, toggleMute] = useMute();
  const [ch2Toggles, toggleCh2] = useCh2Toggles();
  const { play } = useSoundManager();

  const collectedNotes = CH2_NOTES.filter(n => visitedEvents.has(`note_${n.id}`)).length;
  const totalNotes = CH2_NOTES.length;

  const startAirport = useCallback(() => setAirportActive(true),  []);
  const endAirport   = useCallback(() => setAirportActive(false), []);

  // 카메라 컷 — cctv 컷만 글리치 깜빡으로 하드컷 마스킹. peek은 글리치 없이 부드럽게.
  const startCut = useCallback((id: string) => { setActiveCut(id); if (id === 'cctv') setGlitchKey(k => k + 1); }, []);
  const endCut   = useCallback(() => { setActiveCut(cur => { if (cur === 'cctv') setGlitchKey(k => k + 1); return null; }); }, []);

  const freezeControls = airportActive || activeNoteId !== null || postalActive;

  // freeze 전환 시 held movement key 강제 release —
  // cutscene/모달 동안 누르고 있던 방향키가 안 풀려 끝난 뒤 계속 전진하는 문제 방지
  useEffect(() => {
    ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'].forEach(code => {
      window.dispatchEvent(new KeyboardEvent('keyup', { code }));
    });
  }, [airportActive, activeNoteId, postalActive]);

  const allNotesCollected = collectedNotes === totalNotes;
  // 크레딧 완주 후 편지 미발송 상태로 CH2 재진입 → 출구를 막고 우체통 발송 전용으로 유도.
  // (편지 보낸 사람은 resetChapterState에서 note_ 소멸 → collectedNotes 0 → 이 조건 미충족)
  const reentryMode = gameCompleted && allNotesCollected && !letterSent;
  // 7/7 수집하면 통과 가능. 편지 발송은 자율(선택). 단 재진입 모드에선 출구를 닫는다.
  const canEnter = allNotesCollected && !reentryMode;
  // 우체통 반경에서 아직 편지 안 보냈으면 편지가 문 입장보다 우선
  // (반경 겹침 — 이 상태에선 E가 CH.3 진입 대신 편지 보내기로만)
  const mailboxSendable = atMailbox && allNotesCollected && !letterSent;

  // E key — confirm exit (in zone, 입장 조건 충족, no note open, no airport/postal cutscene)
  useEffect(() => {
    if (!atExit || !canEnter || mailboxSendable || activeNoteId !== null || airportActive || postalActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'KeyE') {
        e.preventDefault();
        play('transition');
        goToChapter('CH3');
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [atExit, canEnter, mailboxSendable, activeNoteId, airportActive, postalActive, goToChapter, play]);

  // E key — 우체통 편지 보내기 (7/7 수집 + 근접 + 미발송 + 다른 모달/컷신 없음)
  useEffect(() => {
    if (!mailboxSendable || postalActive || activeNoteId !== null || airportActive) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code === 'KeyE') {
        e.preventDefault();
        setPostalActive(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mailboxSendable, postalActive, activeNoteId, airportActive]);

  // 편지 영상 종료 → 수집한 시 전부 소멸 + 문 통과 허용
  const onPostalEnded = useCallback(() => {
    sendLetter();
    setPostalActive(false);
  }, [sendLetter]);

  const showMailboxPrompt = mailboxSendable && !postalActive && activeNoteId === null && !airportActive;
  // 우체통 근접 + 쪽지 미수집 — 편지를 보낼 수 없다는 안내
  const showMailboxIncomplete = atMailbox && !allNotesCollected && !letterSent && !postalActive && activeNoteId === null && !airportActive;
  // 우체통 우선 — 편지 프롬프트/안내 떠 있으면 문 프롬프트는 숨김 (반경 겹침)
  const showExitPrompt = atExit && !showMailboxPrompt && !showMailboxIncomplete && activeNoteId === null && !airportActive && !postalActive;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      {/* 3D는 Game의 영속 Canvas로 터널링. 카메라는 Ecctrl(FixedCamera)이 잡는 makeDefault. */}
      <r3f.In>
        <PerspectiveCamera makeDefault fov={75} near={0.1} far={1000} position={[0, 2, 0]} />
        <Ch2Inner
          airportActive={airportActive}
          onAirportTrigger={startAirport}
          onExitZoneChange={setAtExit}
          onMailboxZoneChange={setAtMailbox}
          freezeControls={freezeControls}
          activeCut={activeCut}
          onCutStart={startCut}
          onCutEnd={endCut}
        />
      </r3f.In>

      <AirportCutscene active={airportActive} onDone={endAirport} />
      <CctvGlitch flickerKey={glitchKey} />
      <PeekBars active={activeCut === 'peek'} />
      <PostalCutscene active={postalActive} onEnded={onPostalEnded} />
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
          color: canEnter ? '#f3eedd' : 'rgba(243,238,221,0.45)',
          background: 'rgba(0,0,0,0.65)',
          padding: '8px 18px',
          border: `1px solid ${canEnter ? 'rgba(243,238,221,0.35)' : 'rgba(243,238,221,0.18)'}`,
          textShadow: '0 0 6px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          {reentryMode
            ? '출구는 닫혔습니다  —  먼저 편지를 부치세요'
            : allNotesCollected
              ? '[E] 들어가기'
              : `쪽지를 모두 모아야 들어갈 수 있습니다  (${collectedNotes}/${totalNotes})`}
        </div>
      )}

      {/* 재진입(완주 후 미발송) 안내 — 우체통 프롬프트가 안 떠 있을 때 상단 배너로 목적지 안내 */}
      {reentryMode && !showMailboxPrompt && !postalActive && activeNoteId === null && !airportActive && (
        <div style={{
          position: 'fixed',
          left: '50%',
          top: '8%',
          transform: 'translateX(-50%)',
          zIndex: 1500,
          fontFamily: '"Unifont", monospace',
          fontSize: 13,
          letterSpacing: 3,
          color: '#f3eedd',
          background: 'rgba(0,0,0,0.65)',
          padding: '8px 18px',
          border: '1px solid rgba(243,238,221,0.3)',
          textShadow: '0 0 6px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          📮  수집한 쪽지를 우체통에 부치세요
        </div>
      )}

      {showMailboxPrompt && (
        <div style={{
          position: 'fixed',
          left: '50%',
          bottom: '22%',
          transform: 'translateX(-50%)',
          zIndex: 1500,
          fontFamily: '"Unifont", monospace',
          fontSize: 14,
          letterSpacing: 4,
          color: '#f3eedd',
          background: 'rgba(0,0,0,0.65)',
          padding: '8px 18px',
          border: '1px solid rgba(243,238,221,0.35)',
          textShadow: '0 0 6px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          [E] 편지 보내기
        </div>
      )}

      {showMailboxIncomplete && (
        <div style={{
          position: 'fixed',
          left: '50%',
          bottom: '22%',
          transform: 'translateX(-50%)',
          zIndex: 1500,
          fontFamily: '"Unifont", monospace',
          fontSize: 14,
          letterSpacing: 4,
          color: 'rgba(243,238,221,0.45)',
          background: 'rgba(0,0,0,0.65)',
          padding: '8px 18px',
          border: '1px solid rgba(243,238,221,0.18)',
          textShadow: '0 0 6px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          {`쪽지를 모두 모아야 편지를 보낼 수 있습니다  (${collectedNotes}/${totalNotes})`}
        </div>
      )}

      {/* 쪽지 수집 슬롯 — 좌하단 HUD. 편지 발송 후엔 손에서 소멸 → HUD 자체를 숨김(빈 슬롯 잔존 방지) */}
      {!airportActive && !letterSent && (
        <div style={{
          position: 'fixed',
          left: 24,
          bottom: 24,
          // 시 모달 열린 동안엔 모달(zIndex 2000) 위로 올려 다른 시 조각 클릭→전환 가능하게
          zIndex: activeNoteId !== null ? 2100 : 1500,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          pointerEvents: 'none',
          userSelect: 'none',
          filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.8))',
        }}>
          {CH2_NOTES.map(n => {
            // 편지 발송 후엔 손에서 소멸 — 빈 슬롯으로 표시(맵 재생성과 무관, note_*는 보존됨)
            const collected = !letterSent && visitedEvents.has(`note_${n.id}`);
            const noteColor = SPARKLE_COLOR[n.id] ?? DEFAULT_SPARKLE;
            const isActive = collected && n.id === activeNoteId;
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
                  filter: isActive ? 'drop-shadow(0 0 2px rgba(255,255,255,0.95))' : undefined,
                }}
                onClick={collected ? () => openNote(n.id) : undefined}
                onMouseEnter={collected ? (e) => { e.currentTarget.style.transform = 'scale(1.18)'; } : undefined}
                onMouseLeave={collected ? (e) => { e.currentTarget.style.transform = 'scale(1)'; } : undefined}
              >
                <path
                  d="M3 2 L17 2 L21 6 L21 30 L3 30 Z"
                  fill={collected ? noteColor : 'transparent'}
                  stroke={isActive ? '#ffffff' : (collected ? noteColor : '#a0a0a0')}
                  strokeWidth={isActive ? 1.6 : 1.5}
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
          {/* Tab+방향키로 시 순차 열람 가능함을 알리는 힌트 (⇥ tab) */}
          {collectedNotes > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 4, opacity: 0.5, pointerEvents: 'none' }}>
              <svg viewBox="0 0 22 16" width="16" height="12" aria-hidden>
                <path d="M3 8 L15 8 M11 4 L15 8 L11 12 M19 3 L19 13" fill="none" stroke="#f3eedd" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ fontFamily: '"Unifont", monospace', fontSize: 10, letterSpacing: 1, color: '#f3eedd' }}>tab</span>
            </span>
          )}
        </div>
      )}

      {/* Mobile joystick — hidden per request */}
      {false && 'ontouchstart' in window && window.matchMedia('(pointer: coarse)').matches && <EcctrlJoystick />}

      {devMode && !airportActive && (
        <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 9999, background: 'rgba(0,0,0,0.85)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6, padding: '10px 14px', fontFamily: '"Unifont", monospace', fontSize: 11, color: '#ccc', display: 'flex', flexDirection: 'column', gap: 6, minWidth: 180 }}>
          <div style={{ color: '#ff0', fontSize: 10, letterSpacing: 2, marginBottom: 2 }}>DEV MODE</div>
          <DevPosReadout />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <DevButton label="Airport Cutscene" onClick={() => { if (!airportActive) startAirport(); }} />
          <DevButton label="CCTV Cut (20발자국)" onClick={() => { if (!activeCut) startCut('cctv'); }} />
          <DevButton label="Peek Cut (벽틈)" onClick={() => { if (!activeCut) startCut('peek'); }} />
          <DevButton label="Postal Cutscene" onClick={() => { if (!postalActive) setPostalActive(true); }} />
          <DevButton label="Send Letter (시 소멸)" onClick={() => sendLetter()} />
          <DevButton label="Skip → CH3" onClick={() => goToChapter('CH3')} />
          <DevButton label="Skip → CH1" onClick={() => goToChapter('CH1')} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <DevButton label={`Decor: ${ch2Toggles.showDecor ? 'ON' : 'OFF'}`} onClick={() => toggleCh2('showDecor')} />
          <DevButton label={`Aihub: ${ch2Toggles.showAihub ? 'ON' : 'OFF'}`} onClick={() => toggleCh2('showAihub')} />
          <DevButton label={`Signs Lineup: ${ch2Toggles.signsLineup ? 'ON' : 'OFF'}`} onClick={() => toggleCh2('signsLineup')} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <DevButton label={`Sound: ${muted ? 'OFF' : 'ON'}`} onClick={toggleMute} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <DevButton label="Export Scene → .glb" onClick={() => window.dispatchEvent(new Event('mh-export-glb'))} />
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
          opacity: loadingFadeOut ? 0 : 1,
          transition: 'opacity 0.25s ease-in',
        }}>
          <div style={{ fontSize: 26, marginBottom: 14, animation: 'ch2LoadingSpin 1s linear infinite' }}>↻</div>
          <div style={{ fontSize: 15, letterSpacing: 8, marginBottom: 56 }}>l o a d i n g . . .</div>
          <div style={{ fontSize: 13, lineHeight: 1.75, textAlign: 'center' }}>
            팁: 사정할 때 숨을 참으면 분출되는 액체가 더 멀리 날아갑니다.
          </div>
          <style>{`
            @keyframes ch2LoadingSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}
    </div>
  );
};
