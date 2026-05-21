import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Minimap, type MinimapMarker } from '@/components/game/Minimap';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { MeshReflectorMaterial, useFBX } from '@react-three/drei';
import { Suspense } from 'react';
import { PlayerController, type WallAABB } from '@/components/game/PlayerController';
import { SceneExporter } from '@/components/dev/SceneExporter';
import { useGameStore } from '@/store/useGameStore';
import { useSoundManager } from '@/hooks/useSoundManager';
import { generateMaze, cellToWorld, type MazeData } from '@/utils/mazeGenerator';
import { useDevMode } from '@/hooks/useDevMode';
import { useMute } from '@/hooks/useMute';
import { Ch3Effects } from '@/components/effects/ChapterEffects';
import { StarNestOverlay } from '@/components/effects/StarNestOverlay';
import { ItaewonLayer } from '@/components/game/ItaewonLayer';
import { startElevatorMusic, endElevatorMusic } from '@/lib/chapterMusic';

const MAZE_SIZE = 10;
const CELL_SIZE = 7;
const WALL_HEIGHT = 4;
const SNAP_FACTOR = 64;

function makeSnapMaterial(color: string): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      gl_Position.xyz = floor(gl_Position.xyz / gl_Position.w * ${SNAP_FACTOR}.0 + 0.5) / ${SNAP_FACTOR}.0 * gl_Position.w;`,
    );
  };
  return mat;
}

const TEX_BASE = `${import.meta.env.BASE_URL ?? '/'}assets/tex/ch3/`;
const _texLoader = new THREE.TextureLoader();

function makeSnapMaterialWithTexture(
  texFile: string,
  opts?: { repeat?: number; grayscale?: boolean }
): THREE.MeshStandardMaterial {
  const tex = _texLoader.load(`${TEX_BASE}${texFile}`);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const r = opts?.repeat ?? 1;
  tex.repeat.set(r, r);
  const mat = new THREE.MeshStandardMaterial({ color: '#fff', map: tex });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      gl_Position.xyz = floor(gl_Position.xyz / gl_Position.w * ${SNAP_FACTOR}.0 + 0.5) / ${SNAP_FACTOR}.0 * gl_Position.w;`,
    );
    if (opts?.grayscale) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float __gray = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = vec3(__gray);`,
      );
    }
  };
  return mat;
}

/** InstancedMesh walls for performance.
 *  args[2] is the GL buffer maxCount — fixed at MAX so the InstancedMesh
 *  isn't recreated on maze regen. Per-frame `count` is set in useEffect
 *  to the actual wall count so we render exactly the new layout. */
const MAX_WALLS = 512;

const MazeWalls: React.FC<{ maze: MazeData }> = ({ maze }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => makeSnapMaterialWithTexture('qai50015.jpg', { repeat: 1 }), []);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    maze.wallPositions.forEach((w, i) => {
      dummy.position.set(w.x, WALL_HEIGHT / 2, w.z);
      dummy.scale.set(w.scaleX, WALL_HEIGHT, w.scaleZ);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.count = maze.wallPositions.length;
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [maze]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, MAX_WALLS]} material={material} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
};

const MazeFloor: React.FC = () => {
  const size = MAZE_SIZE * CELL_SIZE;
  const material = useMemo(() => makeSnapMaterialWithTexture('SAND3.JPG', { repeat: 10 }), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[size / 2, 0, size / 2]} material={material}>
      <planeGeometry args={[size, size, MAZE_SIZE, MAZE_SIZE]} />
    </mesh>
  );
};

const FlickerLight: React.FC = () => {
  const lightRef = useRef<THREE.AmbientLight>(null);
  useFrame(({ clock }) => {
    if (lightRef.current) {
      lightRef.current.intensity = 0.6 + Math.sin(clock.elapsedTime * 8) * 0.08 + Math.sin(clock.elapsedTime * 13) * 0.04;
    }
  });
  return <ambientLight ref={lightRef} intensity={0.6} color="#f0f0e8" />;
};

const MEDICINES = [
  // duration = 효과 minimum 지속 시간 (ms). 그 후 자동 종료. encounter는 ghost cycle 트리거 (효과 종료와 별개)
  { name: 'Lithium Carbonate', color: '#ff3333', effect: 'desaturate', duration: 8000, soundSlot: 'gulp_red', cell: { gx: 2, gy: 2 }, mazeProfile: { removalRatio: 0.1 } },
  { name: 'Aripiprazole', color: '#3366ff', effect: 'blur', duration: 10000, soundSlot: 'gulp_blue', cell: { gx: 5, gy: 3 }, mazeProfile: { removalRatio: 0 } },
  { name: 'Quetiapine Fumarate', color: '#ffcc00', effect: 'darken', duration: 8000, soundSlot: 'gulp_yellow', cell: { gx: 3, gy: 6 }, mazeProfile: { removalRatio: 0.05 } },
  { name: 'Alprazolam', color: '#33cc33', effect: 'anxiolytic', duration: 6000, soundSlot: 'gulp_green', cell: { gx: 7, gy: 7 }, mazeProfile: { removalRatio: 0.3 } },
  { name: 'munch munch', color: '#ffffff', effect: 'whiteflash', duration: 1800, soundSlot: 'gulp_white', cell: { gx: 8, gy: 5 }, mazeProfile: { removalRatio: 0.6 } },
];

// 약 이름 영문 → 한글 매핑 (cart 클릭 시 글리치 표기)
const MED_KOREAN: Record<string, string> = {
  'Lithium Carbonate': '기분안정제',
  'Aripiprazole': '항정신병약',
  'Quetiapine Fumarate': '수면제',
  'Alprazolam': '항불안제',
  'munch munch': '다 먹음',
};

const GLITCH_CHARS = '!@#$%^&*+=[]{}|<>?/~가나다라마바사아자차카타파하ㅁㄴㅇㄹㅎㅋㅌㅊㅍ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function glitchText(src: string, target: string, progress: number): string {
  const len = Math.max(src.length, target.length);
  let out = '';
  for (let i = 0; i < len; i++) {
    const charProgress = progress * 1.5 - (i / len) * 0.3;
    if (charProgress < 0.2) {
      out += src[i] ?? ' ';
    } else if (charProgress > 0.8) {
      out += target[i] ?? ' ';
    } else {
      out += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
    }
  }
  return out;
}

const GlitchCartButton: React.FC<{ item: string }> = ({ item }) => {
  const [clicked, setClicked] = useState(false);
  const [display, setDisplay] = useState(item);

  useEffect(() => {
    setDisplay(item);
    setClicked(false);
  }, [item]);

  useEffect(() => {
    if (!clicked) return;
    const A = item;
    const B = MED_KOREAN[item] ?? item;
    const GLITCH_FRAMES = 40; // ~1s @ 25ms tick
    const HOLD_FRAMES = 40;   // ~1s static between glitches
    let direction: 'AB' | 'BA' = 'AB';
    let mode: 'glitch' | 'hold' = 'glitch';
    let frame = 0;
    const interval = setInterval(() => {
      if (mode === 'glitch') {
        frame++;
        if (frame > GLITCH_FRAMES) {
          setDisplay(direction === 'AB' ? B : A);
          mode = 'hold';
          frame = 0;
          return;
        }
        const progress = frame / GLITCH_FRAMES;
        const src = direction === 'AB' ? A : B;
        const dst = direction === 'AB' ? B : A;
        setDisplay(glitchText(src, dst, progress));
      } else {
        frame++;
        if (frame > HOLD_FRAMES) {
          direction = direction === 'AB' ? 'BA' : 'AB';
          mode = 'glitch';
          frame = 0;
        }
      }
    }, 25);
    return () => clearInterval(interval);
  }, [clicked, item]);

  return (
    <button
      onClick={() => { if (!clicked) setClicked(true); }}
      style={{
        padding: '4px 10px',
        fontFamily: '"Unifont", monospace',
        fontSize: 11,
        color: '#fff',
        backgroundColor: 'rgba(0,0,0,0.7)',
        border: '1px solid rgba(255,255,255,0.2)',
        cursor: 'pointer',
        transition: 'transform 0.15s, opacity 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.6'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
    >
      {display}
    </button>
  );
};

// --- Fitting room (= space elevator portal) at center ---
const FITTING_ROOM_CELL = { gx: Math.floor(MAZE_SIZE / 2), gy: Math.floor(MAZE_SIZE / 2) }; // (5, 5)

/** Fitting room booth + reflective mirror */
const FittingRoom: React.FC<{ worldPos: { x: number; z: number } }> = ({ worldPos }) => {
  return (
    <group position={[worldPos.x, 0, worldPos.z]}>
      {/* Booth walls */}
      <mesh position={[0, 1.5, -1.2]}>
        <boxGeometry args={[2.4, 3, 0.15]} />
        <meshStandardMaterial color="#665544" />
      </mesh>
      <mesh position={[-1.1, 1.5, -0.3]}>
        <boxGeometry args={[0.15, 3, 1.8]} />
        <meshStandardMaterial color="#665544" />
      </mesh>
      <mesh position={[1.1, 1.5, -0.3]}>
        <boxGeometry args={[0.15, 3, 1.8]} />
        <meshStandardMaterial color="#665544" />
      </mesh>
      {/* Mirror frame — full-wall, dark satin */}
      <mesh position={[0, 1.5, 1.48]}>
        <boxGeometry args={[2.1, 2.85, 0.04]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.4} roughness={0.6} />
      </mesh>
      {/* Mirror — full reflection, sharper resolution, near-perfect mirror */}
      <mesh position={[0, 1.5, 1.5]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.95, 2.7]} />
        <MeshReflectorMaterial
          mirror={1}
          resolution={1024}
          mixBlur={0.05}
          mixStrength={1.2}
          blur={[60, 30]}
          color="#dde6ee"
          metalness={1}
          roughness={0.02}
          depthScale={0.4}
          minDepthThreshold={0.3}
          maxDepthThreshold={1}
        />
      </mesh>
    </group>
  );
};

// --- Space character (FBX with PBR, R3F overlay) ---
const ASSETS_BASE = `${import.meta.env.BASE_URL}assets/characters_biped/Meshy_AI_biped/`;
const SPACE_FBX_URL = `${ASSETS_BASE}Meshy_AI_Animation_Long_Breathe_and_Look_Around_frame_rate_24.fbx`;
const SPACE_DIFFUSE_URL   = `${ASSETS_BASE}Meshy_AI_texture_0.png`;
const SPACE_METALLIC_URL  = `${ASSETS_BASE}Meshy_AI_texture_0_metallic.png`;
const SPACE_NORMAL_URL    = `${ASSETS_BASE}Meshy_AI_texture_0_normal.png`;
const SPACE_ROUGHNESS_URL = `${ASSETS_BASE}Meshy_AI_texture_0_roughness.png`;

const SpaceCharacterMesh: React.FC = () => {
  const fbx = useFBX(SPACE_FBX_URL);
  const diffuse   = useLoader(THREE.TextureLoader, SPACE_DIFFUSE_URL);
  const metallic  = useLoader(THREE.TextureLoader, SPACE_METALLIC_URL);
  const normalMap = useLoader(THREE.TextureLoader, SPACE_NORMAL_URL);
  const roughness = useLoader(THREE.TextureLoader, SPACE_ROUGHNESS_URL);
  const ref = useRef<THREE.Group>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);

  useEffect(() => {
    if (!fbx) return;
    if (fbx.animations.length > 0) {
      const mixer = new THREE.AnimationMixer(fbx);
      const action = mixer.clipAction(fbx.animations[0]);
      action.play();
      mixerRef.current = mixer;
    }
    fbx.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.material = new THREE.MeshStandardMaterial({
          map: diffuse,
          metalnessMap: metallic,
          normalMap: normalMap,
          roughnessMap: roughness,
          metalness: 0.25,
          roughness: 0.72,
        });
      }
    });
  }, [fbx, diffuse, metallic, normalMap, roughness]);

  useFrame((_, delta) => {
    mixerRef.current?.update(delta);
    if (ref.current) {
      ref.current.rotation.y += delta * 0.18;
      ref.current.position.y = -0.75 + Math.sin(performance.now() * 0.001) * 0.03;
    }
  });

  return (
    <group ref={ref}>
      <primitive object={fbx} scale={0.0022} />
    </group>
  );
};

const SpaceCharacterCanvas: React.FC = () => (
  <Canvas
    style={{ position: 'fixed', inset: 0, zIndex: 1002, pointerEvents: 'none' }}
    camera={{ fov: 35, position: [0, 0.4, 3.2] }}
    gl={{ alpha: true }}
  >
    <ambientLight intensity={0.45} color="#dde8ff" />
    <directionalLight position={[2, 4, 3]} intensity={1.2} color="#ffffff" />
    <directionalLight position={[-2, 1, -1]} intensity={0.4} color="#88aaff" />
    <Suspense fallback={null}>
      <SpaceCharacterMesh />
    </Suspense>
    <EffectComposer>
      <Bloom
        intensity={0.9}
        luminanceThreshold={0.35}
        luminanceSmoothing={0.4}
        mipmapBlur
      />
    </EffectComposer>
  </Canvas>
);

// --- Elevator Cutscene ---
type CutscenePhase = 'elevator' | 'space' | 'returning' | null;

const ELEVATOR_DURATION = 18000; // 18s elevator interior — 명상적 호흡 확보
const SPACE_DURATION = 42500;    // 42.5s space scene (-2.5s polish)
const RETURN_FADE = 1500;       // 화이트아웃 → 맵 복귀 fade

const ElevatorCutscene: React.FC<{
  phase: CutscenePhase;
}> = ({ phase }) => {
  const [floor, setFloor] = useState<string>('01');
  const [lookUp, setLookUp] = useState(false);
  const [stars, setStars] = useState<{ x: number; y: number; size: number; opacity: number; speed: number }[]>([]);
  const [earthY, setEarthY] = useState(80);
  const animRef = useRef<number>(0);
  const { play, loop } = useSoundManager();

  // 엘베 안 룸톤 loop — elevator phase 시작 ~ space 진입 직전까지
  useEffect(() => {
    if (phase === 'elevator') {
      loop('elevator_room', true);
      return () => loop('elevator_room', false);
    }
    return undefined;
  }, [phase, loop]);

  // 도착 ding → 700ms 후 문 열림. space 전환 2초 전에 시작 (사운드가 시각 변화에 약간 선행)
  useEffect(() => {
    if (phase === 'elevator') {
      const dingTimer = setTimeout(() => {
        play('elevator_ding');
        setTimeout(() => play('elevator_door'), 700);
      }, ELEVATOR_DURATION - 2000);
      return () => clearTimeout(dingTimer);
    }
    return undefined;
  }, [phase, play]);

  // Auto floor counter — 1 → 99 → ★
  useEffect(() => {
    if (phase !== 'elevator') { setFloor('01'); setLookUp(false); return; }
    let count = 1;
    setFloor('01');
    const interval = setInterval(() => {
      count++;
      if (count > 99) {
        setFloor('★');
        clearInterval(interval);
      } else {
        setFloor(String(count).padStart(2, '0'));
      }
    }, 170);
    return () => clearInterval(interval);
  }, [phase]);

  // Up arrow / W = look up (hold)
  useEffect(() => {
    if (phase !== 'elevator') return;
    const isLookKey = (e: KeyboardEvent) => e.code === 'ArrowUp' || e.code === 'KeyW';
    const down = (e: KeyboardEvent) => { if (isLookKey(e)) setLookUp(true); };
    const up = (e: KeyboardEvent) => { if (isLookKey(e)) setLookUp(false); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [phase]);

  // Generate stars once
  useEffect(() => {
    const s = Array.from({ length: 200 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.5 + 0.5,
      opacity: Math.random() * 0.7 + 0.3,
      speed: Math.random() * 0.3 + 0.05,
    }));
    setStars(s);
  }, []);

  // Animate earth rising during space phase
  useEffect(() => {
    if (phase !== 'space') { setEarthY(80); return; }
    let start: number | null = null;
    const animate = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / SPACE_DURATION, 1);
      setEarthY(80 - progress * 30); // earth rises from 80% to 50%
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [phase]);

  if (!phase) return null;

  const fadeStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    transition: `opacity ${RETURN_FADE}ms ease`,
    opacity: phase === 'returning' ? 0 : 1,
  };

  // --- Elevator interior ---
  // lookUp: positive translateY pushes content DOWN → camera looks UP
  const viewY = lookUp ? 15 : 0;

  if (phase === 'elevator') {
    return (
      <div style={fadeStyle}>
        {/* Viewport container — shifts down on look-up (= camera tilts up) */}
        <div style={{
          position: 'absolute',
          left: 0, right: 0,
          top: '-20%',   /* extra room above for floor indicator */
          bottom: '-5%',
          transform: `translateY(${viewY}%)`,
          transition: 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        }}>

        {/* Back wall bg — fills entire view, GALVPLAT 텍스처 + dark overlay */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '16%', bottom: 0,
          backgroundImage: `url('${import.meta.env.BASE_URL}assets/tex/ch3/GALVPLAT.JPG'), linear-gradient(180deg, #08080a 0%, #111114 30%, #161619 60%, #111114 100%)`,
          backgroundSize: 'cover, cover',
          backgroundBlendMode: 'multiply',
        }} />

        {/* Ceiling — thin strip */}
        <div style={{
          position: 'absolute', top: '16%', left: 0, right: 0, height: '6%',
          background: 'linear-gradient(0deg, #18181c 0%, #0c0c0e 100%)',
          borderBottom: '1px solid rgba(255,255,255,0.03)',
        }}>
          <div style={{
            position: 'absolute', bottom: 0, left: '35%', right: '35%', height: 3,
            background: '#bbcc88',
            boxShadow: '0 4px 50px 15px rgba(180,200,120,0.1)',
            animation: 'elevatorFlicker 0.15s infinite alternate',
          }} />
        </div>

        {/* Left wall */}
        <div style={{
          position: 'absolute', left: 0, top: '22%', bottom: 0, width: '15%',
          backgroundImage: `url('${import.meta.env.BASE_URL}assets/tex/ch3/GALVPLAT.JPG'), linear-gradient(90deg, #0c0c0f 0%, #141417 100%)`,
          backgroundSize: 'cover, cover',
          backgroundBlendMode: 'multiply',
          borderRight: '1px solid rgba(255,255,255,0.03)',
        }}>
          <div style={{
            position: 'absolute', right: '35%', top: 0, bottom: 0,
            width: 1, background: 'rgba(255,255,255,0.03)',
          }} />
        </div>

        {/* Graffiti City + Digital-7 폰트 (public/fonts) */}
        <style>{`
          @font-face {
            font-family: 'Graffiti City';
            src: url('${import.meta.env.BASE_URL}fonts/GraffitiCity.otf') format('opentype');
            font-display: swap;
          }
          @font-face {
            font-family: 'Digital-7';
            src: url('${import.meta.env.BASE_URL}fonts/digital-7.ttf') format('truetype');
            font-display: swap;
          }
        `}</style>
        {/* 'look up kid...' graffiti — 좌측 중하단 (Up/W 인터랙션 안내) */}
        <div style={{
          position: 'absolute',
          left: '3%',
          top: '85%',
          zIndex: 10,
          transform: 'rotate(-6deg)',
          fontFamily: '"Graffiti City", "Hammer Keys", monospace',
          // 엘베 벽이 viewport 비례(%)로 sizing되니 글자도 vmin으로 같이 비례
          // MacBook 16" (1728×1117 / 1512×982) 기준 56px ≈ 5vmin
          fontSize: '2.1vmin',
          letterSpacing: '0.075vmin',
          color: 'rgba(235, 80, 70, 0.9)',
          textShadow: '0 0 12px rgba(220, 40, 30, 0.6), 2px 3px 0 rgba(0,0,0,0.75)',
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
        }}>
          ↑ look up kid...
        </div>

        {/* Right wall */}
        <div style={{
          position: 'absolute', right: 0, top: '22%', bottom: 0, width: '15%',
          backgroundImage: `url('${import.meta.env.BASE_URL}assets/tex/ch3/GALVPLAT.JPG'), linear-gradient(-90deg, #0c0c0f 0%, #141417 100%)`,
          backgroundSize: 'cover, cover',
          backgroundBlendMode: 'multiply',
          borderLeft: '1px solid rgba(255,255,255,0.03)',
        }}>
          <div style={{
            position: 'absolute', left: '35%', top: 0, bottom: 0,
            width: 1, background: 'rgba(255,255,255,0.03)',
          }} />
        </div>

        {/* Back wall — door area, fills view edge to edge vertically */}
        <div style={{
          position: 'absolute',
          left: '15%', right: '15%', top: '22%', bottom: 0,
          background: 'linear-gradient(180deg, #111114 0%, #151518 50%, #111114 100%)',
        }}>
          {/* Door frame — tall, bottom-less, nearly full width */}
          <div style={{
            position: 'absolute',
            left: '8%', right: '8%', top: '3%', bottom: '0%',
            border: '2px solid rgba(255,255,255,0.06)',
            borderBottom: 'none',
            background: 'rgba(0,0,0,0.3)',
          }}>
            <div style={{
              position: 'absolute', left: '50%', top: 0, bottom: 0,
              width: 1, background: 'rgba(255,255,255,0.08)',
            }} />
          </div>

          {/* ▲ direction arrow */}
          <div style={{
            position: 'absolute', top: '-4%', left: '50%', transform: 'translateX(-50%)',
            fontFamily: '"Unifont", monospace', fontSize: 12, color: '#ff3300',
            animation: 'arrowPulse 0.8s ease-in-out infinite',
          }}>
            ▲
          </div>
        </div>

        {/* Floor indicator — above back wall, revealed on look-up */}
        <div style={{
          position: 'absolute',
          top: '10%', left: '50%', transform: 'translateX(-50%)',
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: '"Digital-7", "Unifont", monospace',
            fontSize: 44,
            color: '#ff3300',
            textShadow: '0 0 15px rgba(255,50,0,0.5)',
            letterSpacing: 6,
          }}>
            {floor}
          </div>
          <div style={{
            fontFamily: '"Unifont", monospace', fontSize: 8, color: 'rgba(255,255,255,0.2)',
            letterSpacing: 3, marginTop: 2,
          }}>
            FLOOR
          </div>
        </div>

        {/* Button panel (right wall, near camera) */}
        <div style={{
          position: 'absolute',
          right: '5%', top: '42%',
          width: 120, height: 400,
          background: 'linear-gradient(180deg, #1c1c20, #18181c)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 5,
          padding: '14px 12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          transform: 'scale(1.3)',
          transformOrigin: 'top right',
        }}>
          {['★', '99', '80', '60', '40', '20', '10', '5', '1', 'B1'].map((label, i) => {
            const baseBg = i === 0 ? 'rgba(255,200,0,0.25)' : 'rgba(255,255,255,0.06)';
            const hoverBg = i === 0 ? 'rgba(255,200,0,0.45)' : 'rgba(255,255,255,0.18)';
            return (
              <div
                key={i}
                onClick={(e) => { e.stopPropagation(); play(`elevator_btn_${i}`); }}
                onMouseEnter={(e) => { e.currentTarget.style.background = hoverBg; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = baseBg; }}
                style={{
                  width: 80, height: 28,
                  borderRadius: 4,
                  background: baseBg,
                  border: `1px solid ${i === 0 ? 'rgba(255,200,0,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: '"Unifont", monospace', fontSize: 14,
                  color: i === 0 ? '#ffcc00' : 'rgba(255,255,255,0.3)',
                  letterSpacing: 1,
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'background 0.1s ease',
                }}
              >
                {label}
              </div>
            );
          })}
          <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
            <div
              onClick={(e) => { e.stopPropagation(); play('elevator_btn_close'); }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,50,0,0.35)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,50,0,0.15)'; }}
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(255,50,0,0.15)',
                border: '1px solid rgba(255,50,0,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: '"Unifont", monospace',
                fontSize: 13,
                color: 'rgba(255,180,160,0.85)',
                letterSpacing: -1,
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'background 0.1s ease',
              }}
            >
              {'>|<'}
            </div>
            <div
              onClick={(e) => { e.stopPropagation(); play('elevator_btn_open'); }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,200,0,0.32)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,200,0,0.12)'; }}
              style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(255,200,0,0.12)',
                border: '1px solid rgba(255,200,0,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: '"Unifont", monospace',
                fontSize: 13,
                color: 'rgba(255,225,160,0.85)',
                letterSpacing: -1,
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'background 0.1s ease',
              }}
            >
              {'<|>'}
            </div>
          </div>
        </div>

        </div>{/* end viewport container */}

        {/* ▲ key hint — fixed, outside viewport shift */}
        <div style={{
          position: 'absolute', bottom: '6%', left: '50%', transform: 'translateX(-50%)',
          fontFamily: '"Unifont", monospace', fontSize: 10, color: 'rgba(255,255,255,0.12)',
          letterSpacing: 3,
          opacity: lookUp ? 0 : 1,
          transition: 'opacity 0.3s ease',
          animation: 'fadeInSlow 3s ease-in forwards',
        }}>
          ▲
        </div>

        {/* Floor — grate 텍스처 + perspective tilt */}
        <div style={{
          position: 'absolute',
          left: 0, right: 0, bottom: 0,
          height: '32%',
          backgroundImage: `url('${import.meta.env.BASE_URL}assets/tex/ch3/grate.jpg')`,
          backgroundRepeat: 'repeat',
          backgroundSize: '160px 160px',
          transform: 'perspective(280px) rotateX(58deg)',
          transformOrigin: 'center bottom',
          filter: 'brightness(0.55)',
          pointerEvents: 'none',
        }} />

        {/* Vibration / shake overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          animation: 'elevatorShake 0.1s infinite',
          pointerEvents: 'none',
        }} />

        <style>{`
          @keyframes elevatorFlicker {
            0% { opacity: 0.6; }
            100% { opacity: 1; }
          }
          @keyframes arrowPulse {
            0%, 100% { opacity: 0.3; transform: translateX(-50%) translateY(0); }
            50% { opacity: 1; transform: translateX(-50%) translateY(-3px); }
          }
          @keyframes elevatorShake {
            0% { transform: translate(0, 0); }
            25% { transform: translate(0.4px, 0.6px); }
            50% { transform: translate(-0.3px, 0.4px); }
            75% { transform: translate(0.3px, -0.5px); }
            100% { transform: translate(-0.4px, 0.2px); }
          }
          @keyframes fadeInSlow {
            0% { opacity: 0; }
            100% { opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  // --- Space scene (STEP 9: StarNest shader background) ---
  if (phase === 'space' || phase === 'returning') {
    return (
      <div style={fadeStyle}>
        {/* STEP 9: Star Nest shader background (REF-7) */}
        <StarNestOverlay duration={SPACE_DURATION / 1000} />

        {/* Main character — Meshy FBX, floating + slow rotation */}
        <SpaceCharacterCanvas />

        {/* 화이트아웃 — phase returning 시 흰 overlay가 캐릭터·별 같이 덮으며 fade out */}
        {phase === 'returning' && (
          <>
            <style>{`
              @keyframes whiteoutFade {
                0% { opacity: 1; }
                100% { opacity: 0; }
              }
            `}</style>
            <div style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1100,
              background: '#ffffff',
              pointerEvents: 'none',
              animation: `whiteoutFade ${RETURN_FADE}ms ease-out forwards`,
            }} />
          </>
        )}

        {/* Elevator window frame */}
        <div style={{
          position: 'fixed', inset: 0,
          border: '60px solid #0e0e12',
          borderRadius: 8,
          boxShadow: 'inset 0 0 80px 30px rgba(0,0,0,0.6)',
          pointerEvents: 'none',
          zIndex: 1003,
        }} />

        {/* Thin window bezel */}
        <div style={{
          position: 'fixed',
          inset: 56,
          border: '2px solid rgba(255,255,255,0.08)',
          borderRadius: 4,
          pointerEvents: 'none',
          zIndex: 1003,
        }} />

        {/* Text */}
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          fontFamily: '"Unifont", monospace',
          fontSize: 14,
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: 6,
          animation: 'fadeInSlow 2s ease-in forwards',
          textAlign: 'center',
          zIndex: 1004,
        }}>
          . . .
        </div>

        <style>{`
          @keyframes fadeInSlow {
            0% { opacity: 0; }
            100% { opacity: 1; }
          }
        `}</style>
      </div>
    );
  }


  return null;
};

const MedicinePickup: React.FC<{
  med: typeof MEDICINES[0];
  worldPos: { x: number; z: number };
  collected: boolean;
}> = ({ med, worldPos, collected }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (meshRef.current && !collected) {
      meshRef.current.rotation.y = clock.elapsedTime * 2;
      meshRef.current.position.y = 0.5 + Math.sin(clock.elapsedTime * 3) * 0.1;
    }
  });

  if (collected) return null;

  return (
    <mesh ref={meshRef} position={[worldPos.x, 0.5, worldPos.z]}>
      <boxGeometry args={[0.3, 0.5, 0.3]} />
      <meshStandardMaterial color={med.color} emissive={med.color} emissiveIntensity={0.3} />
    </mesh>
  );
};

/** Exit marker — invisible until all 5 medicines are collected, then 1s fade-in. */
const ExitMarker: React.FC<{ worldPos: { x: number; z: number }; visible: boolean }> = ({ worldPos, visible }) => {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const opacityRef = useRef(0);

  useFrame((_, delta) => {
    const target = visible ? 1 : 0;
    opacityRef.current = THREE.MathUtils.lerp(opacityRef.current, target, Math.min(delta * 1.5, 1));
    if (matRef.current) {
      matRef.current.opacity = opacityRef.current;
      matRef.current.emissiveIntensity = 0.2 * opacityRef.current;
    }
  });

  return (
    <mesh position={[worldPos.x, 1.5, worldPos.z]}>
      <boxGeometry args={[1.5, 3, 0.3]} />
      <meshStandardMaterial
        ref={matRef}
        color="#4a4"
        emissive="#0f0"
        emissiveIntensity={0}
        transparent
        opacity={0}
      />
    </mesh>
  );
};

const Ch3Inner: React.FC<{
  maze: MazeData;
  onPlayerMove?: (pos: { x: number; z: number }) => void;
  onElevatorZoneChange?: (inZone: boolean) => void;
  onExitZoneChange?: (inZone: boolean) => void;
  onDrugPickup?: (index: number) => void;
  onCollectedChange?: (collected: Set<number>) => void;
}> = ({ maze, onPlayerMove, onElevatorZoneChange, onExitZoneChange, onDrugPickup, onCollectedChange }) => {
  const triggerEvent = useGameStore(s => s.triggerEvent);
  const addToCart = useGameStore(s => s.addToCart);
  const setActiveEffect = useGameStore(s => s.setActiveEffect);
  const setNotification = useGameStore(s => s.setNotification);
  const { play } = useSoundManager();
  const [collected, setCollected] = useState<Set<number>>(new Set());
  const [posState, setPosState] = useState({ x: 0, z: 0 });

  const startWorld = useMemo(() => cellToWorld(maze.start.x, maze.start.y, CELL_SIZE), [maze]);
  const exitWorld = useMemo(() => cellToWorld(maze.end.x, maze.end.y, CELL_SIZE), [maze]);
  const mazeWorldSize = MAZE_SIZE * CELL_SIZE;

  const wallAABBs = useMemo<WallAABB[]>(() => {
    return maze.wallPositions.map(w => ({
      minX: w.x - w.scaleX / 2,
      maxX: w.x + w.scaleX / 2,
      minZ: w.z - w.scaleZ / 2,
      maxZ: w.z + w.scaleZ / 2,
    }));
  }, [maze]);

  const medPositions = useMemo(() =>
    MEDICINES.map((m, i) => {
      // i=0 (빨간약) — player start 인접 셀에 강제 배치 (player가 가장 먼저 만나는 약)
      if (i === 0) return cellToWorld(maze.start.x + 1, maze.start.y, CELL_SIZE);
      return cellToWorld(m.cell.gx, m.cell.gy, CELL_SIZE);
    }),
  [maze]);

  const fittingRoomWorld = useMemo(() =>
    cellToWorld(FITTING_ROOM_CELL.gx, FITTING_ROOM_CELL.gy, CELL_SIZE),
  []);

  const itaewonCellWorld = useMemo(() => cellToWorld(3, 3, CELL_SIZE), []);

  useEffect(() => {
    const check = () => {
      const px = posState.x;
      const pz = posState.z;

      // Medicine pickup detection — last medicine ("다 먹음") gated until first 4 collected
      MEDICINES.forEach((med, i) => {
        if (!collected.has(i)) {
          const isLast = i === MEDICINES.length - 1;
          if (isLast && collected.size < MEDICINES.length - 1) return;
          const wp = medPositions[i];
          const dist = Math.sqrt((px - wp.x) ** 2 + (pz - wp.z) ** 2);
          if (dist < CELL_SIZE * 0.6) {
            setCollected(prev => {
              const next = new Set(prev).add(i);
              onCollectedChange?.(next);
              return next;
            });
            addToCart(med.name);
            play(med.soundSlot);
            setActiveEffect(med.effect, med.duration);
            setNotification(med.name);
            triggerEvent(`ch3_med_${i}`);
            setTimeout(() => setNotification(null), 2000);
            onDrugPickup?.(i);
          }
        }
      });

      // 시착실 = 엘리베이터 portal — proximity-only state (E-confirm in Ch3Scene)
      const elevDist = Math.sqrt((px - fittingRoomWorld.x) ** 2 + (pz - fittingRoomWorld.z) ** 2);
      onElevatorZoneChange?.(elevDist < CELL_SIZE * 0.6);

      // Exit zone — gated until all 5 medicines collected, E-confirm in Ch3Scene
      if (collected.size === MEDICINES.length) {
        const exitDist = Math.sqrt((px - exitWorld.x) ** 2 + (pz - exitWorld.z) ** 2);
        onExitZoneChange?.(exitDist < 2);
      } else {
        onExitZoneChange?.(false);
      }
    };

    const interval = setInterval(check, 100);
    return () => clearInterval(interval);
  }, [posState, collected, medPositions, exitWorld, fittingRoomWorld, addToCart, play, setActiveEffect, setNotification, triggerEvent, onDrugPickup, onCollectedChange, onElevatorZoneChange, onExitZoneChange]);

  const frameCount = useRef(0);
  const handlePosition = (x: number, z: number) => {
    frameCount.current++;
    if (frameCount.current % 6 === 0) {
      setPosState({ x, z });
      onPlayerMove?.({ x, z });
    }
  };

  return (
    <>
      <FlickerLight />
      <directionalLight position={[mazeWorldSize / 2, 20, mazeWorldSize / 2]} intensity={0.7} />
      {/* STEP 8: Post-processing — Vignette + Noise */}
      <Ch3Effects />

      <MazeFloor />
      <MazeWalls maze={maze} />

      {/* Medicine pickups in maze cells — last ("다 먹음") hidden until first 4 collected */}
      {MEDICINES.map((med, i) => {
        const isLast = i === MEDICINES.length - 1;
        if (isLast && collected.size < MEDICINES.length - 1) return null;
        return (
          <MedicinePickup
            key={i}
            med={med}
            worldPos={medPositions[i]}
            collected={collected.has(i)}
          />
        );
      })}

      {/* 시착실 = 엘리베이터 portal at center */}
      <FittingRoom worldPos={fittingRoomWorld} />

      {/* STEP 5: Itaewon memorial layer at cell (3,3) */}
      <ItaewonLayer
        cellWorldPos={itaewonCellWorld}
        cellSize={CELL_SIZE}
        mazeSize={MAZE_SIZE}
        playerPos={posState}
        wallAABBs={wallAABBs}
      />

      {/* Exit marker — hidden until all 5 medicines collected, then 1s fade-in */}
      <ExitMarker worldPos={exitWorld} visible={collected.size === MEDICINES.length} />

      <PlayerController
        mode="1st"
        showCharacter
        collisionWalls={wallAABBs}
        bounds={{ minX: 0.5, maxX: mazeWorldSize - 0.5, minZ: 0.5, maxZ: mazeWorldSize - 0.5 }}
        onPosition={handlePosition}
        startPosition={[startWorld.x, 0.5, startWorld.z]}
        initialLookDir={[0, 1]}
        gridCellSize={CELL_SIZE}
        gridInputCooldown={0.4}
      />
    </>
  );
};

export const Ch3Scene: React.FC = () => {
  const [maze, setMaze] = useState<MazeData>(() =>
    generateMaze(MAZE_SIZE, MAZE_SIZE, { seed: Math.floor(Math.random() * 0xFFFFFFFF) }, CELL_SIZE),
  );
  const handleDrugPickup = useCallback((drugIndex: number) => {
    const profile = MEDICINES[drugIndex].mazeProfile;
    const newSeed = Math.floor(Math.random() * 0xFFFFFFFF);
    setMaze(generateMaze(MAZE_SIZE, MAZE_SIZE, { seed: newSeed, ...profile }, CELL_SIZE));
  }, []);
  const startWorld = useMemo(() => cellToWorld(maze.start.x, maze.start.y, CELL_SIZE), [maze]);
  const [playerPos, setPlayerPos] = useState({ x: startWorld.x, z: startWorld.z });
  const [cutscenePhase, setCutscenePhase] = useState<CutscenePhase>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 3000);
    return () => clearTimeout(t);
  }, []);
  const { play, loop } = useSoundManager();

  // 마트 앰비언스 — 챕터 진입 시 loop, 엘리베이터/우주 cutscene 동안엔 정지
  useEffect(() => {
    if (cutscenePhase) {
      loop('mart_bgm', false);
    } else {
      loop('mart_bgm', true);
    }
    return () => loop('mart_bgm', false);
  }, [cutscenePhase, loop]);
  const [collectedSet, setCollectedSet] = useState<Set<number>>(new Set());
  const [atElevator, setAtElevator] = useState(false);
  const [atExit, setAtExit] = useState(false);
  const cartItems = useGameStore(s => s.cartItems);
  const removeFromCart = useGameStore(s => s.removeFromCart);
  const setNotification = useGameStore(s => s.setNotification);
  const notification = useGameStore(s => s.notification);
  const goToChapter = useGameStore(s => s.goToChapter);
  const triggerEvent = useGameStore(s => s.triggerEvent);
  const elevatorVisited = useGameStore(s => s.visitedEvents.has('ch3_elevator'));
  const devMode = useDevMode();
  const [muted, toggleMute] = useMute();

  // Minimap markers: 시착실(=엘리베이터) magenta + 약 위치 (수집 전) + 출구(전부 모은 후).
  const minimapMarkers = useMemo<MinimapMarker[]>(() => {
    const fr = cellToWorld(FITTING_ROOM_CELL.gx, FITTING_ROOM_CELL.gy, CELL_SIZE);
    const markers: MinimapMarker[] = [
      { x: fr.x, z: fr.z, color: '#c040ff', radius: 3.5, glow: true },
    ];
    MEDICINES.forEach((med, i) => {
      if (collectedSet.has(i)) return;
      const isLast = i === MEDICINES.length - 1;
      if (isLast && collectedSet.size < MEDICINES.length - 1) return;
      // medPositions와 동일 logic — i=0 (빨간약)은 player start 인접 셀
      const wp = (i === 0)
        ? cellToWorld(maze.start.x + 1, maze.start.y, CELL_SIZE)
        : cellToWorld(med.cell.gx, med.cell.gy, CELL_SIZE);
      markers.push({ x: wp.x, z: wp.z, color: med.color, radius: 2 });
    });
    if (collectedSet.size === MEDICINES.length) {
      const ex = cellToWorld(MAZE_SIZE - 1, MAZE_SIZE - 1, CELL_SIZE);
      markers.push({ x: ex.x, z: ex.z, color: '#0f0', radius: 3, glow: true });
    }
    return markers;
  }, [collectedSet, maze]);

  // Elevator cutscene sequencer
  const startElevatorCutscene = useCallback(() => {
    setCutscenePhase('elevator');
    startElevatorMusic();

    // Phase 1 → Phase 2
    setTimeout(() => {
      setCutscenePhase('space');
    }, ELEVATOR_DURATION);

    // Phase 2 → returning (fade out)
    setTimeout(() => {
      setCutscenePhase('returning');
      endElevatorMusic();
    }, ELEVATOR_DURATION + SPACE_DURATION);

    // Done — back to maze
    setTimeout(() => {
      setCutscenePhase(null);
    }, ELEVATOR_DURATION + SPACE_DURATION + RETURN_FADE);
  }, []);

  // E 키 — 엘리베이터/출구 진입 확정
  const showElevatorPrompt = atElevator && !elevatorVisited && !cutscenePhase;
  const showExitPrompt = atExit && !cutscenePhase;
  useEffect(() => {
    if (!showElevatorPrompt && !showExitPrompt) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE') return;
      e.preventDefault();
      if (showExitPrompt) {
        triggerEvent('ch3_exit');
        play('transition');
        goToChapter('CH4');
      } else if (showElevatorPrompt) {
        triggerEvent('ch3_elevator');
        startElevatorCutscene();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showElevatorPrompt, showExitPrompt, triggerEvent, goToChapter, startElevatorCutscene]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <Canvas camera={{ fov: 75, position: [startWorld.x, 1.8, startWorld.z] }} style={{ background: '#0a0a0a' }}>
        <Ch3Inner
          maze={maze}
          onPlayerMove={setPlayerPos}
          onElevatorZoneChange={setAtElevator}
          onExitZoneChange={setAtExit}
          onDrugPickup={handleDrugPickup}
          onCollectedChange={setCollectedSet}
        />
        <SceneExporter chapter="ch3" />
      </Canvas>

      {/* Elevator cutscene overlay */}
      <ElevatorCutscene phase={cutscenePhase} />

      {/* Door E-confirm prompts */}
      {(showElevatorPrompt || showExitPrompt) && (
        <div style={{
          position: 'fixed',
          left: '50%',
          bottom: '14%',
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
          {showExitPrompt ? '[E] 나가기' : '[E] 들어가기'}
        </div>
      )}

      {/* Hide minimap & UI during cutscene */}
      {!cutscenePhase && (
        <Minimap maze={maze} playerX={playerPos.x} playerZ={playerPos.z} cellSize={CELL_SIZE} markers={minimapMarkers} showExit={collectedSet.size === MEDICINES.length} />
      )}

      {/* Notification */}
      {notification && !cutscenePhase && (
        <div style={{
          position: 'fixed',
          top: '40%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(0,0,0,0.8)',
          color: '#fff',
          padding: '20px 40px',
          fontFamily: '"Unifont", monospace',
          fontSize: 24,
          border: '1px solid #fff',
          zIndex: 300,
          pointerEvents: 'none',
          animation: 'fadeinout 2s forwards',
        }}>
          {notification}
        </div>
      )}

      {/* STEP 4: Cart UI — clickable items, discard → replace */}
      {!cutscenePhase && cartItems.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          gap: 6,
          zIndex: 200,
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: '90vw',
        }}>
          {cartItems.map((item, i) => (
            <GlitchCartButton key={`${i}-${item}`} item={item} />
          ))}
        </div>
      )}

      {/* Dev Panel — toggle with ` key */}
      {devMode && (
        <div style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.85)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 6,
          padding: '10px 14px',
          fontFamily: '"Unifont", monospace',
          fontSize: 11,
          color: '#ccc',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          minWidth: 180,
        }}>
          <div style={{ color: '#ff0', fontSize: 10, letterSpacing: 2, marginBottom: 2 }}>DEV MODE</div>
          <div style={{ color: '#888', fontSize: 10 }}>
            pos: {playerPos.x.toFixed(1)}, {playerPos.z.toFixed(1)}
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <DevButton label="Elevator Cutscene" onClick={() => { if (!cutscenePhase) startElevatorCutscene(); }} />
          <DevButton label="Skip → CH4" onClick={() => goToChapter('CH4')} />
          <DevButton label="Skip → CH2" onClick={() => goToChapter('CH2')} />
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
          animation: 'ch3LoadingFadeOut 0.25s ease-in 2.75s forwards',
        }}>
          <div style={{ fontSize: 26, marginBottom: 14, animation: 'ch3LoadingSpin 1s linear infinite' }}>↻</div>
          <div style={{ fontSize: 15, letterSpacing: 8, marginBottom: 56 }}>l o a d i n g . . .</div>
          <div style={{ fontSize: 13, lineHeight: 1.75, textAlign: 'center' }}>
            팁: 상대방이 말할 때 고개를 천천히 끄덕이면 경청하는 것처럼 보입니다.
          </div>
          <style>{`
            @keyframes ch3LoadingSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes ch3LoadingFadeOut { to { opacity: 0; } }
          `}</style>
        </div>
      )}
    </div>
  );
};

const DevButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    onClick={(e) => { onClick(); e.currentTarget.blur(); }}
    style={{
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 3,
      color: '#ddd',
      fontFamily: '"Unifont", monospace',
      fontSize: 11,
      padding: '4px 8px',
      cursor: 'pointer',
      textAlign: 'left',
    }}
    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
  >
    {label}
  </button>
);
