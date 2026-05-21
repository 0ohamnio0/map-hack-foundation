/**
 * STEP 2: CH.2 NPC — 얼굴 없는 인간형 메시
 * - 일반 NPC: capsule+sphere placeholder, gaze opacity + idle sway
 * - 특수 NPC: GLB walking model + 플레이어 follow + face camera + "살아있는 척" 텍스트
 */
import { useRef, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, useGLTF, useAnimations } from '@react-three/drei'
import * as THREE from 'three'
import { SCALE_X, SCALE_Z } from '@/scenes/ch2Layout'

const SPECIAL_NPC_URL = `${import.meta.env.BASE_URL}assets/characters_biped/special_npc_walking/walking.glb`
useGLTF.preload(SPECIAL_NPC_URL)

interface NPCProps {
  position: [number, number, number]
  isSpecial?: boolean
}

const _dir = new THREE.Vector3()
const _camForward = new THREE.Vector3()
const _target = new THREE.Vector3()
const _playerXZ = new THREE.Vector3()

export function NPC(props: NPCProps) {
  return props.isSpecial ? <SpecialNPC {...props} /> : <RegularNPC {...props} />
}

function RegularNPC({ position }: NPCProps) {
  const groupRef = useRef<THREE.Group>(null)
  const bodyMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const headMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const opacity = useRef(1)
  const { camera } = useThree()

  useFrame((_, delta) => {
    if (!groupRef.current || !bodyMatRef.current || !headMatRef.current) return

    const gp = groupRef.current.position

    // Gaze opacity
    camera.getWorldDirection(_camForward)
    _dir.set(gp.x, gp.y + 1, gp.z).sub(camera.position).normalize()
    const dot = _camForward.dot(_dir)
    const targetOpacity = dot > 0.7 ? 0.15 : 1.0
    opacity.current = THREE.MathUtils.lerp(opacity.current, targetOpacity, delta * 3)
    bodyMatRef.current.opacity = opacity.current
    headMatRef.current.opacity = opacity.current

    // Idle sway
    groupRef.current.rotation.z = Math.sin(Date.now() * 0.001) * 0.02
  })

  return (
    <group ref={groupRef} position={position}>
      <mesh position={[0, 0.9, 0]}>
        <capsuleGeometry args={[0.25, 0.8, 4, 8]} />
        <meshStandardMaterial ref={bodyMatRef} color="#555" transparent opacity={1} />
      </mesh>
      <mesh position={[0, 1.7, 0]}>
        <sphereGeometry args={[0.2, 8, 8]} />
        <meshStandardMaterial ref={headMatRef} color="#555" transparent opacity={1} />
      </mesh>
    </group>
  )
}

function SpecialNPC({ position }: NPCProps) {
  const groupRef = useRef<THREE.Group>(null)
  const opacity = useRef(1)
  const gazeTimer = useRef(0)
  const materialsRef = useRef<THREE.MeshStandardMaterial[]>([])
  const { camera } = useThree()
  const [textOpacity, setTextOpacity] = useState(0)
  const textOpacityRef = useRef(0)
  const textTimer = useRef(0)
  const textShown = useRef(false)

  const gltf = useGLTF(SPECIAL_NPC_URL)
  const { actions } = useAnimations(gltf.animations, groupRef)

  // Collect materials; default fully opaque (toggle transparent on fade)
  useEffect(() => {
    const mats: THREE.MeshStandardMaterial[] = []
    gltf.scene.traverse((child) => {
      const mesh = child as THREE.Mesh
      if (!mesh.isMesh || !mesh.material) return
      const m = mesh.material as THREE.MeshStandardMaterial & {
        transmission?: number
        transmissionMap?: THREE.Texture | null
      }
      m.transparent = false
      m.opacity = 1
      m.alphaTest = 0
      m.alphaMap = null
      m.depthWrite = true
      m.depthTest = true
      m.side = THREE.FrontSide
      m.blending = THREE.NormalBlending
      // MeshPhysicalMaterial — kill transmission (glass-like see-through)
      if ('transmission' in m && typeof m.transmission === 'number') m.transmission = 0
      if ('transmissionMap' in m) m.transmissionMap = null
      m.needsUpdate = true
      mats.push(m)
    })
    materialsRef.current = mats
    return () => { materialsRef.current = [] }
  }, [gltf.scene])

  // Play walking animation (slowed)
  useEffect(() => {
    const firstKey = Object.keys(actions)[0]
    if (!firstKey) return
    const action = actions[firstKey]
    if (!action) return
    action.reset().play()
    action.timeScale = 1.0
    return () => { action.stop() }
  }, [actions])

  useFrame((_, delta) => {
    if (!groupRef.current) return
    const gp = groupRef.current.position

    // Gaze opacity — 응시 누적 시간에 따라 점진적 fade out (2초 이상 응시 시 완전 투명)
    camera.getWorldDirection(_camForward)
    _dir.set(gp.x, gp.y + 1, gp.z).sub(camera.position).normalize()
    const dot = _camForward.dot(_dir)
    if (dot > 0.7) {
      gazeTimer.current += delta
    } else {
      gazeTimer.current = Math.max(0, gazeTimer.current - delta * 2)
    }
    const targetOpacity = Math.max(0, 1.0 - gazeTimer.current / 2.0)
    opacity.current = THREE.MathUtils.lerp(opacity.current, targetOpacity, delta * 3)
    const needTransparent = opacity.current < 0.99
    for (const m of materialsRef.current) {
      m.opacity = opacity.current
      if (m.transparent !== needTransparent) {
        m.transparent = needTransparent
        m.needsUpdate = true
      }
    }

    // Follow player
    _target.set(camera.position.x, 0, camera.position.z)
    gp.lerp(_target, 0.015 * (delta / 0.016))
    gp.y = 0
    gp.x = Math.max(-7 * SCALE_X, Math.min(7 * SCALE_X, gp.x))
    gp.z = Math.max(-40 * SCALE_Z, Math.min(3 * SCALE_Z, gp.z))

    // Face player (yaw only)
    _playerXZ.set(camera.position.x, 0, camera.position.z)
    const dx = _playerXZ.x - gp.x
    const dz = _playerXZ.z - gp.z
    if (dx * dx + dz * dz > 0.01) {
      const yaw = Math.atan2(dx, dz)
      groupRef.current.rotation.y = THREE.MathUtils.lerp(
        groupRef.current.rotation.y,
        yaw,
        delta * 4
      )
    }

    // Distance check for text
    const dist = gp.distanceTo(_playerXZ)
    const shouldShow = dist < 4

    if (shouldShow && !textShown.current) {
      textTimer.current += delta
      const newOpacity = Math.min(textTimer.current / 1.0, 1)
      textOpacityRef.current = newOpacity
      setTextOpacity(newOpacity)

      if (newOpacity >= 1) {
        textShown.current = true
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
  })

  return (
    <group ref={groupRef} position={position}>
      <primitive object={gltf.scene} scale={0.5} />
      {textOpacity > 0 && (
        <Html position={[0, 2.4, 0]} center>
          <div style={{
            color: 'white',
            fontFamily: '"Unifont", monospace',
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
