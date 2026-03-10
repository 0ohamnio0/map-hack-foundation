/**
 * StarNest as a standalone fullscreen Canvas overlay.
 * Used in CH.3 elevator cutscene space phase.
 */
import React from 'react'
import { Canvas } from '@react-three/fiber'
import { StarNestBackground } from './StarNestBackground'

interface StarNestOverlayProps {
  duration?: number
  style?: React.CSSProperties
}

export const StarNestOverlay: React.FC<StarNestOverlayProps> = ({
  duration = 30,
  style,
}) => {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 1001,
      pointerEvents: 'none',
      ...style,
    }}>
      <Canvas
        orthographic
        camera={{ position: [0, 0, 1], zoom: 1 }}
        style={{ width: '100%', height: '100%' }}
        gl={{ alpha: false }}
      >
        <StarNestBackground duration={duration} />
      </Canvas>
    </div>
  )
}
