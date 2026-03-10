/**
 * STEP 2: CH.2 NPC — 얼굴 없는 인간형 메시
 * - 카메라 정면 응시(dot > 0.7) → opacity 0.3 (보려할수록 안 보임)
 * - 시선 돌리면 → opacity 1.0 복귀
 * - isSpecial: 플레이어를 천천히 따라옴, 4유닛 이내 → "나, 살아있는 척 하고 있어." 텍스트
 */
import { useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'

interface NPCProps {
  position: [number, number, number]
  isSpecial?: boolean
}

const _dir = new THREE.Vector3()
const _camForward = new THREE.Vector3()

export function NPC({ position, isSpecial = false }: NPCProps) {
  const groupRef = useRef<THREE.Group>(null)
  const bodyMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const headMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const opacity = useRef(1)
  const { camera } = useThree()
  const [textOpacity, setTextOpacity] = useState(0)
  const textOpacityRef = useRef(0)
  const textTimer = useRef(0)
  const textShown = useRef(false)

  useFrame((_, delta) => {
    if (!groupRef.current || !bodyMatRef.current || !headMatRef.current) return

    const gp = groupRef.current.position

    // --- Blur mechanic: dot product gaze detection ---
    camera.getWorldDirection(_camForward)
    _dir.set(gp.x, gp.y + 1, gp.z).sub(camera.position).normalize()
    const dot = _camForward.dot(_dir)

    // dot > 0.7 = looking directly → fade out
    const targetOpacity = dot > 0.7 ? 0.15 : 1.0
    opacity.current = THREE.MathUtils.lerp(opacity.current, targetOpacity, delta * 3)
    bodyMatRef.current.opacity = opacity.current
    headMatRef.current.opacity = opacity.current

    // --- Idle sway ---
    const swaySpeed = isSpecial ? 0.5 : 1.0
    groupRef.current.rotation.z = Math.sin(Date.now() * 0.001 * swaySpeed) * 0.02

    // --- Special NPC: follow player ---
    if (isSpecial) {
      const target = new THREE.Vector3(camera.position.x, 0, camera.position.z)
      gp.lerp(target, 0.002 * (delta / 0.016))
      gp.y = 0 // stay on ground

      // Distance check for text
      const dist = gp.distanceTo(new THREE.Vector3(camera.position.x, 0, camera.position.z))
      const shouldShow = dist < 4

      if (shouldShow && !textShown.current) {
        // Fade in text
        textTimer.current += delta
        const newOpacity = Math.min(textTimer.current / 1.0, 1) // 1s fade in
        textOpacityRef.current = newOpacity
        setTextOpacity(newOpacity)

        if (newOpacity >= 1) {
          textShown.current = true
          // Hold 3s then fade out
          setTimeout(() => {
            const fadeOut = () => {
              textOpacityRef.current -= 0.02
              if (textOpacityRef.current <= 0) {
                textOpacityRef.current = 0
                setTextOpacity(0)
                return
              }
              setTextOpacity(textOpacityRef.current)
              requestAnimationFrame(fadeOut)
            }
            fadeOut()
          }, 3000)
        }
      }
    }
  })

  return (
    <group ref={groupRef} position={position}>
      {/* Body: capsule */}
      <mesh position={[0, 0.9, 0]}>
        <capsuleGeometry args={[0.25, 0.8, 4, 8]} />
        <meshStandardMaterial
          ref={bodyMatRef}
          color="#555"
          transparent
          opacity={1}
        />
      </mesh>
      {/* Head: smooth sphere (no face) */}
      <mesh position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshStandardMaterial
          ref={headMatRef}
          color="#555"
          transparent
          opacity={1}
        />
      </mesh>
      {/* Special NPC floating text */}
      {isSpecial && textOpacity > 0 && (
        <Html position={[0, 2.4, 0]} center>
          <div style={{
            color: 'white',
            fontFamily: 'monospace',
            fontSize: '14px',
            opacity: textOpacity,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            textShadow: '0 0 8px rgba(255,255,255,0.3)',
            transition: 'opacity 0.1s',
          }}>
            나, 살아있는 척 하고 있어.
          </div>
        </Html>
      )}
    </group>
  )
}
