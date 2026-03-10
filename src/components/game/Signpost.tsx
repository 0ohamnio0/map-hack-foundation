/**
 * STEP 1: Signpost — 도로 위 표지판
 * Vertical pole + flat board with Text
 */
import { Text } from '@react-three/drei'

interface SignpostProps {
  position: [number, number, number]
  text: string
  rotation?: number
}

export function Signpost({ position, text, rotation = 0 }: SignpostProps) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Pole */}
      <mesh position={[0, 1.2, 0]}>
        <cylinderGeometry args={[0.03, 0.03, 2.4, 6]} />
        <meshStandardMaterial color="#888" />
      </mesh>
      {/* Board */}
      <mesh position={[0, 2.2, 0.02]}>
        <planeGeometry args={[1.4, 0.5]} />
        <meshStandardMaterial color="#222" />
      </mesh>
      {/* Text */}
      <Text
        position={[0, 2.2, 0.04]}
        fontSize={0.25}
        color="#ddd"
        font={undefined}
        anchorX="center"
        anchorY="middle"
        maxWidth={1.2}
      >
        {text}
      </Text>
    </group>
  )
}

/** Floor sign — flat text on ground */
export function FloorSign({ position, text }: { position: [number, number, number]; text: string }) {
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}>
        <planeGeometry args={[2, 0.6]} />
        <meshStandardMaterial color="#444" />
      </mesh>
      <Text
        position={[0, 0.02, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.2}
        color="#ccc"
        anchorX="center"
        anchorY="middle"
      >
        {text}
      </Text>
    </group>
  )
}
