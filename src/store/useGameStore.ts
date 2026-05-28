import { create } from 'zustand';

export type Chapter = 'START' | 'INTRO' | 'CH1' | 'CH2' | 'CH3' | 'CH4' | 'CH5' | 'END';

interface GameState {
  chapter: Chapter;
  visitedEvents: Set<string>;
  isTransitioning: boolean;
  leftMovement: number;
  rightMovement: number;
  cartItems: string[];
  activeEffect: string | null;
  notification: string | null;
  /** CH.2 떨어진 쪽지 — 현재 열려 있는 쪽지 id (null이면 닫힌 상태) */
  activeNoteId: string | null;
  /** 노트 본문 표시 언어 — 세션 전역 유지 (Q 키로 토글) */
  noteLanguage: 'ko' | 'en';
  /** CH.2 우체통에 편지를 보냈는지 — true면 7/7 없이도 CH.3 문 통과 가능 */
  letterSent: boolean;
  goToChapter: (chapter: Chapter) => void;
  /** 챕터 exit 시 해당 챕터에 귀속된 store 상태 초기화 (방명록·visitedEvents 타 챕터 항목은 보존) */
  resetChapterState: (chapter: Chapter) => void;
  triggerEvent: (id: string) => boolean;
  addMovement: (direction: 'left' | 'right', amount: number) => void;
  addToCart: (medicine: string) => void;
  removeFromCart: (index: number) => void;
  setActiveEffect: (effect: string | null, duration?: number) => void;
  /** ghost encounter 발생 신호 — setActiveEffect의 minimum duration 후 effect 종료 트리거 */
  markGhostEncounter: () => void;
  setNotification: (text: string | null) => void;
  openNote: (id: string) => void;
  closeNote: () => void;
  setNoteLanguage: (lang: 'ko' | 'en') => void;
  toggleNoteLanguage: () => void;
  /** 편지 전송 완료 — note_* 기록은 보존(맵 재생성 방지), letterSent=true (HUD에선 소멸 표시) */
  sendLetter: () => void;
  /** directionScore = rightMovement - leftMovement */
  getDirectionScore: () => number;
}

let effectTimeoutId: number | null = null;
let ghostEncounteredFlag = false;
let minDurationPassed = false;

export const useGameStore = create<GameState>((set, get) => ({
  chapter: 'START',
  visitedEvents: new Set<string>(),
  isTransitioning: false,
  leftMovement: 0,
  rightMovement: 0,
  cartItems: [],
  activeEffect: null,
  notification: null,
  activeNoteId: null,
  noteLanguage: 'ko',
  letterSent: false,

  goToChapter: (chapter: Chapter) => {
    set({ isTransitioning: true });
    // Mid-point transition (400ms fade out, 400ms fade in)
    setTimeout(() => {
      set({ chapter });
    }, 400);
    setTimeout(() => {
      set({ isTransitioning: false });
    }, 800);
  },

  resetChapterState: (chapter: Chapter) => {
    const { visitedEvents } = get();
    const filterPrefixes = (prefixes: string[]) => {
      const next = new Set<string>();
      visitedEvents.forEach((id) => {
        if (!prefixes.some((p) => id.startsWith(p))) next.add(id);
      });
      return next;
    };
    switch (chapter) {
      case 'CH1':
        set({ leftMovement: 0, rightMovement: 0 });
        return;
      case 'CH2':
        set({
          visitedEvents: filterPrefixes(['note_', 'ch2_']),
          activeNoteId: null,
          letterSent: false,
        });
        return;
      case 'CH3':
        if (effectTimeoutId) {
          clearTimeout(effectTimeoutId);
          effectTimeoutId = null;
        }
        set({
          visitedEvents: filterPrefixes(['ch3_']),
          cartItems: [],
          activeEffect: null,
        });
        return;
      default:
        return;
    }
  },

  triggerEvent: (id: string) => {
    const { visitedEvents } = get();
    if (visitedEvents.has(id)) return false;
    const newSet = new Set(visitedEvents);
    newSet.add(id);
    set({ visitedEvents: newSet });
    return true;
  },

  addMovement: (direction, amount) => {
    if (direction === 'left') {
      set(s => ({ leftMovement: s.leftMovement + amount }));
    } else {
      set(s => ({ rightMovement: s.rightMovement + amount }));
    }
  },

  addToCart: (medicine: string) => {
    // STEP 4: 약 1개 픽업 → 카트에 2개 (복제)
    const { cartItems } = get();
    set({ cartItems: [...cartItems, medicine, medicine] });
  },

  removeFromCart: (index: number) => {
    // STEP 4: 약 버리기 시도 → 다른 약으로 교체 (약은 줄지 않음)
    const { cartItems } = get();
    const removed = cartItems[index];
    const ALL_MEDS = ['Lithium Carbonate', 'Aripiprazole', 'Quetiapine Fumarate', 'Alprazolam', 'Fluoxetine'];
    const others = ALL_MEDS.filter((m) => m !== removed);
    const replacement = others[Math.floor(Math.random() * others.length)];
    const newItems = [...cartItems];
    newItems[index] = replacement;
    set({ cartItems: newItems });
  },

  setActiveEffect: (effect, duration) => {
    if (effectTimeoutId) clearTimeout(effectTimeoutId);
    set({ activeEffect: effect });
    ghostEncounteredFlag = false;
    minDurationPassed = false;
    if (effect && duration) {
      // duration = minimum 보장. duration 후 ghostEncountered 체크, true면 종료, false면 polling
      const tryEnd = () => {
        if (ghostEncounteredFlag) {
          set({ activeEffect: null });
          effectTimeoutId = null;
        } else {
          effectTimeoutId = window.setTimeout(tryEnd, 200);
        }
      };
      effectTimeoutId = window.setTimeout(() => {
        minDurationPassed = true;
        tryEnd();
      }, duration);
    }
  },

  markGhostEncounter: () => {
    ghostEncounteredFlag = true;
    // minimum 이미 지났으면 즉시 종료
    if (minDurationPassed) {
      if (effectTimeoutId) clearTimeout(effectTimeoutId);
      effectTimeoutId = null;
      set({ activeEffect: null });
    }
  },

  setNotification: (notification) => {
    set({ notification });
  },

  openNote: (id: string) => {
    set({ activeNoteId: id });
  },

  closeNote: () => {
    const { activeNoteId, visitedEvents } = get();
    if (!activeNoteId) return;
    // 한 번 읽으면 휘발 — visitedEvents에 영구 기록
    const newSet = new Set(visitedEvents);
    newSet.add(`note_${activeNoteId}`);
    set({ visitedEvents: newSet, activeNoteId: null });
  },

  setNoteLanguage: (lang) => set({ noteLanguage: lang }),
  toggleNoteLanguage: () => set(s => ({ noteLanguage: s.noteLanguage === 'ko' ? 'en' : 'ko' })),

  sendLetter: () => {
    // 시(note_*)는 visitedEvents에 그대로 보존 — 맵에 재생성되면 안 됨(영영 우체통行).
    // letterSent=true 만 세팅 → HUD에선 발송됨(소멸)으로 표시, 문 통과 허용.
    set({ letterSent: true });
  },

  getDirectionScore: () => {
    const { rightMovement, leftMovement } = get();
    return rightMovement - leftMovement;
  },
}));

