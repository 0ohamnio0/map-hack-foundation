import React, { useRef, useMemo, useEffect } from 'react';
import { Minimap } from '@/components/game/Minimap';
import { Canvas, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { PlayerController } from '@/components/game/PlayerController';
import { useGameStore } from '@/store/useGameStore';
import { generateMaze, cellToWorld, type MazeData } from '@/utils/mazeGenerator';

const MAZE_SIZE = 30;
const CELL_SIZE = 2;
const WALL_HEIGHT = 3;

/** InstancedMesh walls for performance */
const MazeWalls: React.FC<{ maze: MazeData }> = ({ maze }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

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
    <instancedMesh ref={meshRef} args={[undefined, undefined, maze.wallPositions.length]}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#666" />
    </instancedMesh>
  );
};

const MazeFloor: React.FC = () => {
  const size = MAZE_SIZE * CELL_SIZE;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[size / 2, 0, size / 2]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial color="#bbb" />
    </mesh>
  );
};

/** Trigger zones placed at specific points along the maze */
const TriggerZones: React.FC<{ playerX: number; playerZ: number; maze: MazeData }> = ({ playerX, playerZ, maze }) => {
  const goToChapter = useGameStore(s => s.goToChapter);
  const triggerEvent = useGameStore(s => s.triggerEvent);
  const triggeredRef = useRef<Set<string>>(new Set());

  // Place triggers at ~25%, 50%, 75% and exit
  const zonePositions = useMemo(() => {
    const q1 = cellToWorld(Math.floor(MAZE_SIZE * 0.25), Math.floor(MAZE_SIZE * 0.25), CELL_SIZE);
    const q2 = cellToWorld(Math.floor(MAZE_SIZE * 0.5), Math.floor(MAZE_SIZE * 0.5), CELL_SIZE);
    const q3 = cellToWorld(Math.floor(MAZE_SIZE * 0.75), Math.floor(MAZE_SIZE * 0.75), CELL_SIZE);
    const exit = cellToWorld(maze.end.x, maze.end.y, CELL_SIZE);
    return { q1, q2, q3, exit };
  }, [maze]);

  useEffect(() => {
    const dist = (ax: number, az: number, bx: number, bz: number) =>
      Math.sqrt((ax - bx) ** 2 + (az - bz) ** 2);

    const TRIGGER_RADIUS = 2;

    if (dist(playerX, playerZ, zonePositions.q1.x, zonePositions.q1.z) < TRIGGER_RADIUS && !triggeredRef.current.has('A')) {
      triggeredRef.current.add('A');
      triggerEvent('ch2_zoneA');
    }
    if (dist(playerX, playerZ, zonePositions.q2.x, zonePositions.q2.z) < TRIGGER_RADIUS && !triggeredRef.current.has('B')) {
      triggeredRef.current.add('B');
      triggerEvent('ch2_zoneB');
    }
    if (dist(playerX, playerZ, zonePositions.q3.x, zonePositions.q3.z) < TRIGGER_RADIUS && !triggeredRef.current.has('C')) {
      triggeredRef.current.add('C');
      triggerEvent('ch2_zoneC');
    }
    if (dist(playerX, playerZ, zonePositions.exit.x, zonePositions.exit.z) < TRIGGER_RADIUS && !triggeredRef.current.has('D')) {
      triggeredRef.current.add('D');
      goToChapter('CH3');
    }
  }, [playerX, playerZ]);

  const visited = useGameStore(s => s.visitedEvents);
  const leftMovement = useGameStore(s => s.leftMovement);
  const rightMovement = useGameStore(s => s.rightMovement);

  return (
    <group>
      {/* Zone A: direction sign */}
      {visited.has('ch2_zoneA') && (
        <group position={[zonePositions.q1.x, 0, zonePositions.q1.z]}>
          <mesh position={[0, 1.5, 0]}>
            <boxGeometry args={[0.1, 3, 0.1]} />
            <meshStandardMaterial color="#aa0" />
          </mesh>
          <mesh position={[leftMovement > rightMovement ? -0.5 : 0.5, 2.5, 0]}>
            <boxGeometry args={[0.8, 0.3, 0.1]} />
            <meshStandardMaterial color={leftMovement > rightMovement ? '#0af' : '#f80'} />
          </mesh>
        </group>
      )}

      {/* Zone B: NPC */}
      {visited.has('ch2_zoneB') && (
        <mesh position={[zonePositions.q2.x, 1, zonePositions.q2.z]}>
          <cylinderGeometry args={[0.3, 0.3, 2, 8]} />
          <meshStandardMaterial color="#888" />
        </mesh>
      )}

      {/* Zone C: special NPC */}
      {visited.has('ch2_zoneC') && (
        <mesh position={[zonePositions.q3.x, 1, zonePositions.q3.z]}>
          <cylinderGeometry args={[0.3, 0.3, 2, 8]} />
          <meshStandardMaterial color="#a44" />
        </mesh>
      )}

      {/* Exit marker */}
      <mesh position={[zonePositions.exit.x, 1.5, zonePositions.exit.z]}>
        <boxGeometry args={[1.5, 3, 0.3]} />
        <meshStandardMaterial color="#4a4" emissive="#0f0" emissiveIntensity={0.2} />
      </mesh>
    </group>
  );
};

const Ch2Inner: React.FC<{ maze: MazeData; onPlayerMove?: (pos: { x: number; z: number }) => void }> = ({ maze, onPlayerMove }) => {
  const playerPos = useRef({ x: 0, z: 0 });
  const [posState, setPosState] = React.useState({ x: 0, z: 0 });

  const startWorld = useMemo(() => cellToWorld(maze.start.x, maze.start.y, CELL_SIZE), [maze]);
  const mazeWorldSize = MAZE_SIZE * CELL_SIZE;




  const frameCount = useRef(0);
  const handlePosition = (x: number, z: number) => {
    playerPos.current = { x, z };
    frameCount.current++;
    if (frameCount.current % 6 === 0) {
      setPosState({ x, z });
      onPlayerMove?.({ x, z });
    }
  };

  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight position={[mazeWorldSize / 2, 20, mazeWorldSize / 2]} intensity={0.6} />
      <MazeFloor />
      <MazeWalls maze={maze} />
      <TriggerZones playerX={posState.x} playerZ={posState.z} maze={maze} />
      <PlayerController
        mode="1st"
        bounds={{ minX: 0.5, maxX: mazeWorldSize - 0.5, minZ: 0.5, maxZ: mazeWorldSize - 0.5 }}
        onPosition={handlePosition}
        startPosition={[startWorld.x, 0.5, startWorld.z]}
        
      />
    </>
  );
};

export const Ch2Scene: React.FC = () => {
  const maze = useMemo(() => generateMaze(MAZE_SIZE, MAZE_SIZE), []);
  const startWorld = useMemo(() => cellToWorld(maze.start.x, maze.start.y, CELL_SIZE), [maze]);
  const [playerPos, setPlayerPos] = React.useState({ x: startWorld.x, z: startWorld.z });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <Canvas camera={{ fov: 75, position: [startWorld.x, 1.8, startWorld.z] }} style={{ background: '#d0d0d0' }}>
        <Ch2Inner maze={maze} onPlayerMove={setPlayerPos} />
      </Canvas>
      <Minimap maze={maze} playerX={playerPos.x} playerZ={playerPos.z} cellSize={CELL_SIZE} />
    </div>
  );
};
