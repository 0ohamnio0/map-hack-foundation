/**
 * 우클릭 드래그 동안만 카메라 자유 시점 — 떼면 ecctrl FixedCamera 정면추종으로 복귀.
 *
 * ecctrl은 카메라를 parenting하지 않고 매 프레임 followCam world로 lerp +
 * lookAt(pivot.position) 만 한다(Ecctrl.js:1676-1678). 그래서 ecctrl 갱신 '이후'에
 * 도는 useFrame에서, 캐릭터 타겟 기준으로 카메라를 yaw/pitch 회전시키면 된다.
 * 드래그 중엔 누적 오프셋 유지, 떼면 0으로 감쇠 → ecctrl 프레이밍으로 자연 복귀.
 *
 * 이 컴포넌트는 반드시 <Ecctrl> '뒤'에 마운트(동일 priority면 등록 순서대로 실행).
 */
import { useThree, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useEffect, useRef } from 'react'
import type { CustomEcctrlRigidBody } from 'ecctrl'

const SENS = 0.003          // rad / px
const DECAY = 9             // 복귀 감쇠 강도
const EPS = 1e-3
// 캐릭터 위 타겟 = camTargetPos.y(0.8) + capsuleHalfHeight(0.5) + capsuleRadius/2(0.1)
const TARGET_Y = 1.4

interface Props {
  targetRef: React.RefObject<CustomEcctrlRigidBody | null>
  enabled: boolean
}

export const CameraOrbitOverride: React.FC<Props> = ({ targetRef, enabled }) => {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)

  const dragging = useRef(false)
  const yaw = useRef(0)
  const pitch = useRef(0)

  const T = useRef(new THREE.Vector3())
  const offset = useRef(new THREE.Vector3())
  const sph = useRef(new THREE.Spherical())

  useEffect(() => {
    const el = gl.domElement

    const onDown = (e: PointerEvent) => {
      if (e.button !== 2 || !enabled) return
      dragging.current = true
      el.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return
      yaw.current -= e.movementX * SENS
      pitch.current += e.movementY * SENS
    }
    const onUp = (e: PointerEvent) => {
      if (!dragging.current) return
      dragging.current = false
      try { el.releasePointerCapture(e.pointerId) } catch { /* noop */ }
    }
    const onCtx = (e: Event) => e.preventDefault() // 우클릭 메뉴 차단

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    el.addEventListener('contextmenu', onCtx)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      el.removeEventListener('contextmenu', onCtx)
    }
  }, [gl, enabled])

  useFrame((_, delta) => {
    if (!dragging.current) {
      if (!enabled) { yaw.current = 0; pitch.current = 0 }
      // 떼면 지수 감쇠로 ecctrl 프레이밍에 복귀
      const k = 1 - Math.exp(-DECAY * delta)
      yaw.current *= 1 - k
      pitch.current *= 1 - k
      if (Math.abs(yaw.current) < EPS && Math.abs(pitch.current) < EPS) return // ecctrl가 카메라 소유
    }

    const rb = targetRef.current?.group
    if (!rb) return
    const p = rb.translation()
    T.current.set(p.x, p.y + TARGET_Y, p.z)

    // ecctrl가 이번 프레임에 이미 배치한 카메라 위치를 base로 회전만 덧입힘
    offset.current.copy(camera.position).sub(T.current)
    sph.current.setFromVector3(offset.current)
    sph.current.theta += yaw.current
    sph.current.phi = THREE.MathUtils.clamp(
      sph.current.phi - pitch.current,
      0.15,
      Math.PI * 0.82,
    )
    sph.current.makeSafe()
    offset.current.setFromSpherical(sph.current)
    camera.position.copy(T.current).add(offset.current)
    camera.lookAt(T.current)
  })

  return null
}
