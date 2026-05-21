# Map Hack — Agent Instructions

## 세션 시작 프로토콜

새 세션을 시작하는 에이전트는 아래 순서를 따를 것:

1. `git log --oneline -30` — 최근 커밋 이력 확인
2. 작업지시서 읽기:
   - **작업지시서 (구현)**: `41.10.07` — 구현 체크리스트 + 적용 순서 요약 + STEP별 프롬프트 + REF 코드
     `/Users/songhaemin/Library/Mobile Documents/iCloud~md~obsidian/Documents/Hamvault/📂 40. Personal Projects/📂 41. Creative Works/📂 41.10. Map Hack/41.10.07. 에이전트 작업지시서.md`
   - **CH.4 데모 노트**: `41.10.08` — Pretext Demo 작업 로그 (CH.4 작업 시에만 참고)
     `/Users/songhaemin/Library/Mobile Documents/iCloud~md~obsidian/Documents/Hamvault/📂 40. Personal Projects/📂 41. Creative Works/📂 41.10. Map Hack/41.10.08. Pretext Demo 진행 노트.md`
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

## 브랜치 규칙

- `main`은 안정 상태만 유지 (배포/공유 가능한 상태)
- 작업은 새 브랜치에서 진행: `feature/*` 또는 `dev/*`
- 작업 완료 후에만 `main`으로 머지
- `gh-pages`는 배포 스냅샷 전용 (수동/자동 배포 시에만 갱신)

**네이밍 예시**
- `feature/ch2-signpost`
- `feature/ch2-npc`
- `feature/ch3-cart`
- `docs/agent-handbook`
- `hotfix/<issue>`

**기본 흐름**
```bash
git checkout main
git pull
git checkout -b feature/ch2-signpost
# 작업 → 커밋 → 푸시
git push -u origin feature/ch2-signpost
# 완료 후 PR 또는 main 머지
```

## 작업 원칙

- 작업지시서의 STEP 순서와 Acceptance Criteria를 따를 것
- 셰이더 코드는 작업지시서 하단 **레퍼런스별 실활용 코드 예제** (REF-1~15) 참조
- 에셋 미도착 → stub 선행 구현 → 에셋 도착 시 경로만 swap
- `@react-three/postprocessing`은 STEP 8에서 설치 (그 전에는 없음)
