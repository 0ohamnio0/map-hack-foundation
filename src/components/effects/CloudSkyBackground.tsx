/**
 * CH.2 하늘 배경 — 이미지 기반 스카이돔 (fog 무시)
 */
import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

const BASE = import.meta.env.BASE_URL
const SKY_URL = `${BASE}assets/sky/sky_ch2.webp`

interface CloudSkyProps {
  skycolor1?: [number, number, number]
  skycolor2?: [number, number, number]
  cloudcover?: number
  clouddark?: number
}

export function CloudSkyBackground(_props: CloudSkyProps) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null)
  const meshRef = useRef<THREE.Mesh>(null)

  useEffect(() => {
    const loader = new THREE.TextureLoader()
    loader.load(SKY_URL, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace
      setTexture(tex)
    })
  }, [])

  // Follow camera so the sky always surrounds the viewer
  useFrame(({ camera }) => {
    if (meshRef.current) {
      meshRef.current.position.copy(camera.position)
    }
  })

  if (!texture) return null

  return (
    <mesh ref={meshRef} renderOrder={-1}>
      <sphereGeometry args={[500, 64, 32]} />
      <meshBasicMaterial
        map={texture}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  )
}
