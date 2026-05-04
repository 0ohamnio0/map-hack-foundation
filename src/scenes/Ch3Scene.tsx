import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Minimap, type MinimapMarker } from '@/components/game/Minimap';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { MeshReflectorMaterial } from '@react-three/drei';
import { PlayerController, type WallAABB } from '@/components/game/PlayerController';
import { useGameStore } from '@/store/useGameStore';
import { useSoundManager } from '@/hooks/useSoundManager';
import { generateMaze, cellToWorld, type MazeData } from '@/utils/mazeGenerator';
import { useDevMode } from '@/hooks/useDevMode';
import { Ch3Effects } from '@/components/effects/ChapterEffects';
import { StarNestOverlay } from '@/components/effects/StarNestOverlay';
import { ItaewonLayer } from '@/components/game/ItaewonLayer';

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

/** InstancedMesh walls for performance */
const MazeWalls: React.FC<{ maze: MazeData }> = ({ maze }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => makeSnapMaterial('#555'), []);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    maze.wallPositions.forEach((w, i) => {
      dummy.position.set(w.x, WALL_HEIGHT / 2, w.z);
      dummy.scale.set(w.scaleX, WALL_HEIGHT, w.scaleZ);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [maze]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, maze.wallPositions.length]} material={material} frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
};

const MazeFloor: React.FC = () => {
  const size = MAZE_SIZE * CELL_SIZE;
  const material = useMemo(() => makeSnapMaterial('#aaa'), []);
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
      lightRef.current.intensity = 0.3 + Math.sin(clock.elapsedTime * 8) * 0.08 + Math.sin(clock.elapsedTime * 13) * 0.04;
    }
  });
  return <ambientLight ref={lightRef} intensity={0.3} color="#f0f0e8" />;
};

const MEDICINES = [
  { name: '기분안정제', color: '#ff3333', effect: 'desaturate', duration: 8000, soundSlot: 'gulp_red', cell: { gx: 2, gy: 2 }, mazeProfile: { removalRatio: 0.1 } },
  { name: '항정신병약', color: '#3366ff', effect: 'blur', duration: 10000, soundSlot: 'gulp_blue', cell: { gx: 5, gy: 3 }, mazeProfile: { removalRatio: 0 } },
  { name: '수면제', color: '#ffcc00', effect: 'darken', duration: 8000, soundSlot: 'gulp_yellow', cell: { gx: 3, gy: 6 }, mazeProfile: { removalRatio: 0.05 } },
  { name: '항불안제', color: '#33cc33', effect: 'anxiolytic', duration: 6000, soundSlot: 'gulp_green', cell: { gx: 7, gy: 7 }, mazeProfile: { removalRatio: 0.3 } },
  { name: '다 먹음', color: '#ffffff', effect: 'whiteflash', duration: 1800, soundSlot: 'gulp_white', cell: { gx: 8, gy: 5 }, mazeProfile: { removalRatio: 0.6 } },
];

// --- Fitting room + mirror at center ---
const FITTING_ROOM_CELL = { gx: Math.floor(MAZE_SIZE / 2), gy: Math.floor(MAZE_SIZE / 2) }; // (5, 5)

// Cells that are "reserved" and can't be used for the elevator
const RESERVED_CELLS = new Set([
  '0,0',   // start
  '9,9',   // end
  `${FITTING_ROOM_CELL.gx},${FITTING_ROOM_CELL.gy}`,
  ...MEDICINES.map(m => `${m.cell.gx},${m.cell.gy}`),
]);

/** Pick a random non-reserved cell for the space elevator */
function pickElevatorCell(): { gx: number; gy: number } {
  const candidates: { gx: number; gy: number }[] = [];
  for (let y = 0; y < MAZE_SIZE; y++) {
    for (let x = 0; x < MAZE_SIZE; x++) {
      if (!RESERVED_CELLS.has(`${x},${y}`)) candidates.push({ gx: x, gy: y });
    }
  }
  return candidates[Math.floor(Math.random() * candidates.length)];
}

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
      {/* Mirror frame */}
      <mesh position={[0, 1.5, 1.48]}>
        <boxGeometry args={[1.35, 2.15, 0.03]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      {/* Mirror — real planar reflection using MeshReflectorMaterial */}
      <mesh position={[0, 1.5, 1.5]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[1.2, 2]} />
        <MeshReflectorMaterial
          mirror={0.85}
          resolution={512}
          mixBlur={0.3}
          mixStrength={1}
          blur={[200, 100]}
          color="#aaccdd"
          metalness={0.9}
          roughness={0.05}
        />
      </mesh>
    </group>
  );
};

/** Space elevator portal — rotating, glowing */
const SpaceElevator: React.FC<{ worldPos: { x: number; z: number } }> = ({ worldPos }) => {
  const groupRef = useRef<THREE.Group>(null);
  const ringRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (ringRef.current) {
      ringRef.current.rotation.y = clock.elapsedTime * 1.5;
      ringRef.current.rotation.z = clock.elapsedTime * 0.7;
      ringRef.current.position.y = 1.5 + Math.sin(clock.elapsedTime * 2) * 0.15;
    }
  });

  return (
    <group ref={groupRef} position={[worldPos.x, 0, worldPos.z]}>
      {/* Base pad */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1, 24]} />
        <meshStandardMaterial color="#112233" emissive="#00e5ff" emissiveIntensity={0.15} />
      </mesh>
      {/* Rotating ring */}
      <mesh ref={ringRef} position={[0, 1.5, 0]}>
        <torusGeometry args={[0.8, 0.08, 8, 24]} />
        <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={0.6} />
      </mesh>
      {/* Inner glow pillar */}
      <mesh position={[0, 1.5, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 2.5, 8]} />
        <meshStandardMaterial color="#00e5ff" emissive="#00e5ff" emissiveIntensity={0.3} transparent opacity={0.4} />
      </mesh>
    </group>
  );
};

// --- Elevator Cutscene ---
type CutscenePhase = 'elevator' | 'space' | 'returning' | null;

const ELEVATOR_DURATION = 10000; // 10s elevator interior
const SPACE_DURATION = 15000;    // 15s space scene
const RETURN_FADE = 800;        // fade back

const ElevatorCutscene: React.FC<{
  phase: CutscenePhase;
}> = ({ phase }) => {
  const [floor, setFloor] = useState(1);
  const [lookUp, setLookUp] = useState(false);
  const [stars, setStars] = useState<{ x: number; y: number; size: number; opacity: number; speed: number }[]>([]);
  const [earthY, setEarthY] = useState(80);
  const animRef = useRef<number>(0);

  // Auto floor counter
  useEffect(() => {
    if (phase !== 'elevator') { setFloor(1); setLookUp(false); return; }
    const interval = setInterval(() => {
      setFloor(f => (f < 99 ? f + 1 : f));
    }, 200);
    return () => clearInterval(interval);
  }, [phase]);

  // Up arrow = look up (hold)
  useEffect(() => {
    if (phase !== 'elevator') return;
    const down = (e: KeyboardEvent) => { if (e.key === 'ArrowUp') setLookUp(true); };
    const up = (e: KeyboardEvent) => { if (e.key === 'ArrowUp') setLookUp(false); };
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
    transition: 'opacity 0.6s ease',
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

        {/* Back wall bg — fills entire view */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: '16%', bottom: 0,
          background: 'linear-gradient(180deg, #08080a 0%, #111114 30%, #161619 60%, #111114 100%)',
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
          background: 'linear-gradient(90deg, #0c0c0f 0%, #141417 100%)',
          borderRight: '1px solid rgba(255,255,255,0.03)',
        }}>
          <div style={{
            position: 'absolute', right: '35%', top: 0, bottom: 0,
            width: 1, background: 'rgba(255,255,255,0.03)',
          }} />
        </div>

        {/* Right wall */}
        <div style={{
          position: 'absolute', right: 0, top: '22%', bottom: 0, width: '15%',
          background: 'linear-gradient(-90deg, #0c0c0f 0%, #141417 100%)',
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
            fontFamily: 'monospace', fontSize: 12, color: '#ff3300',
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
            fontFamily: "'Courier New', monospace",
            fontSize: 36,
            fontWeight: 'bold',
            color: '#ff3300',
            textShadow: '0 0 15px rgba(255,50,0,0.5)',
            letterSpacing: 6,
          }}>
            {floor >= 99 ? '∞' : String(floor).padStart(2, '0')}
          </div>
          <div style={{
            fontFamily: 'monospace', fontSize: 8, color: 'rgba(255,255,255,0.2)',
            letterSpacing: 3, marginTop: 2,
          }}>
            FLOOR
          </div>
        </div>

        {/* Button panel (right wall, near camera) */}
        <div style={{
          position: 'absolute',
          right: '2%', top: '42%',
          width: 120, height: 400,
          background: 'linear-gradient(180deg, #1c1c20, #18181c)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 5,
          padding: '14px 12px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
        }}>
          {['★', '99', '80', '60', '40', '20', '10', '5', '1', 'B1'].map((label, i) => (
            <div key={i} style={{
              width: 80, height: 28,
              borderRadius: 4,
              background: i === 0 ? 'rgba(255,200,0,0.25)' : 'rgba(255,255,255,0.06)',
              border: `1px solid ${i === 0 ? 'rgba(255,200,0,0.3)' : 'rgba(255,255,255,0.08)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'monospace', fontSize: 14,
              color: i === 0 ? '#ffcc00' : 'rgba(255,255,255,0.3)',
              letterSpacing: 1,
            }}>
              {label}
            </div>
          ))}
          <div style={{ marginTop: 8, display: 'flex', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,50,0,0.15)', border: '1px solid rgba(255,50,0,0.3)' }} />
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(255,200,0,0.12)', border: '1px solid rgba(255,200,0,0.25)' }} />
          </div>
        </div>

        {/* Handrail (left wall, near camera) */}
        <div style={{
          position: 'absolute',
          left: '2%', top: '60%', right: '75%', height: 5,
          background: 'linear-gradient(90deg, rgba(180,180,180,0.15), rgba(180,180,180,0.06))',
          borderRadius: 3,
        }} />
        <div style={{
          position: 'absolute',
          left: '2%', top: '58%', width: 5, height: 24,
          background: 'rgba(180,180,180,0.1)',
          borderRadius: 2,
        }} />

        </div>{/* end viewport container */}

        {/* ▲ key hint — fixed, outside viewport shift */}
        <div style={{
          position: 'absolute', bottom: '6%', left: '50%', transform: 'translateX(-50%)',
          fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.12)',
          letterSpacing: 3,
          opacity: lookUp ? 0 : 1,
          transition: 'opacity 0.3s ease',
          animation: 'fadeInSlow 3s ease-in forwards',
        }}>
          ▲
        </div>

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
  if (phase === 'space') {
    return (
      <div style={fadeStyle}>
        {/* STEP 9: Star Nest shader background (REF-7) */}
        <StarNestOverlay duration={SPACE_DURATION / 1000} />

        {/* Character silhouette — floating in space */}
        <div style={{
          position: 'fixed',
          left: '50%',
          top: `${earthY}%`,
          transform: 'translateX(-50%)',
          zIndex: 1002,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          opacity: 0.6,
          filter: 'drop-shadow(0 0 20px rgba(255,255,255,0.15))',
          transition: 'top 0.5s ease-out',
        }}>
          {/* Head */}
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: 'rgba(255,255,255,0.8)',
            marginBottom: 4,
          }} />
          {/* Body */}
          <div style={{
            width: 20, height: 40, borderRadius: '10px 10px 4px 4px',
            background: 'rgba(255,255,255,0.7)',
            marginBottom: 2,
          }} />
          {/* Arms */}
          <div style={{
            position: 'absolute', top: 32, width: 56, height: 6,
            display: 'flex', justifyContent: 'space-between',
          }}>
            <div style={{ width: 16, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.5)', transform: 'rotate(-20deg)' }} />
            <div style={{ width: 16, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.5)', transform: 'rotate(20deg)' }} />
          </div>
          {/* Legs */}
          <div style={{ display: 'flex', gap: 4 }}>
            <div style={{ width: 8, height: 30, borderRadius: '0 0 4px 4px', background: 'rgba(255,255,255,0.6)' }} />
            <div style={{ width: 8, height: 30, borderRadius: '0 0 4px 4px', background: 'rgba(255,255,255,0.6)' }} />
          </div>
        </div>

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
          fontFamily: "'Courier New', monospace",
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

  // --- Returning (fade out overlay) ---
  if (phase === 'returning') {
    return (
      <div style={{
        ...fadeStyle,
        background: '#000',
        transition: `opacity ${RETURN_FADE}ms ease`,
      }} />
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

const Ch3Inner: React.FC<{
  maze: MazeData;
  elevatorCell: { gx: number; gy: number };
  onPlayerMove?: (pos: { x: number; z: number }) => void;
  onElevatorEnter?: () => void;
}> = ({ maze, elevatorCell, onPlayerMove, onElevatorEnter }) => {
  const goToChapter = useGameStore(s => s.goToChapter);
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
    MEDICINES.map(m => cellToWorld(m.cell.gx, m.cell.gy, CELL_SIZE)),
  []);

  const fittingRoomWorld = useMemo(() =>
    cellToWorld(FITTING_ROOM_CELL.gx, FITTING_ROOM_CELL.gy, CELL_SIZE),
  []);

  const elevatorWorld = useMemo(() =>
    cellToWorld(elevatorCell.gx, elevatorCell.gy, CELL_SIZE),
  [elevatorCell]);

  const itaewonCellWorld = useMemo(() => cellToWorld(3, 3, CELL_SIZE), []);

  useEffect(() => {
    const check = () => {
      const px = posState.x;
      const pz = posState.z;

      // Medicine pickup detection
      MEDICINES.forEach((med, i) => {
        if (!collected.has(i)) {
          const wp = medPositions[i];
          const dist = Math.sqrt((px - wp.x) ** 2 + (pz - wp.z) ** 2);
          if (dist < CELL_SIZE * 0.6) {
            setCollected(prev => new Set(prev).add(i));
            addToCart(med.name);
            play(med.soundSlot);
            setActiveEffect(med.effect, med.duration);
            setNotification(med.name);
            triggerEvent(`ch3_med_${i}`);
            setTimeout(() => setNotification(null), 2000);
          }
        }
      });

      // Fitting room / mirror detection
      const mirrorDist = Math.sqrt((px - fittingRoomWorld.x) ** 2 + (pz - fittingRoomWorld.z) ** 2);
      if (mirrorDist < CELL_SIZE * 0.6) {
        if (triggerEvent('ch3_mirror')) {
          setNotification('시착실');
          setActiveEffect('blur', 2000);
          setTimeout(() => setNotification(null), 2000);
        }
      }

      // Space elevator detection — triggers cutscene
      const elevDist = Math.sqrt((px - elevatorWorld.x) ** 2 + (pz - elevatorWorld.z) ** 2);
      if (elevDist < CELL_SIZE * 0.5) {
        if (triggerEvent('ch3_elevator')) {
          onElevatorEnter?.();
        }
      }

      // Exit detection
      const exitDist = Math.sqrt((px - exitWorld.x) ** 2 + (pz - exitWorld.z) ** 2);
      if (exitDist < 2) {
        if (triggerEvent('ch3_exit')) {
          goToChapter('CH4');
        }
      }
    };

    const interval = setInterval(check, 100);
    return () => clearInterval(interval);
  }, [posState, collected, medPositions, exitWorld, fittingRoomWorld, elevatorWorld, addToCart, play, setActiveEffect, setNotification, triggerEvent, goToChapter]);

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
      <directionalLight position={[mazeWorldSize / 2, 20, mazeWorldSize / 2]} intensity={0.3} />
      {/* STEP 8: Post-processing — Vignette + Noise */}
      <Ch3Effects />

      <MazeFloor />
      <MazeWalls maze={maze} />

      {/* Medicine pickups in maze cells */}
      {MEDICINES.map((med, i) => (
        <MedicinePickup
          key={i}
          med={med}
          worldPos={medPositions[i]}
          collected={collected.has(i)}
        />
      ))}

      {/* Fitting room + mirror at center */}
      <FittingRoom worldPos={fittingRoomWorld} />

      {/* Space elevator — random position each playthrough */}
      <SpaceElevator worldPos={elevatorWorld} />

      {/* STEP 5: Itaewon memorial layer at cell (3,3) */}
      <ItaewonLayer
        cellWorldPos={itaewonCellWorld}
        cellSize={CELL_SIZE}
        playerPos={posState}
      />

      {/* Exit marker */}
      <mesh position={[exitWorld.x, 1.5, exitWorld.z]}>
        <boxGeometry args={[1.5, 3, 0.3]} />
        <meshStandardMaterial color="#4a4" emissive="#0f0" emissiveIntensity={0.2} />
      </mesh>

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
  const maze = useMemo(() => generateMaze(MAZE_SIZE, MAZE_SIZE, undefined, CELL_SIZE), []);
  const startWorld = useMemo(() => cellToWorld(maze.start.x, maze.start.y, CELL_SIZE), [maze]);
  const elevatorCell = useMemo(() => pickElevatorCell(), []);
  const [playerPos, setPlayerPos] = useState({ x: startWorld.x, z: startWorld.z });
  const [cutscenePhase, setCutscenePhase] = useState<CutscenePhase>(null);
  const cartItems = useGameStore(s => s.cartItems);
  const removeFromCart = useGameStore(s => s.removeFromCart);
  const setNotification = useGameStore(s => s.setNotification);
  const notification = useGameStore(s => s.notification);
  const goToChapter = useGameStore(s => s.goToChapter);
  const devMode = useDevMode();

  // Minimap markers: fitting room (magenta) + elevator (cyan)
  const minimapMarkers = useMemo<MinimapMarker[]>(() => {
    const fr = cellToWorld(FITTING_ROOM_CELL.gx, FITTING_ROOM_CELL.gy, CELL_SIZE);
    const el = cellToWorld(elevatorCell.gx, elevatorCell.gy, CELL_SIZE);
    return [
      { x: fr.x, z: fr.z, color: '#c040ff', radius: 3.5, glow: true },
      { x: el.x, z: el.z, color: '#00e5ff', radius: 3, glow: true },
    ];
  }, [elevatorCell]);

  // Elevator cutscene sequencer
  const startElevatorCutscene = useCallback(() => {
    setCutscenePhase('elevator');

    // Phase 1 → Phase 2
    setTimeout(() => {
      setCutscenePhase('space');
    }, ELEVATOR_DURATION);

    // Phase 2 → returning (fade out)
    setTimeout(() => {
      setCutscenePhase('returning');
    }, ELEVATOR_DURATION + SPACE_DURATION);

    // Done — back to maze
    setTimeout(() => {
      setCutscenePhase(null);
    }, ELEVATOR_DURATION + SPACE_DURATION + RETURN_FADE);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <Canvas camera={{ fov: 75, position: [startWorld.x, 1.8, startWorld.z] }} style={{ background: '#0a0a0a' }}>
        <Ch3Inner
          maze={maze}
          elevatorCell={elevatorCell}
          onPlayerMove={setPlayerPos}
          onElevatorEnter={startElevatorCutscene}
        />
      </Canvas>

      {/* Elevator cutscene overlay */}
      <ElevatorCutscene phase={cutscenePhase} />

      {/* Hide minimap & UI during cutscene */}
      {!cutscenePhase && (
        <Minimap maze={maze} playerX={playerPos.x} playerZ={playerPos.z} cellSize={CELL_SIZE} markers={minimapMarkers} />
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
          fontFamily: 'monospace',
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
            <button
              key={`${i}-${item}`}
              onClick={() => {
                removeFromCart(i);
                setNotification('버려도 또 담겨 있다');
                setTimeout(() => setNotification(null), 2000);
              }}
              style={{
                padding: '4px 10px',
                fontFamily: 'monospace',
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
              {item}
            </button>
          ))}
        </div>
      )}

      {/* Dev Panel — toggle with ` key */}
      {devMode && (
        <div style={{
          position: 'fixed',
          top: 12,
          left: 12,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.85)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 6,
          padding: '10px 14px',
          fontFamily: 'monospace',
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
          <div style={{ color: '#888', fontSize: 10 }}>
            elevator cell: ({elevatorCell.gx}, {elevatorCell.gy})
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <DevButton label="Elevator Cutscene" onClick={() => { if (!cutscenePhase) startElevatorCutscene(); }} />
          <DevButton label="Skip → CH4" onClick={() => goToChapter('CH4')} />
          <DevButton label="Skip → CH2" onClick={() => goToChapter('CH2')} />
          <div style={{ color: '#555', fontSize: 9, marginTop: 2 }}>Q to close</div>
        </div>
      )}
    </div>
  );
};

const DevButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    onClick={onClick}
    style={{
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 3,
      color: '#ddd',
      fontFamily: 'monospace',
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
