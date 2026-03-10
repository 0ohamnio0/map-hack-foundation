# Map Hack — Dev Log

---

## 2026-03-04 — idle 애니메이션 도입 + Rapier 프리즈 미해결

### 목표

`idle.zip` (파일명: `Meshy_AI_Animation_Short_Breathe_and_Look_Around_frame_rate_24.fbx`)을
CH2 캐릭터의 정지 상태 애니메이션으로 연결.
기존에는 idle 상태에서도 Walking 클립이 재생되고 있었음.

---

### 완료된 작업

#### 1. idle FBX 추가
- `public/assets/characters/Meshy_AI_Animation_Short_Breathe_and_Look_Around_frame_rate_24.fbx` 복사 완료 (6.4MB)
- FBX 내부 take 이름: `Armature|Armature|Armature|Armature|Short_Breathe_and_Look_Around|base`

#### 2. ANIM_SET 업데이트
```ts
const IDLE_CLIP = 'idle_breathe';

const ANIM_SET = {
  idle:      IDLE_CLIP,
  walk:      'Walking_frame_rate_24.fbx',
  run:       'Running_frame_rate_24.fbx',
  jump:      'Walking_frame_rate_24.fbx',
  jumpIdle:  IDLE_CLIP,
  jumpLand:  'Walking_frame_rate_24.fbx',
  fall:      IDLE_CLIP,
};
```

#### 3. idle FBX 로딩 방식 결정 — `useEffect` + `FBXLoader.load()`
- `useFBX(idleUrl)` 두 번 호출 시 두 번의 Suspense 이벤트 → Physics 두 번 remount → Rapier WASM 패닉
- `useFBX([url1, url2])` 배열 문법도 각 URL이 독립적으로 suspend → 동일하게 두 번 remount
- **해결책**: idle FBX만 `useEffect` 안에서 `new FBXLoader().load()` 로 수동 로드 (Suspense 없음)

```ts
useEffect(() => {
  if (!mixer) return;
  let cancelled = false;
  const loader = new FBXLoader();
  loader.load(IDLE_FBX_URL, (idleFbx) => {
    if (cancelled || !groupRef.current) return;
    const clip = idleFbx.animations[0].clone();
    clip.name = IDLE_CLIP;
    setIdleAction(mixer.clipAction(clip, groupRef.current));
  });
  return () => { cancelled = true; };
}, [mixer]);
```

#### 4. PhysicsReadyGate 추가
- Physics 첫 프레임에 `world.castRay()` 호출 시 Rapier 패닉 발생
- 10프레임 경과 후 `disableControl` 해제

```tsx
const PhysicsReadyGate: React.FC<{ onReady: () => void }> = ({ onReady }) => {
  const frameCount = useRef(0);
  const notified = useRef(false);
  useFrame(() => {
    if (notified.current) return;
    if (++frameCount.current >= 10) { notified.current = true; onReady(); }
  });
  return null;
};
```

#### 5. Suspense 경계 Physics 위로 이동 (최종 시도)
- `PlayerCharacter` 안의 `useFBX(MAIN_FBX_URL)`가 cold-cache에서 Suspense를 던지면
  React가 Physics 위의 Suspense 경계까지 올라가 Physics를 unmount/remount → Rapier 패닉
- **해결 시도**: `Ch2PhysicsScene` 컴포넌트를 새로 만들어서
  그 안에서 `useFBX(MAIN_FBX_URL)` → Suspense 발생 → Physics 위 `<React.Suspense fallback={null}>`에서 캐치
  → FBX 로드 완료 후 Physics 최초 mount → `PlayerCharacter`의 `useFBX`는 캐시 히트로 re-suspend 없음

```tsx
// Ch2Inner 안
<React.Suspense fallback={null}>
  <Ch2PhysicsScene ... />
</React.Suspense>

// Ch2PhysicsScene 안
const Ch2PhysicsScene = (props) => {
  useFBX(MAIN_FBX_URL); // ← 여기서 suspend, Physics 위에서 캐치
  return <Physics>...</Physics>;
};
```

- **Playwright headless 테스트**: 3s / 8s / 15s 모두 PASS (에러 0)
- **실제 브라우저**: 여전히 ArrowUp 누르면 프리즈

---

### 현재 상태 — 미해결

| 환경 | 증상 |
|------|------|
| Playwright headless Chromium | ArrowUp 3s/8s/15s 모두 에러 0 → PASS |
| 실제 브라우저 (첫 방문) | ArrowUp 누르는 순간 프리즈 |
| 실제 브라우저 (재방문/캐시 있음) | 미확인 |

headless 테스트에서는 통과하지만 실제 브라우저에서는 프리즈.
→ 테스트와 실제 환경 간 재현 차이 존재. 원인 불명.

---

### 다음에 시도해볼 것

1. **브라우저 콘솔 직접 확인**
   - F12 → Console 탭에서 ArrowUp 프리즈 직전/직후 오류 메시지 캡처
   - `Uncaught (in promise)` / `unreachable` / `RuntimeError` 등 Rapier WASM 패닉 로그 있는지 확인

2. **ecctrl `autoBalance` / `springK` 충돌 가능성**
   - ecctrl 내부에서 매 프레임 `castRay` 호출 — Rapier body가 아직 초기화 안 됐을 때 충돌 가능
   - `autoBalance={false}` 또는 `springK={0}` 테스트

3. **RigidBody `canSleep` 문제 가능성**
   - ecctrl의 캡슐 body가 idle 상태에서 sleep → 첫 key 입력으로 wake 시 충돌
   - ecctrl에 `wakeUpDelay` 또는 keep-awake 옵션 있는지 확인

4. **`jumpVel={0}` 제거 테스트**
   - ecctrl에 `jumpVel={0}` 설정이 내부 로직을 이상하게 만드는지 확인

5. **ecctrl 버전 다운그레이드**
   - 현재: ecctrl@1.0.97 + rapier@2.2.0 + three@0.177.0
   - ecctrl README의 peer dependency 버전과 맞는지 확인

6. **Ecctrl 없이 수동 RigidBody로 교체**
   - ecctrl이 근본 원인이라면, `@react-three/rapier`의 `RigidBody` + `useRapier`로 직접 캐릭터 컨트롤러 구현

---

### 현재 파일 구조 (Ch2Scene.tsx 주요 변경점)

```
Ch2Scene (export)
└── Canvas
    └── Ch2Inner
        ├── color / FlickerLight / directionalLight
        └── React.Suspense fallback={null}         ← NEW: FBX 로드 전 Physics 마운트 방지
            └── Ch2PhysicsScene                    ← NEW
                ├── useFBX(MAIN_FBX_URL)           ← 여기서 Suspense 발생, 위에서 캐치
                └── Physics
                    ├── PhysicsReadyGate           ← 10프레임 settle 후 controls 활성화
                    ├── StreetScene
                    ├── KeyboardControls
                    │   └── Ecctrl disableControl={!physicsReady}
                    │       └── PlayerCharacter
                    │           ├── useFBX(MAIN_FBX_URL)   ← 캐시 히트, re-suspend 없음
                    │           └── useEffect FBXLoader.load(IDLE_FBX_URL)  ← Suspense 없음
                    └── TriggerWatcher
```

---

### 스택 버전

| 패키지 | 버전 |
|--------|------|
| react | 19.1.0 |
| @react-three/fiber | 9.5.0 |
| @react-three/rapier | 2.2.0 |
| @dimforge/rapier3d-compat | 0.19.2 |
| ecctrl | 1.0.97 |
| three | 0.177.0 |

---

## 2026-03-04 — CH2 안정화/연출 정리 (후속)

### 요약

- 첫 방문 프리즈 회피를 위해 `Ecctrl` 마운트/옵션을 추가 조정.
- 캐릭터 리소스를 `Main_0304.zip`의 `Meshy_AI_biped` 세트로 교체.
- 애니메이션 제어를 ecctrl 상태머신에서 분리하고 입력 기반 수동 제어로 고정.
- 하늘 저해상도 텍스처(의도적 깨짐) 및 캐릭터 가시성 개선 라이팅 적용.

### 주요 변경

#### 1. 프리즈 완화 방향
- `physicsReady` 전에는 `Ecctrl` 자체를 렌더하지 않도록 변경(지연 마운트).
- 안정화 목적 파라미터 유지:
  - `camCollision={false}`
  - `autoBalance={false}`
- 디버깅용 입력 로그 추가:
  - `[CH2][INPUT] keydown/keyup`
  - `[CH2][STATE] physicsReady changed`

#### 2. 캐릭터 자산 교체 (Main_0304.zip)
- 압축 해제 경로:
  - `public/assets/characters_biped/Meshy_AI_biped/*`
- CH2 참조 경로 교체:
  - 메인: `Meshy_AI_Animation_Walking_frame_rate_24.fbx`
  - idle: `Meshy_AI_Animation_Long_Breathe_and_Look_Around_frame_rate_24.fbx`
  - walk: `Meshy_AI_Animation_Walking_frame_rate_24.fbx`
  - headache: `Meshy_AI_Animation_Headache_Relief_frame_rate_24.fbx`
  - injured: `Meshy_AI_Animation_Injured_Walk_frame_rate_24.fbx`
  - 텍스처 4종도 `characters_biped` 기준으로 교체

#### 3. 애니메이션 정책 단순화
- 요구사항 기준으로 현재 정책 고정:
  - 입력 없음: `Idle (Long_Breathe...)` 루프
  - 방향키 입력: `Walking` 루프
  - 공항 환각(airportActive): `Headache_Relief` 우선
- turn 계열 클립(`Run_Turn_Left/Right`)은 현재 단계에서 배제.
- 비선택 액션은 강제 `stop + weight 0` 처리.

#### 4. 카메라/방향 보정
- 카메라가 캐릭터 등 뒤를 따라가는 구도로 조정:
  - `camInitDir={{ x: 0.25, y: Math.PI }}`
  - `camTargetPos={{ x: 0, y: 0.8, z: 0 }}`
  - `characterInitDir={Math.PI}`

#### 5. 하늘 텍스처 + 라이팅
- 하늘 텍스처 추가:
  - 원본: `public/assets/sky/cloud_hole_lowres.jpg` (258x195)
  - 업스케일: `public/assets/sky/cloud_hole_upscaled_pixel.jpg`
- 의도적 저해상도 표현:
  - `NearestFilter`
  - `generateMipmaps = false`
  - 구체 배경(`BackSide`) 적용
- 캐릭터 가시성 향상:
  - `hemisphereLight` + 보조 `directionalLight` 추가
  - 메인 라이트 intensity 상향
  - 캐릭터 재질 파라미터 보정 (`metalness 0.25`, `roughness 0.72`)

### 현재 상태

- CH2에서 캐릭터 모델/텍스처는 `Meshy_AI_biped`로 교체 완료.
- 기본 루프(Idle/Walk) 및 공항 환각 Headache 애니메이션 연결 완료.
- 하늘 배경과 라이팅으로 캐릭터 디테일 가시성 개선 완료.

### 다음 TODO

1. Turn 클립 완전 비활성 검증
2. 공항 환각 구간 `Headache_Relief` 길이/루프 타이밍 미세조정
3. 캐릭터 밝기 최종값(모바일 포함) A/B 테스트
4. 디버그 로그(`[CH2][INPUT]`, `[CH2][STATE]`, `[CH2][ANIM]`) 정리/제거
5. CH2 자산 경로(`characters` vs `characters_biped`) 정리 및 불필요 파일 정리
