/**
 * STEP 1: Signpost — 도로 위 표지판
 * Vertical pole + flat board with Text
 * Glitch flash effect on text change
 */
import { useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

const UNIFONT_URL = `${import.meta.env.BASE_URL}assets/fonts/unifont-16.0.02.otf`

interface SignpostProps {
  position: [number, number, number]
  text: string
  rotation?: number
}

export function Signpost({ position, text, rotation = 0 }: SignpostProps) {
  const boardRef = useRef<THREE.Mesh>(null)
  const textRef = useRef<THREE.Mesh>(null)
  const [glitchTime, setGlitchTime] = useState(-1)
  const prevText = useRef(text)

  // Detect text change → trigger glitch
  useEffect(() => {
    if (prevText.current !== text) {
      prevText.current = text
      setGlitchTime(0)
    }
  }, [text])

  // Animate glitch: brief flash + offset
  useFrame((_, delta) => {
    if (glitchTime < 0) return
    const t = glitchTime + delta
    setGlitchTime(t > 0.4 ? -1 : t)

    if (boardRef.current) {
      const mat = boardRef.current.material as THREE.MeshStandardMaterial
      if (t < 0.1) {
        mat.emissive.setHex(0x00ff44)
        mat.emissiveIntensity = 0.8
      } else if (t < 0.2) {
        mat.emissive.setHex(0xff0044)
        mat.emissiveIntensity = 0.5
      } else if (t < 0.3) {
        mat.emissive.setHex(0x0044ff)
        mat.emissiveIntensity = 0.3
      } else {
        mat.emissive.setHex(0x000000)
        mat.emissiveIntensity = 0
      }
    }

    // Text jitter during glitch
    if (textRef.current) {
      if (t < 0.3) {
        textRef.current.position.x = (Math.random() - 0.5) * 0.06
        textRef.current.position.y = 3.2 + (Math.random() - 0.5) * 0.04
      } else {
        textRef.current.position.x = 0
        textRef.current.position.y = 3.2
      }
    }
  })

  // 벽에 부착되는 전광표지판 스타일 — pole 제거, board를 더 크게 + 벽 높이로.
  const BOARD_Y = 3.2
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Board — 큰 가로 안내판 */}
      <mesh ref={boardRef} position={[0, BOARD_Y, 0]} castShadow>
        <boxGeometry args={[2.5, 0.85, 0.08]} />
        <meshStandardMaterial color="#1a1a1a" metalness={0.2} roughness={0.5} />
      </mesh>
      {/* Text — 보드 앞면 */}
      <Text
        ref={textRef}
        position={[0, BOARD_Y, 0.05]}
        fontSize={0.42}
        color="#ddd"
        font={UNIFONT_URL}
        anchorX="center"
        anchorY="middle"
        maxWidth={2.2}
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
        font={UNIFONT_URL}
        anchorX="center"
        anchorY="middle"
      >
        {text}
      </Text>
    </group>
  )
}
