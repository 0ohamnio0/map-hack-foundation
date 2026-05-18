/**
 * 좌클릭 드래그 동안만 카메라 자유 시점 — 떼면 ecctrl FixedCamera 정면추종 복귀.
 *
 * 핵심: 드래그 중 onDraggingChange(true) → 부모가 Ecctrl에 disableFollowCam={true}
 * 전달 → ecctrl이 카메라를 아예 안 건드림(Ecctrl.js:1675 가드). 그동안 이 컴포넌트가
 * 캐릭터 타겟 기준 궤도로 카메라를 단독 제어(프레임 순서 무관). 떼면 false →
 * ecctrl 자체 lerp로 정면추종에 부드럽게 복귀.
 *
 * 드래그 시작 시 기준 구면좌표(radius/theta/phi)를 캡처하고 이후 마우스 델타만
 * 더한다 → 누적 드리프트/거리 출렁임 없음. 캐릭터가 움직여도 타겟은 매 프레임 추종.
 */
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import type { CustomEcctrlRigidBody } from 'ecctrl'

const SENS = 0.004          // rad / px
// 캐릭터 위 타겟 = camTargetPos.y(0.8) + capsuleHalfHeight(0.5) + capsuleRadius/2(0.1)
const TARGET_Y = 1.4
const PHI_MIN = 0.15
const PHI_MAX = Math.PI * 0.82

interface Props {
  targetRef: React.RefObject<CustomEcctrlRigidBody | null>
  enabled: boolean
  onDraggingChange: (dragging: boolean) => void
}

export const CameraOrbitOverride: React.FC<Props> = ({ targetRef, enabled, onDraggingChange }) => {
  const camera = useThree((s) => s.camera)

  const dragging = useRef(false)
  const needBase = useRef(false)        // 드래그 첫 프레임에 기준 구면좌표 캡처
  const baseTheta = useRef(0)
  const basePhi = useRef(Math.PI / 2)
  const radius = useRef(4)
  const dYaw = useRef(0)                // 드래그 시작 이후 마우스 누적 델타
  const dPitch = useRef(0)

  const T = useRef(new THREE.Vector3())
  const off = useRef(new THREE.Vector3())
  const sph = useRef(new THREE.Spherical())

  useEffect(() => {
    // mouse 이벤트 + window 레벨: 우클릭 시 pointercancel(contextmenu 동반)이
    // 드래그를 즉시 끊는 문제 회피 + DOM 오버레이가 캔버스를 덮어도 수신.
    const stop = () => {
      if (!dragging.current) return
      dragging.current = false
      onDraggingChange(false)
    }
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0 || !enabled) return
      dragging.current = true
      needBase.current = true
      dYaw.current = 0
      dPitch.current = 0
      onDraggingChange(true)
    }
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return
      dYaw.current -= e.movementX * SENS
      dPitch.current += e.movementY * SENS
    }
    const onUp = (e: MouseEvent) => {
      if (e.button === 0) stop()
    }
    const onBlur = () => stop()

    window.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [enabled, onDraggingChange])

  useFrame(() => {
    if (!dragging.current) return // ecctrl이 카메라 소유 (disableFollowCam=false)

    const rb = targetRef.current?.group
    if (!rb) return
    const p = rb.translation()
    T.current.set(p.x, p.y + TARGET_Y, p.z)

    if (needBase.current) {
      // 드래그 직전 ecctrl 프레이밍을 기준으로 캡처
      off.current.copy(camera.position).sub(T.current)
      sph.current.setFromVector3(off.current)
      radius.current = sph.current.radius
      baseTheta.current = sph.current.theta
      basePhi.current = sph.current.phi
      needBase.current = false
    }

    sph.current.radius = radius.current
    sph.current.theta = baseTheta.current + dYaw.current
    sph.current.phi = THREE.MathUtils.clamp(basePhi.current - dPitch.current, PHI_MIN, PHI_MAX)
    sph.current.makeSafe()
    off.current.setFromSpherical(sph.current)
    camera.position.copy(T.current).add(off.current)
    camera.lookAt(T.current)
  })

  return null
}
