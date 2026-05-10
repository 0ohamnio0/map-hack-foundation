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
  goToChapter: (chapter: Chapter) => void;
  triggerEvent: (id: string) => boolean;
  addMovement: (direction: 'left' | 'right', amount: number) => void;
  addToCart: (medicine: string) => void;
  removeFromCart: (index: number) => void;
  setActiveEffect: (effect: string | null, duration?: number) => void;
  setNotification: (text: string | null) => void;
  openNote: (id: string) => void;
  closeNote: () => void;
  setNoteLanguage: (lang: 'ko' | 'en') => void;
  toggleNoteLanguage: () => void;
  /** directionScore = rightMovement - leftMovement */
  getDirectionScore: () => number;
}

let effectTimeoutId: number | null = null;

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
    const ALL_MEDS = ['기분안정제', '항정신병약', '수면제', '항불안제', '다 먹음'];
    const others = ALL_MEDS.filter((m) => m !== removed);
    const replacement = others[Math.floor(Math.random() * others.length)];
    const newItems = [...cartItems];
    newItems[index] = replacement;
    set({ cartItems: newItems });
  },

  setActiveEffect: (effect, duration) => {
    if (effectTimeoutId) clearTimeout(effectTimeoutId);
    set({ activeEffect: effect });
    if (effect && duration) {
      effectTimeoutId = window.setTimeout(() => {
        set({ activeEffect: null });
        effectTimeoutId = null;
      }, duration);
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

  getDirectionScore: () => {
    const { rightMovement, leftMovement } = get();
    return rightMovement - leftMovement;
  },
}));

