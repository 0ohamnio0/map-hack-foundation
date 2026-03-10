# Map Hack — Agent Instructions

## 세션 시작 프로토콜

새 세션을 시작하는 에이전트는 아래 순서를 따를 것:

1. `git log --oneline -30` — 최근 커밋 이력 확인
2. 작업지시서 2개 읽기:
   - **작업지시서 (구현)**: `41.10.07` — 구현 체크리스트 + 적용 순서 요약 + STEP별 프롬프트 + REF 코드
     `/Users/songhaemin/Library/Mobile Documents/iCloud~md~obsidian/Documents/Hamvault/📂 40. Personal Projects/📂 41. Creative Works/41.10.07. 에이전트 작업지시서.md`
   - **작업지시서 (SPEC)**: `41.10.08` — 기술 스펙, 설계 제약, 상세 요구사항
     `/Users/songhaemin/Library/Mobile Documents/iCloud~md~obsidian/Documents/Hamvault/📂 40. Personal Projects/📂 41. Creative Works/41.10.08. 에이전트 작업지시서 (SPEC).md`
3. git log 커밋 메시지 vs 체크리스트를 대조 → 완료/미완료 판별
4. 미완료 항목 중 **적용 순서 요약 테이블 기준** 다음 STEP부터 이어서 진행
5. STEP 완료 시마다 해당 **Acceptance Criteria** 전부 통과 확인 + `npm run build` 성공 확인

## 프로젝트 개요

**Map Hack** — 조울증 경험을 1인칭/3인칭 미로 탐색으로 표현하는 웹 인터랙티브 게임 (5~10분)
스택: Vite 6 + React 19 + TypeScript + R3F + Zustand + @react-three/rapier + ecctrl

## 주요 파일

- `src/store/useGameStore.ts` — 전역 상태 (chapter, cartItems, activeEffect 등)
- `src/Game.tsx` — 챕터 라우터
- `src/scenes/` — IntroScene, Ch1~3Scene
- `src/screens/` — Ch4Screen, Ch5Screen (2D)
- `src/components/game/` — PlayerController, EffectOverlay 등
- `DEV_LOG.md` — 과거 개발 기록 (참고용)

## 커밋 규칙

- 커밋 메시지에 STEP 번호 포함: `STEP 8: Add EffectComposer to CH.1~3`
- 한 STEP 내에서도 의미 단위로 나눠서 커밋 (한꺼번에 몰아서 X)
- 에셋 미도착 항목은 stub으로 구현, 커밋 메시지에 `(stub)` 표기

## 작업 원칙

- 작업지시서의 STEP 순서와 Acceptance Criteria를 따를 것
- 셰이더 코드는 작업지시서 하단 **레퍼런스별 실활용 코드 예제** (REF-1~15) 참조
- 에셋 미도착 → stub 선행 구현 → 에셋 도착 시 경로만 swap
- `@react-three/postprocessing`은 STEP 8에서 설치 (그 전에는 없음)
