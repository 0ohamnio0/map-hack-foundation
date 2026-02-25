import React, { useRef, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { PlayerController } from '@/components/game/PlayerController';
import { useGameStore } from '@/store/useGameStore';

const Maze: React.FC = () => {
  const wallSegments = useMemo(() => {
    const segments: { x: number; z: number; w: number; h: number; d: number }[] = [];
    // Left wall (continuous)
    for (let i = 0; i < 80; i += 4) {
      segments.push({ x: -2, z: -i, w: 0.3, h: 4, d: 4 });
    }
    // Right wall (continuous)
    for (let i = 0; i < 80; i += 4) {
      segments.push({ x: 2, z: -i, w: 0.3, h: 4, d: 4 });
    }
    return segments;
  }, []);

  return (
    <group>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -40]}>
        <planeGeometry args={[4, 80]} />
        <meshStandardMaterial color="#444" />
      </mesh>

      {/* Walls */}
      {wallSegments.map((s, i) => (
        <mesh key={i} position={[s.x, s.h / 2, s.z]}>
          <boxGeometry args={[s.w, s.h, s.d]} />
          <meshStandardMaterial color="#666" />
        </mesh>
      ))}
    </group>
  );
};

const TriggerZones: React.FC<{ playerZ: number }> = ({ playerZ }) => {
  const goToChapter = useGameStore(s => s.goToChapter);
  const triggerEvent = useGameStore(s => s.triggerEvent);
  const leftMovement = useGameStore(s => s.leftMovement);
  const rightMovement = useGameStore(s => s.rightMovement);
  const triggeredRef = useRef<Set<string>>(new Set());

  // Check zones
  React.useEffect(() => {
    if (playerZ < -18 && playerZ > -22 && !triggeredRef.current.has('A')) {
      triggeredRef.current.add('A');
      triggerEvent('ch2_zoneA');
    }
    if (playerZ < -38 && playerZ > -42 && !triggeredRef.current.has('B')) {
      triggeredRef.current.add('B');
      triggerEvent('ch2_zoneB');
    }
    if (playerZ < -58 && playerZ > -62 && !triggeredRef.current.has('C')) {
      triggeredRef.current.add('C');
      triggerEvent('ch2_zoneC');
    }
    if (playerZ < -76) {
      if (!triggeredRef.current.has('D')) {
        triggeredRef.current.add('D');
        goToChapter('CH3');
      }
    }
  }, [playerZ]);

  const visited = useGameStore(s => s.visitedEvents);

  return (
    <group>
      {/* Zone A signs */}
      {visited.has('ch2_zoneA') && (
        <group position={[0.8, 0, -20]}>
          <mesh position={[0, 2, 0]}>
            <boxGeometry args={[0.1, 1.5, 0.6]} />
            <meshStandardMaterial color="#aa0" />
          </mesh>
          <mesh position={[0, 3, 0]}>
            <boxGeometry args={[0.6, 0.4, 0.1]} />
            <meshStandardMaterial color="#aa0" />
          </mesh>
          {/* Direction sign based on movement */}
          {leftMovement > rightMovement ? (
            <mesh position={[-0.5, 2.5, 0]}>
              <boxGeometry args={[0.8, 0.3, 0.1]} />
              <meshStandardMaterial color="#0af" />
            </mesh>
          ) : (
            <mesh position={[0.5, 2.5, 0]}>
              <boxGeometry args={[0.8, 0.3, 0.1]} />
              <meshStandardMaterial color="#f80" />
            </mesh>
          )}
        </group>
      )}

      {/* Zone B NPC placeholder */}
      {visited.has('ch2_zoneB') && (
        <mesh position={[0, 1, -40]}>
          <cylinderGeometry args={[0.3, 0.3, 2, 8]} />
          <meshStandardMaterial color="#888" />
        </mesh>
      )}

      {/* Zone C special NPC */}
      {visited.has('ch2_zoneC') && (
        <mesh position={[0.5, 1, -60]}>
          <cylinderGeometry args={[0.3, 0.3, 2, 8]} />
          <meshStandardMaterial color="#a44" />
        </mesh>
      )}

      {/* Zone D mart entrance */}
      <mesh position={[0, 2, -78]}>
        <boxGeometry args={[3, 4, 0.3]} />
        <meshStandardMaterial color="#555" />
      </mesh>
    </group>
  );
};

const Ch2Inner: React.FC = () => {
  const playerZ = useRef(0);

  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 10, 5]} intensity={0.5} />
      <Maze />
      <TriggerZones playerZ={playerZ.current} />
      <PlayerController
        mode="3rd"
        bounds={{ minX: -1.5, maxX: 1.5, minZ: -80, maxZ: 0 }}
        onPosition={(x, z) => { playerZ.current = z; }}
      />
    </>
  );
};

export const Ch2Scene: React.FC = () => {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <Canvas camera={{ fov: 75, position: [0, 3, 6] }} style={{ background: '#0a0a0a' }}>
        <Ch2Inner />
      </Canvas>
    </div>
  );
};
