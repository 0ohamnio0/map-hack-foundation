import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { type WallAABB } from '@/components/game/PlayerController';
import { useGameStore } from '@/store/useGameStore';
import { useKeyboard } from '@/hooks/useKeyboard';
import { useDevMode } from '@/hooks/useDevMode';

const WALL_HEIGHT = 4;
const PLAYER_HALF = 0.3;

// --- Movement tuning ---
const MOVE_SPEED = 8;
const ACCEL = 20;
const FRICTION = 7;
const CAM_FOLLOW_SPEED = 5; // how fast camera rotates to face movement dir

const FlickerLight: React.FC = () => {
  const lightRef = useRef<THREE.AmbientLight>(null);
  useFrame(({ clock }) => {
    if (lightRef.current) {
      lightRef.current.intensity = 0.4 + Math.sin(clock.elapsedTime * 8) * 0.1 + Math.sin(clock.elapsedTime * 13) * 0.05;
    }
  });
  return <ambientLight ref={lightRef} intensity={0.4} color="#f0f0e8" />;
};

/*
 * S-shaped winding street layout (top-down):
 *
 *  V1: x∈[-7, 7]   south from z=3 to z=-40
 *  H1: x∈[-7, 27]  east  at z∈[-30, -40]   (turn right)
 *  V2: x∈[13, 27]  south from z=-40 to z=-60
 *  H2: x∈[-7, 27]  west  at z∈[-60, -70]   (turn left)
 *  V3: x∈[-7, 7]   south from z=-70 to z=-90  (exit)
 */

// Wall segments: [centerX, centerZ, width(x), depth(z)]
const WALL_DEFS: [number, number, number, number][] = [
  // --- Outer perimeter ---
  [0,      3,      14.6,  0.3],     // north cap
  [7.15,  -13.5,   0.3,   33.3],    // right of V1 (z: 3 → -30)
  [17,    -30,     20.3,  0.3],     // top of H1 east portion
  [27.15, -50,     0.3,   40.3],    // right side continuous (z: -30 → -70)
  [17,    -70,     20.3,  0.3],     // bottom of H2 right portion
  [7.15,  -80,     0.3,   20.3],    // right of V3 (z: -70 → -90)
  [0,     -90,     14.6,  0.3],     // south cap
  [-7.15, -43.5,   0.3,   93.3],    // left side continuous (z: 3 → -90)

  // --- Inner walls (create the S-turns) ---
  [3,     -40,     20.3,  0.3],     // forces right turn
  [13,    -50,     0.3,   20.3],    // left wall of V2
  [3,     -60,     20.3,  0.3],     // forces left turn
];

// Precompute AABBs for collision
const wallAABBs: WallAABB[] = WALL_DEFS.map(([x, z, w, d]) => ({
  minX: x - w / 2,
  maxX: x + w / 2,
  minZ: z - d / 2,
  maxZ: z + d / 2,
}));

function collidesWithWalls(px: number, pz: number, walls: WallAABB[]): boolean {
  const pMinX = px - PLAYER_HALF, pMaxX = px + PLAYER_HALF;
  const pMinZ = pz - PLAYER_HALF, pMaxZ = pz + PLAYER_HALF;
  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    if (pMaxX > w.minX && pMinX < w.maxX && pMaxZ > w.minZ && pMinZ < w.maxZ) return true;
  }
  return false;
}

const StreetWalls: React.FC = () => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#bbb' }), []);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    WALL_DEFS.forEach(([x, z, w, d], i) => {
      dummy.position.set(x, WALL_HEIGHT / 2, z);
      dummy.scale.set(w, WALL_HEIGHT, d);
      dummy.updateMatrix();
      meshRef.current!.setMatrixAt(i, dummy.matrix);
    });
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, []);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, WALL_DEFS.length]} material={material}>
      <boxGeometry args={[1, 1, 1]} />
    </instancedMesh>
  );
};

// Decorative street objects
const DECOR: { x: number; z: number; w: number; d: number; h: number; color: string }[] = [
  { x: -5, z: -6,  w: 0.15, d: 0.15, h: 3.5, color: '#aa8800' },
  { x: 5,  z: -16, w: 0.15, d: 0.15, h: 3.5, color: '#aa8800' },
  { x: -5, z: -26, w: 0.15, d: 0.15, h: 3.5, color: '#aa8800' },
  { x: 15, z: -35, w: 1.2,  d: 1.2,  h: 1.5, color: '#777' },
  { x: 25, z: -48, w: 0.15, d: 0.15, h: 3.5, color: '#aa8800' },
  { x: 10, z: -65, w: 1.5,  d: 1.0,  h: 1.2, color: '#777' },
  { x: -5, z: -78, w: 0.15, d: 0.15, h: 3.5, color: '#aa8800' },
];

// --- Airport hallucination trigger lamppost ---
const AIRPORT_TRIGGER = { x: 5, z: -16, radius: 2.5 };

const AIRPORT_DURATION = 5200; // extended flashforward
const AIRPORT_FADE = 220;

const AirportCutscene: React.FC<{
  active: boolean;
  onDone: () => void;
}> = ({ active, onDone }) => {
  const [phase, setPhase] = useState<'in' | 'show' | 'out' | null>(null);

  useEffect(() => {
    if (!active) { setPhase(null); return; }
    setPhase('in');
    // fade in → show
    const t1 = setTimeout(() => setPhase('show'), AIRPORT_FADE);
    // show → fade out
    const t2 = setTimeout(() => setPhase('out'), AIRPORT_DURATION - AIRPORT_FADE);
    // done
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
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(180deg, rgba(159,208,255,0.72) 0%, rgba(125,183,243,0.6) 42%, rgba(217,231,247,0.5) 43%, rgba(240,243,248,0.4) 100%)',
        filter: 'contrast(1.08) saturate(1.08)',
        mixBlendMode: 'screen',
      }} />

      {/* Blue sky through curtain wall */}
      <div style={{
        position: 'absolute',
        left: '8%',
        right: '8%',
        top: '12%',
        bottom: '20%',
        border: '8px solid rgba(235,245,255,0.65)',
        boxShadow: 'inset 0 0 0 1px rgba(120,160,210,0.35)',
        background: 'linear-gradient(180deg, rgba(152,201,255,0.95) 0%, rgba(202,229,255,0.95) 65%, rgba(230,240,250,0.95) 100%)',
        opacity: 0.72,
        mixBlendMode: 'screen',
      }}>
        {[18, 36, 54, 72].map(x => (
          <div key={x} style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${x}%`,
            width: 2,
            background: 'rgba(195,215,240,0.7)',
          }} />
        ))}
        <div style={{
          position: 'absolute',
          left: '12%',
          top: '20%',
          width: 180,
          height: 40,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.55)',
          filter: 'blur(0.8px)',
        }} />
        <div style={{
          position: 'absolute',
          right: '18%',
          top: '30%',
          width: 140,
          height: 28,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.5)',
          filter: 'blur(0.8px)',
        }} />
      </div>
      {/* Gate text / airport cue */}
      <div style={{
        position: 'absolute',
        top: '18%',
        left: '50%',
        transform: 'translateX(-50%)',
        fontFamily: 'monospace',
        color: 'rgba(19,42,84,0.95)',
        letterSpacing: 7,
        fontSize: 15,
        textShadow: '0 0 15px rgba(255,255,255,0.7)',
        animation: 'airportPulse 0.2s steps(2, end) infinite',
      }}>
        GATE 14
      </div>

      {/* Escalator/figure silhouette */}
      <div style={{
        position: 'absolute',
        left: '15%',
        right: '15%',
        bottom: '22%',
        height: '28%',
        transform: 'skewY(-18deg)',
        borderTop: '1px solid rgba(202,220,255,0.22)',
        borderBottom: '1px solid rgba(202,220,255,0.15)',
        filter: 'blur(0.4px)',
      }}>
        <div style={{
          position: 'absolute',
          left: '62%',
          bottom: '30%',
          width: 10,
          height: 56,
          background: 'rgba(244,126,126,0.82)',
          boxShadow: '0 0 22px rgba(255,84,84,0.7)',
          animation: 'airportSlide 0.9s linear infinite',
        }} />
        <div style={{
          position: 'absolute',
          left: '60%',
          bottom: '63%',
          width: 42,
          height: 5,
          background: 'rgba(244,126,126,0.82)',
          boxShadow: '0 0 22px rgba(255,84,84,0.7)',
          animation: 'airportSlide 0.9s linear infinite',
        }} />
      </div>

      {/* Intense memory overlays */}
      {[
        { left: '6%', top: '10%', rot: -8, tint: 'rgba(255,70,70,0.34)', label: 'ANGEL' },
        { left: '67%', top: '22%', rot: 9, tint: 'rgba(70,120,255,0.28)', label: 'CROSS' },
        { left: '22%', top: '58%', rot: -5, tint: 'rgba(255,255,255,0.3)', label: 'RUNWAY' },
      ].map((card, i) => (
        <div
          key={card.label}
          style={{
            position: 'absolute',
            left: card.left,
            top: card.top,
            width: 190,
            height: 108,
            transform: `rotate(${card.rot}deg)`,
            background: `linear-gradient(135deg, rgba(255,255,255,0.62), ${card.tint})`,
            border: '1px solid rgba(255,255,255,0.65)',
            boxShadow: '0 10px 24px rgba(0,0,0,0.2)',
            mixBlendMode: 'screen',
            animation: `airportCardFlicker ${0.65 + i * 0.1}s steps(2, end) infinite`,
          }}
        >
          <div style={{
            position: 'absolute',
            left: 10,
            top: 10,
            fontFamily: 'monospace',
            fontSize: 10,
            letterSpacing: 2,
            color: 'rgba(14,28,54,0.8)',
          }}>
            {card.label}
          </div>
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 30% 40%, rgba(255,255,255,0.7) 0%, transparent 52%)',
          }} />
        </div>
      ))}

      {/* Hallucination phrases */}
      <div style={{
        position: 'absolute',
        left: '8%',
        top: '12%',
        fontFamily: 'monospace',
        color: 'rgba(255,255,255,0.85)',
        fontSize: 12,
        letterSpacing: 2,
        lineHeight: 1.8,
        textTransform: 'uppercase',
        animation: 'airportGlitch 0.14s steps(2, end) infinite',
        mixBlendMode: 'screen',
      }}>
        <div>boarding</div>
        <div>departure</div>
        <div>where are you</div>
      </div>

      {/* Scanlines */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.07) 0, rgba(255,255,255,0.07) 1px, transparent 1px, transparent 3px)',
        mixBlendMode: 'screen',
        opacity: 0.24,
        animation: 'airportRoll 0.24s linear infinite',
      }} />

      {/* moderated white flash pulses */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(255,255,255,0.9)',
        mixBlendMode: 'color-dodge',
        animation: 'airportStrobe 0.36s steps(2, end) infinite',
      }} />

      {/* chromatic fringe */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(90deg, rgba(255,40,40,0.16), transparent 28%, transparent 72%, rgba(80,140,255,0.16))',
        mixBlendMode: 'screen',
        animation: 'airportGlitch 0.15s steps(2, end) infinite',
      }} />

      <style>{`
        @keyframes airportPulse {
          0% { opacity: 0.45; transform: translateX(-50%) scale(0.995); }
          100% { opacity: 1; transform: translateX(-50%) scale(1.025); }
        }
        @keyframes airportGlitch {
          0% { transform: translate(0, 0); opacity: 0.95; }
          50% { transform: translate(-2px, 1px); opacity: 0.55; }
          100% { transform: translate(2px, -1px); opacity: 0.95; }
        }
        @keyframes airportSlide {
          0% { transform: translate(0, 0); opacity: 0.95; }
          100% { transform: translate(-220px, -110px); opacity: 0.16; }
        }
        @keyframes airportRoll {
          0% { transform: translateY(0); }
          100% { transform: translateY(3px); }
        }
        @keyframes airportStrobe {
          0%, 42% { opacity: 0; }
          43%, 56% { opacity: 0.35; }
          57%, 100% { opacity: 0; }
        }
        @keyframes airportCardFlicker {
          0% { opacity: 0.2; }
          50% { opacity: 0.62; }
          100% { opacity: 0.28; }
        }
        @keyframes airportCameraShake {
          0% { transform: translate(0, 0) rotate(0deg); }
          25% { transform: translate(-1px, 1px) rotate(-0.07deg); }
          50% { transform: translate(1px, -1px) rotate(0.07deg); }
          75% { transform: translate(-1px, 0px) rotate(-0.05deg); }
          100% { transform: translate(1px, 1px) rotate(0.05deg); }
        }
      `}</style>
    </div>
  );
};

/** Smooth first-person controller — runs every frame, no snap, smooth camera follow */
const SmoothPlayerController: React.FC<{
  onPosition?: (x: number, z: number) => void;
  disabled?: boolean;
}> = ({ onPosition, disabled }) => {
  const { camera } = useThree();
  const keys = useKeyboard();

  const pos = useRef(new THREE.Vector3(0, 1.6, 0));
  const vel = useRef(new THREE.Vector2(0, 0));
  const lookDir = useRef(new THREE.Vector2(0, -1)); // facing south initially

  useFrame((_, rawDelta) => {
    if (disabled) return;
    const dt = Math.min(rawDelta, 0.05); // cap to avoid big jumps
    const k = keys.current;

    // --- Input (world-axis) ---
    let ix = 0, iz = 0;
    if (k.has('ArrowLeft') || k.has('KeyA')) ix -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) ix += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) iz -= 1;   // -Z = south = "forward"
    if (k.has('ArrowDown') || k.has('KeyS')) iz += 1;

    // Normalize diagonal so you don't go faster
    const inputLen = Math.sqrt(ix * ix + iz * iz);
    if (inputLen > 0) { ix /= inputLen; iz /= inputLen; }

    // --- Accelerate / friction ---
    if (inputLen > 0) {
      vel.current.x += ix * ACCEL * dt;
      vel.current.y += iz * ACCEL * dt;
    }
    vel.current.x *= Math.exp(-FRICTION * dt);
    vel.current.y *= Math.exp(-FRICTION * dt);

    // Cap speed
    const speed = vel.current.length();
    if (speed > MOVE_SPEED) vel.current.multiplyScalar(MOVE_SPEED / speed);

    // --- Move with per-axis collision ---
    const newX = pos.current.x + vel.current.x * dt;
    const newZ = pos.current.z + vel.current.y * dt;

    if (!collidesWithWalls(newX, pos.current.z, wallAABBs)) {
      pos.current.x = newX;
    } else {
      vel.current.x = 0;
    }
    if (!collidesWithWalls(pos.current.x, newZ, wallAABBs)) {
      pos.current.z = newZ;
    } else {
      vel.current.y = 0;
    }

    // --- Smooth camera look direction ---
    if (speed > 0.3) {
      const targetX = vel.current.x / speed;
      const targetZ = vel.current.y / speed;
      const lf = 1 - Math.exp(-CAM_FOLLOW_SPEED * dt);
      lookDir.current.x += (targetX - lookDir.current.x) * lf;
      lookDir.current.y += (targetZ - lookDir.current.y) * lf;
      // Re-normalize
      const ldLen = lookDir.current.length();
      if (ldLen > 0.01) {
        lookDir.current.x /= ldLen;
        lookDir.current.y /= ldLen;
      }
    }

    // --- Apply to camera ---
    camera.position.set(pos.current.x, 1.6, pos.current.z);
    camera.lookAt(
      pos.current.x + lookDir.current.x * 10,
      1.6,
      pos.current.z + lookDir.current.y * 10,
    );

    onPosition?.(pos.current.x, pos.current.z);
  });

  return null; // invisible — only drives the camera
};

const Ch2Inner: React.FC<{
  onAirportTrigger?: () => void;
  freezeControls?: boolean;
}> = ({ onAirportTrigger, freezeControls }) => {
  const goToChapter = useGameStore(s => s.goToChapter);
  const triggerEvent = useGameStore(s => s.triggerEvent);
  const playerPos = useRef({ x: 0, z: 0 });

  useEffect(() => {
    const check = () => {
      const px = playerPos.current.x;
      const pz = playerPos.current.z;

      // Airport hallucination trigger — lamppost at (5, -16)
      const dx = px - AIRPORT_TRIGGER.x;
      const dz = pz - AIRPORT_TRIGGER.z;
      if (Math.sqrt(dx * dx + dz * dz) < AIRPORT_TRIGGER.radius) {
        if (triggerEvent('ch2_airport')) {
          onAirportTrigger?.();
        }
      }

      // Exit
      if (pz < -85) {
        if (triggerEvent('ch2_exit')) {
          goToChapter('CH3');
        }
      }
    };
    const interval = setInterval(check, 100);
    return () => clearInterval(interval);
  }, [triggerEvent, goToChapter, onAirportTrigger]);

  return (
    <>
      <FlickerLight />
      <directionalLight position={[10, 15, -40]} intensity={0.4} />

      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[10, 0, -43]}>
        <planeGeometry args={[50, 100]} />
        <meshStandardMaterial color="#888" />
      </mesh>

      <StreetWalls />

      {/* Decorative street objects */}
      {DECOR.map((obj, i) => (
        <mesh key={i} position={[obj.x, obj.h / 2, obj.z]}>
          <boxGeometry args={[obj.w, obj.h, obj.d]} />
          <meshStandardMaterial color={obj.color} />
        </mesh>
      ))}

      {/* Exit marker */}
      <mesh position={[0, 1.5, -87]}>
        <boxGeometry args={[3, 3, 0.3]} />
        <meshStandardMaterial color="#4a4" emissive="#0f0" emissiveIntensity={0.2} />
      </mesh>

      <SmoothPlayerController
        disabled={freezeControls}
        onPosition={(x, z) => { playerPos.current = { x, z }; }}
      />
    </>
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

export const Ch2Scene: React.FC = () => {
  const [airportActive, setAirportActive] = useState(false);
  const goToChapter = useGameStore(s => s.goToChapter);
  const devMode = useDevMode();

  const startAirport = useCallback(() => {
    setAirportActive(true);
  }, []);

  const endAirport = useCallback(() => {
    setAirportActive(false);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <Canvas camera={{ fov: 75, position: [0, 1.6, 0] }} style={{ background: '#0a0a0a' }}>
        <Ch2Inner onAirportTrigger={startAirport} freezeControls={airportActive} />
      </Canvas>

      {/* Airport hallucination overlay */}
      <AirportCutscene active={airportActive} onDone={endAirport} />

      {/* Dev Panel */}
      {devMode && !airportActive && (
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
