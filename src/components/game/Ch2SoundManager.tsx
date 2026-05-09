/**
 * STEP 3: CH.2 Distance-based spatial sound system
 * - ambient_street: always playing, volume based on average NPC distance
 * - Individual NPC voices: play within 8 units, volume = clamp(1 - dist/20, 0, 1)
 * - Special NPC voice: plays within 4 units
 * - Howler instances created on mount, destroyed on unmount
 *
 * Stub: silent mp3 placeholders — swap with real audio files later.
 */
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Howl } from 'howler'

const BASE = import.meta.env.BASE_URL

interface NPCSound {
  position: [number, number, number]
  src: string
  maxDist: number
  howl: Howl | null
  isSpecial?: boolean
}

const NPC_SOUND_DEFS: Omit<NPCSound, 'howl'>[] = [
  { position: [-3, 0, -8], src: 'ch2/npc_voice_1.mp3', maxDist: 4 },
  { position: [4, 0, -15], src: 'ch2/npc_voice_2.mp3', maxDist: 4 },
  { position: [-2, 0, -25], src: 'ch2/npc_voice_3.mp3', maxDist: 4 },
  { position: [18, 0, -38], src: 'ch2/npc_voice_1.mp3', maxDist: 4 },
  { position: [18, 0, -45], src: 'ch2/npc_special.mp3', maxDist: 8, isSpecial: true },
  { position: [24, 0, -50], src: 'ch2/npc_voice_2.mp3', maxDist: 4 },
  { position: [15, 0, -63], src: 'ch2/npc_voice_3.mp3', maxDist: 4 },
  { position: [-4, 0, -72], src: 'ch2/npc_voice_1.mp3', maxDist: 4 },
  { position: [2, 0, -80], src: 'ch2/npc_voice_2.mp3', maxDist: 4 },
]

export function Ch2SoundManager() {
  const { camera } = useThree()
  const ambientRef = useRef<Howl | null>(null)
  const npcSounds = useRef<NPCSound[]>([])

  // Create Howl instances on mount
  useEffect(() => {
    // Ambient street sound — always looping
    ambientRef.current = new Howl({
      src: [`${BASE}assets/audio/ch2/ambient_street.mp3`],
      loop: true,
      volume: 0.3,
    })
    ambientRef.current.play()

    // NPC voice instances
    npcSounds.current = NPC_SOUND_DEFS.map((def) => ({
      ...def,
      howl: new Howl({
        src: [`${BASE}assets/audio/${def.src}`],
        loop: true,
        volume: 0,
      }),
    }))

    // Start all NPC sounds (volume controlled per-frame)
    npcSounds.current.forEach((ns) => ns.howl?.play())

    // Cleanup on unmount
    return () => {
      ambientRef.current?.unload()
      ambientRef.current = null
      npcSounds.current.forEach((ns) => {
        ns.howl?.unload()
        ns.howl = null
      })
      npcSounds.current = []
    }
  }, [])

  // Update volumes per frame based on camera distance
  useFrame(() => {
    const cx = camera.position.x
    const cz = camera.position.z

    let totalDist = 0
    let count = 0

    npcSounds.current.forEach((ns) => {
      if (!ns.howl) return
      const dx = cx - ns.position[0]
      const dz = cz - ns.position[2]
      const dist = Math.sqrt(dx * dx + dz * dz)

      totalDist += dist
      count++

      // Volume: louder when close, silent when far
      const maxDist = ns.maxDist
      const vol = Math.max(0, Math.min(1, 1 - dist / maxDist))

      // Special NPC only audible within 4 units
      const finalVol = ns.isSpecial ? (dist < 4 ? vol * 1.5 : 0) : vol
      ns.howl.volume(Math.min(1, finalVol))
    })

    // Ambient volume: louder when far from NPCs, quieter when close
    if (ambientRef.current && count > 0) {
      const avgDist = totalDist / count
      // Far from NPCs → ambient dominates (0.3~0.6)
      // Close to NPCs → ambient fades (0.1~0.3)
      const ambientVol = Math.min(0.6, Math.max(0.1, avgDist / 60))
      ambientRef.current.volume(ambientVol)
    }
  })

  return null
}
