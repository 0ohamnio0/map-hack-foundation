/**
 * STEP 5: Itaewon memorial layer in CH.3 mart
 * - "2022-10-29" date on wall near cell (3,3), visible within 2 cells
 * - 3 ghost employees: semi-transparent, slow patrol loop
 * - "take it all you want" text overlay on entering cell (3,3), one-time
 */
import { useRef, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { useGameStore } from '@/store/useGameStore'

interface ItaewonLayerProps {
  /** Cell (3,3) world position */
  cellWorldPos: { x: number; z: number }
  cellSize: number
  playerPos: { x: number; z: number }
}

/** Ghost employee — semi-transparent, slow patrol loop */
function GhostEmployee({
  startPos,
  phaseOffset,
}: {
  startPos: [number, number, number]
  phaseOffset: number
}) {
  const groupRef = useRef<THREE.Group>(null)

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    const t = clock.elapsedTime + phaseOffset
    // Walk 2 units forward, pause 1s, walk 2 units back
    const cycle = 5 // total seconds for one loop
    const phase = (t % cycle) / cycle
    let offset = 0
    if (phase < 0.4) {
      // walk forward (0~2 units)
      offset = (phase / 0.4) * 2
    } else if (phase < 0.6) {
      // pause
      offset = 2
    } else {
      // walk back
      offset = 2 - ((phase - 0.6) / 0.4) * 2
    }
    groupRef.current.position.set(
      startPos[0],
      startPos[1],
      startPos[2] + offset * 0.3, // slow: 0.3 units/sec equivalent
    )
  })

  return (
    <group ref={groupRef} position={startPos}>
      {/* Body */}
      <mesh position={[0, 0.9, 0]}>
        <capsuleGeometry args={[0.25, 0.8, 4, 8]} />
        <meshStandardMaterial color="#fff" transparent opacity={0.3} />
      </mesh>
      {/* Head */}
      <mesh position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshStandardMaterial color="#fff" transparent opacity={0.3} />
      </mesh>
    </group>
  )
}

export function ItaewonLayer({ cellWorldPos, cellSize, playerPos }: ItaewonLayerProps) {
  const triggerEvent = useGameStore((s) => s.triggerEvent)
  const { camera } = useThree()
  const [showText, setShowText] = useState(false)
  const [textOpacity, setTextOpacity] = useState(0)

  // Date inscription visibility — within 2 cells
  const dx = playerPos.x - cellWorldPos.x
  const dz = playerPos.z - cellWorldPos.z
  const distToCellSq = dx * dx + dz * dz
  const dateVisible = distToCellSq < (cellSize * 2) ** 2

  // Text trigger — entering cell (3,3)
  useEffect(() => {
    const inCell = distToCellSq < (cellSize * 0.6) ** 2
    if (inCell && !showText) {
      if (triggerEvent('ch3_itaewon')) {
        setShowText(true)
        // Fade in 1s
        let opacity = 0
        const fadeIn = setInterval(() => {
          opacity += 0.02
          if (opacity >= 1) {
            opacity = 1
            clearInterval(fadeIn)
            // Hold 3s then fade out
            setTimeout(() => {
              const fadeOut = setInterval(() => {
                opacity -= 0.02
                if (opacity <= 0) {
                  opacity = 0
                  clearInterval(fadeOut)
                  setShowText(false)
                }
                setTextOpacity(opacity)
              }, 20)
            }, 3000)
          }
          setTextOpacity(opacity)
        }, 20)
      }
    }
  }, [distToCellSq, cellSize, showText, triggerEvent])

  return (
    <>
      {/* "2022-10-29" date inscription on wall */}
      {dateVisible && (
        <Text
          position={[cellWorldPos.x, 1.5, cellWorldPos.z - cellSize * 0.45]}
          fontSize={0.3}
          color="#666"
          anchorX="center"
          anchorY="middle"
        >
          2022-10-29
        </Text>
      )}

      {/* 3 ghost employees */}
      <GhostEmployee
        startPos={[cellWorldPos.x - 1.5, 0, cellWorldPos.z - 2]}
        phaseOffset={0}
      />
      <GhostEmployee
        startPos={[cellWorldPos.x + 1, 0, cellWorldPos.z + 1]}
        phaseOffset={1.7}
      />
      <GhostEmployee
        startPos={[cellWorldPos.x, 0, cellWorldPos.z + 3]}
        phaseOffset={3.2}
      />

      {/* "take it all you want" text overlay */}
      {showText && (
        <group>
          {/* Dark overlay plane behind text */}
          <mesh position={[camera.position.x, camera.position.y, camera.position.z - 1]} renderOrder={997}>
            <planeGeometry args={[10, 4]} />
            <meshBasicMaterial color="#000" transparent opacity={textOpacity * 0.6} depthTest={false} />
          </mesh>
          <Text
            position={[camera.position.x, camera.position.y, camera.position.z - 0.9]}
            fontSize={0.15}
            color="#fff"
            anchorX="center"
            anchorY="middle"
            renderOrder={998}
            material-transparent
            material-opacity={textOpacity}
            material-depthTest={false}
          >
            take it all you want
          </Text>
        </group>
      )}
    </>
  )
}
