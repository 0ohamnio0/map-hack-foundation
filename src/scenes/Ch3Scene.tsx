import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { PlayerController } from '@/components/game/PlayerController';
import { useGameStore } from '@/store/useGameStore';
import { useSoundManager } from '@/hooks/useSoundManager';

const MEDICINES = [
  { name: '기분안정제', color: '#ff3333', effect: 'desaturate', duration: 3000, soundSlot: 'gulp_red', z: -8 },
  { name: '항정신병약', color: '#3366ff', effect: 'blur', duration: 3000, soundSlot: 'gulp_blue', z: -18 },
  { name: '수면제', color: '#ffcc00', effect: 'darken', duration: 5000, soundSlot: 'gulp_yellow', z: -28 },
  { name: '항불안제', color: '#33cc33', effect: 'desaturate', duration: 3000, soundSlot: 'gulp_green', z: -38 },
  { name: '다 먹음', color: '#ffffff', effect: 'whiteflash', duration: 2000, soundSlot: 'gulp_white', z: -48 },
];

const FlickerLight: React.FC = () => {
  const lightRef = useRef<any>(null);
  useFrame(({ clock }) => {
    if (lightRef.current) {
      lightRef.current.intensity = 0.4 + Math.sin(clock.elapsedTime * 8) * 0.1 + Math.sin(clock.elapsedTime * 13) * 0.05;
    }
  });
  return <ambientLight ref={lightRef} intensity={0.4} color="#f0f0e8" />;
};

const MedicinePickup: React.FC<{
  med: typeof MEDICINES[0];
  onPickup: () => void;
  collected: boolean;
}> = ({ med, onPickup, collected }) => {
  const meshRef = useRef<any>(null);

  useFrame(({ clock }) => {
    if (meshRef.current && !collected) {
      meshRef.current.rotation.y = clock.elapsedTime * 2;
      meshRef.current.position.y = 0.5 + Math.sin(clock.elapsedTime * 3) * 0.1;
    }
  });

  if (collected) return null;

  return (
    <mesh ref={meshRef} position={[0, 0.5, med.z]}>
      <boxGeometry args={[0.3, 0.5, 0.3]} />
      <meshStandardMaterial color={med.color} emissive={med.color} emissiveIntensity={0.3} />
    </mesh>
  );
};

const Ch3Inner: React.FC = () => {
  const goToChapter = useGameStore(s => s.goToChapter);
  const triggerEvent = useGameStore(s => s.triggerEvent);
  const addToCart = useGameStore(s => s.addToCart);
  const setActiveEffect = useGameStore(s => s.setActiveEffect);
  const setNotification = useGameStore(s => s.setNotification);
  const { play } = useSoundManager();
  const [collected, setCollected] = useState<Set<number>>(new Set());
  const playerZ = useRef(0);

  // Check medicine pickups
  useEffect(() => {
    const check = () => {
      MEDICINES.forEach((med, i) => {
        if (!collected.has(i) && Math.abs(playerZ.current - med.z) < 1.5) {
          setCollected(prev => new Set(prev).add(i));
          addToCart(med.name);
          play(med.soundSlot);
          setActiveEffect(med.effect, med.duration);
          setNotification(med.name);
          triggerEvent(`ch3_med_${i}`);
          setTimeout(() => setNotification(null), 2000);
        }
      });

      // Elevator
      if (playerZ.current < -53 && playerZ.current > -57) {
        if (triggerEvent('ch3_elevator')) {
          // Loop motif — brief flash
          setActiveEffect('glitch', 500);
        }
      }


      // Exit
      if (playerZ.current < -58) {
        if (triggerEvent('ch3_exit')) {
          goToChapter('CH4');
        }
      }
    };

    const interval = setInterval(check, 100);
    return () => clearInterval(interval);
  }, [collected, addToCart, play, setActiveEffect, setNotification, triggerEvent, goToChapter]);

  return (
    <>
      <FlickerLight />
      <directionalLight position={[0, 3, 0]} intensity={0.3} />


      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -30]}>
        <planeGeometry args={[6, 60]} />
        <meshStandardMaterial color="#bbb" />
      </mesh>

      {/* Ceiling */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 3, -30]}>
        <planeGeometry args={[6, 60]} />
        <meshStandardMaterial color="#ccc" />
      </mesh>

      {/* Walls */}
      <mesh position={[-3, 1.5, -30]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[60, 3]} />
        <meshStandardMaterial color="#ddd" />
      </mesh>
      <mesh position={[3, 1.5, -30]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[60, 3]} />
        <meshStandardMaterial color="#ddd" />
      </mesh>

      {/* Shelves */}
      {Array.from({ length: 8 }, (_, i) => (
        <React.Fragment key={i}>
          <mesh position={[-2.2, 1, -3 - i * 6]}>
            <boxGeometry args={[1, 2, 0.5]} />
            <meshStandardMaterial color="#999" />
          </mesh>
          <mesh position={[2.2, 1, -3 - i * 6]}>
            <boxGeometry args={[1, 2, 0.5]} />
            <meshStandardMaterial color="#999" />
          </mesh>
        </React.Fragment>
      ))}

      {/* Medicine pickups */}
      {MEDICINES.map((med, i) => (
        <MedicinePickup key={i} med={med} collected={collected.has(i)} onPickup={() => { }} />
      ))}

      {/* Elevator */}
      <mesh position={[0, 1.5, -55]}>
        <boxGeometry args={[2, 3, 0.3]} />
        <meshStandardMaterial color="#777" />
      </mesh>

      {/* Cart HUD - rendered in 3D space attached to camera */}
      <PlayerController
        mode="1st"
        bounds={{ minX: -2.5, maxX: 2.5, minZ: -60, maxZ: 0 }}
        onPosition={(x, z) => { playerZ.current = z; }}
      />
    </>
  );
};

export const Ch3Scene: React.FC = () => {
  const cartItems = useGameStore(s => s.cartItems);
  const notification = useGameStore(s => s.notification);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      <Canvas camera={{ fov: 75, position: [0, 1.6, 0] }} style={{ background: '#0a0a0a' }}>
        <Ch3Inner />
      </Canvas>

      {/* Notification */}
      {notification && (
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

      {/* Cart UI */}

      <div style={{
        position: 'fixed',
        bottom: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 8,
        zIndex: 200,
      }}>
        {cartItems.map((item, i) => (
          <div key={i} style={{
            padding: '4px 12px',
            fontFamily: 'monospace',
            fontSize: 12,
            color: '#fff',
            backgroundColor: 'rgba(0,0,0,0.7)',
            border: '1px solid rgba(255,255,255,0.2)',
          }}>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
};

