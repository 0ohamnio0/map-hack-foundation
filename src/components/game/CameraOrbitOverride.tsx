/**
 * 좌클릭 드래그 = 시점 회전 + 전진방향 일치 (+ 상하 보기).
 *
 * ecctrl rotateCamera(x, y): y → pivot.rotation.y (yaw, 전진방향과 공유),
 *                            x → followCam.rotation.x (pitch, 상하).
 * FixedCamera에서 카메라는 pivot 자식이라 pivot/followCam만 돌리면 시점이 따라온다.
 *
 * - 좌우(yaw): 누적 유지 → 드래그 후 전진키 = 그 방향 이동, 캐릭터도 그쪽.
 * - 상하(pitch): 드래그 중에만, 떼면 0으로 부드럽게 복귀 → 기본 프레이밍 유지.
 */
import { useEffect, useRef } from 'react'
import type { CustomEcctrlRigidBody } from 'ecctrl'

const YAW_SENS = 0.003    // rad / px (좌우)
const PITCH_SENS = 0.003  // rad / px (상하)
const PITCH_RETURN = 0.18 // 떼면 pitch 복귀 속도 (0~1, 클수록 빠름)

type Rotatable = { rotateCamera?: (x: number, y: number) => void } | null

export const CameraOrbitOverride: React.FC<Props> = ({ targetRef, enabled }) => {
  const dragging = useRef(false)
  const pitchSum = useRef(0) // 드래그로 누적된 pitch (복귀용 추적)
  const raf = useRef(0)

  useEffect(() => {
    const getRb = () => targetRef.current as unknown as Rotatable

    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 || !enabled) return
      dragging.current = true
      cancelAnimationFrame(raf.current) // 복귀 중이었으면 중단
    }
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      const p = e.movementY * PITCH_SENS
      pitchSum.current += p
      getRb()?.rotateCamera?.(p, -e.movementX * YAW_SENS)
    }
    const settlePitch = () => {
      const rb = getRb()
      if (!rb || Math.abs(pitchSum.current) < 1e-3) { pitchSum.current = 0; return }
      const step = pitchSum.current * PITCH_RETURN
      rb.rotateCamera?.(-step, 0)       // pitch만 0쪽으로, yaw는 유지
      pitchSum.current -= step
      raf.current = requestAnimationFrame(settlePitch)
    }
    const stop = () => {
      if (!dragging.current) return
      dragging.current = false
      cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(settlePitch) // pitch 기본으로 복귀
    }

    window.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', stop)
    window.addEventListener('blur', stop)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', stop)
      window.removeEventListener('blur', stop)
      cancelAnimationFrame(raf.current)
    }
  }, [enabled, targetRef])

  return null
}

interface Props {
  targetRef: React.RefObject<CustomEcctrlRigidBody | null>
  enabled: boolean
}
