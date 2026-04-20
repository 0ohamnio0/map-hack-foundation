import { useEffect, useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

const MODEL_URL = `${import.meta.env.BASE_URL}assets/ch5/retro_pc.glb`

type Props = {
  /** html2canvas dataURL — replaces the baked Windows 98 screen with the blog snapshot */
  screenDataUrl?: string | null
}

export const RetroPC: React.FC<Props> = ({ screenDataUrl }) => {
  const { scene, materials } = useGLTF(MODEL_URL)

  const screenTexture = useMemo(() => {
    if (!screenDataUrl) return null
    const tex = new THREE.TextureLoader().load(screenDataUrl)
    tex.flipY = false
    tex.colorSpace = THREE.SRGBColorSpace
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    return tex
  }, [screenDataUrl])

  useEffect(() => {
    const screenMat = materials.Screen_Material as THREE.MeshStandardMaterial | undefined
    if (!screenMat) return
    if (screenTexture) {
      screenMat.map = screenTexture
      screenMat.emissiveMap = screenTexture
      screenMat.emissive = new THREE.Color(1, 1, 1)
      screenMat.emissiveIntensity = 1.4
    }
    screenMat.needsUpdate = true
  }, [screenTexture, materials])

  return <primitive object={scene} />
}

useGLTF.preload(MODEL_URL)
