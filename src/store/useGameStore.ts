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
  goToChapter: (chapter: Chapter) => void;
  triggerEvent: (id: string) => boolean;
  addMovement: (direction: 'left' | 'right', amount: number) => void;
  addToCart: (medicine: string) => void;
  setActiveEffect: (effect: string | null, duration?: number) => void;
  setNotification: (text: string | null) => void;
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
    const { cartItems } = get();
    if (cartItems.length < 5) {
      set({ cartItems: [...cartItems, medicine] });
    }
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
}));

