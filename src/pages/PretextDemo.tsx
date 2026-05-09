/**
 * 폴리곤 기반 건축적 텍스트 레이아웃 — 인터랙티브 에디터
 * /pretext-demo
 *
 * - 캔버스 더블클릭: 새 폴리곤 추가 (클릭 위치에 기본 사각형)
 * - 꼭짓점 드래그: 폴리곤 형태 편집
 * - 패널: font, lineHeight, padding, text, color 편집
 * - 폴리곤 삭제, 꼭짓점 추가/삭제
 * - Export JSON
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  PretextTypography,
  DEFAULT_CONFIG,
  DEFAULT_POLYGONS,
  type TypographyConfig,
  type TextPolygon,
  type KoOverride,
  type GlitchSubstitution,
} from '@/components/effects/PretextTypography';
import { InkBleed } from '@/components/effects/InkBleed';
import { Ch5Screen } from '@/screens/Ch5Screen';
import { useSoundManager } from '@/hooks/useSoundManager';
import { stopAllMusic } from '@/lib/chapterMusic';
import { Howl } from 'howler';

const TYPING_BASE = `${import.meta.env.BASE_URL}assets/audio/ch4/typing/`;
const TYPING_COUNT = 10;

// ── Typing / language helpers ──

interface TypingParams {
  /** ms per character */
  charInterval: number;
  /** ms delay between polygons */
  polyDelay: number;
}

const DEFAULT_TYPING_PARAMS: TypingParams = {
  charInterval: 25,
  polyDelay: 300,
};

/**
 * Resolve a polygon for the current cycle. EN: returns as-is.
 * KO: merges koOverride and swaps text to textKo (falling back to text).
 */
function resolvePolygon(poly: TextPolygon, cycleIdx: number): TextPolygon {
  const useKo = cycleIdx % 2 === 1;
  if (!useKo) return poly;

  const koText =
    poly.textKo && poly.textKo.length > 0 ? poly.textKo : poly.text;
  const ko = poly.koOverride;
  if (!ko) {
    return { ...poly, text: koText };
  }
  return {
    ...poly,
    text: koText,
    font: ko.font ?? poly.font,
    lineHeight: ko.lineHeight ?? poly.lineHeight,
    padding: ko.padding ?? poly.padding,
    rotation: ko.rotation ?? poly.rotation,
    rotationEnd: ko.rotationEnd ?? poly.rotationEnd,
    fanPivot: ko.fanPivot ?? poly.fanPivot,
    mode: ko.mode ?? poly.mode,
    color: ko.color ?? poly.color,
  };
}

/** Shortcut: current-cycle text content. */
function resolveText(poly: TextPolygon, cycleIdx: number): string {
  return resolvePolygon(poly, cycleIdx).text;
}

/** Extract the px size from a CSS font string (e.g. '20px "X", Y' → '20px'). */
function extractFontSize(font: string): string {
  const m = font.match(/(\d+(?:\.\d+)?px)/);
  return m ? m[1] : '20px';
}

/** Build a DXTypeB font string matching the polygon's EN size. */
function deriveKoFont(enFont: string): string {
  return `${extractFontSize(enFont)} "DXTypeB", sans-serif`;
}

// ── Exhibit mode helpers ──

/** Split a string into [word, whitespace, word, whitespace, ...] parts. */
function splitWordParts(s: string): string[] {
  return s.split(/(\s+)/);
}

/** Count actual words (non-whitespace parts at even indices) in a split result. */
function countWords(parts: string[]): number {
  let count = 0;
  for (let i = 0; i < parts.length; i += 2) {
    if (parts[i].length > 0) count++;
  }
  return count;
}

/**
 * Build a word-level mapping from EN slots to KO substitutions.
 * - KO >= EN: concatenate grouped KO words into each EN slot (uses all KO, no loss)
 * - EN > KO: distribute KO uniquely across EN slots; surplus EN slots get null (never swap)
 * Guarantees no KO word repetition.
 */
function buildWordMapping(
  enCount: number,
  koWords: string[],
): (string | null)[] {
  const result: (string | null)[] = new Array(enCount).fill(null);
  const koCount = koWords.length;
  if (koCount === 0 || enCount === 0) return result;

  if (koCount >= enCount) {
    // Group KO words into EN slots
    for (let i = 0; i < enCount; i++) {
      const start = Math.floor((i * koCount) / enCount);
      const end = Math.max(start + 1, Math.floor(((i + 1) * koCount) / enCount));
      result[i] = koWords.slice(start, end).join(' ');
    }
  } else {
    // Distribute KO across EN slots with no repetition
    for (let k = 0; k < koCount; k++) {
      const enIdx = Math.floor((k * enCount) / koCount);
      result[enIdx] = koWords[k];
    }
  }
  return result;
}

/**
 * Mix EN and KO text at word level using a swap mask + pre-built mapping.
 * For each EN word i, if mask[i] && mapping[i] exists, substitute with mapping[i].
 */
function glitchMixText(
  enText: string,
  mapping: (string | null)[],
  mask: boolean[],
): string {
  const enParts = splitWordParts(enText);
  let wordIdx = 0;
  return enParts
    .map((part, i) => {
      if (i % 2 === 1) return part; // whitespace
      if (part.length === 0) return part;
      const ki = wordIdx;
      wordIdx++;
      if (!mask[ki]) return part;
      const ko = mapping[ki];
      return ko !== null ? ko : part;
    })
    .join('');
}

/**
 * Build sentence-level mapping: each EN sentence group maps to the
 * corresponding KO sentence. First word of group → full KO sentence,
 * remaining words → '' (suppressed). This way the entire KO sentence
 * renders from the first word's position with no EN/KO interleaving.
 */
function buildSentenceMapping(
  enText: string,
  koText: string | undefined,
): (string | null)[] {
  const enWordCount = countWords(splitWordParts(enText));
  const result: (string | null)[] = new Array(enWordCount).fill(null);
  if (!koText || enWordCount === 0) return result;

  const enGroups = computeWordGroups(enText);
  // Split KO by sentence-ending punctuation
  const koSentences = koText.split(/(?<=[.!?。])\s*/).filter(s => s.trim().length > 0);
  if (enGroups.length === 0 || koSentences.length === 0) return result;

  for (let gi = 0; gi < enGroups.length; gi++) {
    const group = enGroups[gi];
    if (group.length === 0) continue;

    let koForGroup: string;
    if (enGroups.length >= koSentences.length) {
      if (gi < koSentences.length) koForGroup = koSentences[gi];
      else continue;
    } else {
      // More KO sentences than EN groups — distribute proportionally
      const start = Math.floor((gi * koSentences.length) / enGroups.length);
      const end = Math.floor(((gi + 1) * koSentences.length) / enGroups.length);
      koForGroup = koSentences.slice(start, end).join(' ');
    }

    // First word → full KO sentence, rest → '' (suppress EN)
    result[group[0]] = koForGroup;
    for (let i = 1; i < group.length; i++) {
      result[group[i]] = '';
    }
  }
  return result;
}

/**
 * Split word indices into semantic groups based on sentence-ending punctuation.
 * Words within a group glitch together for readability.
 * Groups > 8 words are split into ~4-word chunks.
 */
function computeWordGroups(text: string): number[][] {
  const parts = splitWordParts(text);
  const groups: number[][] = [];
  let currentGroup: number[] = [];
  let wordIdx = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i % 2 === 0 && part.length > 0) {
      currentGroup.push(wordIdx);
      wordIdx++;
      // Sentence-ending punctuation → close this group
      if (/[.!?]\s*$/.test(part)) {
        groups.push(currentGroup);
        currentGroup = [];
      }
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup);

  // Cap oversized groups into ~4-word chunks
  const capped: number[][] = [];
  for (const g of groups) {
    if (g.length > 8) {
      for (let i = 0; i < g.length; i += 4) {
        capped.push(g.slice(i, Math.min(i + 4, g.length)));
      }
    } else {
      capped.push(g);
    }
  }
  return capped;
}

type ExhibitPhase = 'idle' | 'running' | 'settling' | 'inkBleed';

const EXHIBIT_CHAR_INTERVAL = 62;
const EXHIBIT_POLY_DELAY = 0;
/** Max concurrent polygon typings in exhibit mode — K-lane worker pool. */
const EXHIBIT_TYPING_LANES = 2;
/** Settle phase duration — glitch fades back to EN before ink bleed */
const EXHIBIT_SETTLE_DURATION = 2000;

// ── Flicker FSM: fluorescent-tube-style phased transitions per sentence ──
// Each sentence cycles: idle (EN) → ramp-in (fade EN→KO w/ jitter) → hold (KO, occasional blip) → ramp-out → idle.
/** FSM tick rate — 40ms ≈ 25fps, smooth enough for fade perception. */
const FLICKER_TICK_MS = 40;
/** Delay after typing completion before first transition. */
const FLICKER_INITIAL_DELAY_MIN = 1500;
const FLICKER_INITIAL_DELAY_MAX = 5000;
/** Dormant gap between consecutive transitions (EN is stable). */
const FLICKER_DORMANT_MIN = 4000;
const FLICKER_DORMANT_MAX = 9000;
/** Ramp-in (EN → KO) duration — fade with glitch jitter. */
const FLICKER_RAMP_IN_MIN = 300;
const FLICKER_RAMP_IN_MAX = 600;
/** Hold (full KO) duration — occasional blip drops. */
const FLICKER_HOLD_MIN = 400;
const FLICKER_HOLD_MAX = 1200;
/** Ramp-out (KO → EN) duration. */
const FLICKER_RAMP_OUT_MIN = 400;
const FLICKER_RAMP_OUT_MAX = 700;
/** Random per-tick alpha jitter magnitude during ramps (glitch feel). */
const FLICKER_JITTER = 0.18;
/** Probability per tick of a "blip" drop during hold phase (brief near-EN flash). */
const FLICKER_BLIP_PROB = 0.08;
/** Blip drop depth (alpha drops to this value briefly). */
const FLICKER_BLIP_DEPTH = 0.35;

/** Sort polygons by typingOrder (undefined ⇒ fallback to array index, appended). */
function computeTypingSequence(polygons: TextPolygon[]): TextPolygon[] {
  return polygons
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const oa = a.p.typingOrder ?? a.i + 10000;
      const ob = b.p.typingOrder ?? b.i + 10000;
      return oa - ob;
    })
    .map((x) => x.p);
}

const BASE = import.meta.env.BASE_URL;
const COLORS = ['#ff4444', '#4488ff', '#44bb44', '#ff8800', '#cc44cc', '#44cccc', '#ffcc00', '#ff66aa'];

let nextId = 100;

function makeNewPolygon(cx: number, cy: number): TextPolygon {
  const id = `box-${nextId++}`;
  const size = 0.12;
  return {
    id,
    vertices: [
      [cx - size, cy - size * 0.6],
      [cx + size, cy - size * 0.6],
      [cx + size, cy + size * 0.6],
      [cx - size, cy + size * 0.6],
    ],
    text: 'Type your text here.',
    textKo: '',
    font: '14px "Oceanside Typewriter", Georgia',
    lineHeight: 18,
    color: '#000',
    padding: 8,
  };
}

const STORAGE_KEY = 'pretext-demo-state';

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

type PretextDemoProps = {
  /** Game mode: auto-start exhibit, hide all editor UI */
  autoExhibit?: boolean;
};

export default function PretextDemo({ autoExhibit = false }: PretextDemoProps) {
  // Game mode: always use DEFAULT_POLYGONS (ignore editor's localStorage cache).
  const saved = useRef(autoExhibit ? null : loadSaved());

  const [config, setConfig] = useState<TypographyConfig>(
    saved.current?.config ?? { ...DEFAULT_CONFIG, showPolygonOutlines: false },
  );
  const [polygons, setPolygons] = useState<TextPolygon[]>(
    () => saved.current?.polygons ?? JSON.parse(JSON.stringify(DEFAULT_POLYGONS)),
  );
  const [bgAlpha, setBgAlpha] = useState(saved.current?.bgAlpha ?? 0.2);
  const [useBg, setUseBg] = useState(saved.current?.useBg ?? true);
  const [editMode, setEditMode] = useState(true);
  const [selectedPoly, setSelectedPoly] = useState<string | null>(null);
  const [expandedText, setExpandedText] = useState<string | null>(null);
  const [inkBleedActive, setInkBleedActive] = useState(false);
  const pretextCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Language + typewriter state ──
  const [cycle, setCycle] = useState(0);
  const [typingParams, setTypingParams] = useState<TypingParams>(
    saved.current?.typingParams ?? { ...DEFAULT_TYPING_PARAMS },
  );
  const [typingProg, setTypingProg] = useState<Record<string, number>>({});
  const [typingDone, setTypingDone] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const [typingEnabled, setTypingEnabled] = useState(
    saved.current?.typingEnabled ?? false,
  );

  // ── Exhibit mode state ──
  const [exhibitMode, setExhibitMode] = useState(false);
  const [exhibitPhase, setExhibitPhase] = useState<ExhibitPhase>('idle');
  // Per-sentence KO opacity 0~1 (replaces boolean masks — crossfade instead of hard swap).
  const [glitchAlphas, setGlitchAlphas] = useState<Record<string, number[]>>({});
  // Per-word glitch start time: { [polyId]: { [wordIdx]: startMs } } (legacy, kept for compat)
  const polyWordStartsRef = useRef<Record<string, Record<number, number>>>({});
  // Per-sentence flicker FSM state: { [polyId]: Array<FlickerState> }
  type FlickerPhase = 'idle' | 'ramp-in' | 'hold' | 'ramp-out';
  type FlickerState = {
    phase: FlickerPhase;
    phaseStart: number;
    phaseDuration: number;
    /** Scheduled time for idle → ramp-in transition. */
    nextEventAt: number;
    /** Current KO opacity 0~1. */
    alpha: number;
  };
  const sentenceFSMRef = useRef<Record<string, FlickerState[]>>({});
  // Mirror of alphas for cheap diff check inside tick (avoid redundant setState).
  const glitchAlphasRef = useRef<Record<string, number[]>>({});
  const settleStartRef = useRef<number>(0);

  // Refs so the typewriter / glitch loops read latest params and state
  const typingParamsRef = useRef(typingParams);
  typingParamsRef.current = typingParams;
  const typingProgRef = useRef(typingProg);
  typingProgRef.current = typingProg;
  const exhibitPhaseRef = useRef(exhibitPhase);
  exhibitPhaseRef.current = exhibitPhase;

  // 자동 저장 — 상태 변경 시 localStorage에 저장 (게임 모드는 스킵)
  useEffect(() => {
    if (autoExhibit) return;
    const state = { polygons, config, bgAlpha, useBg, typingParams, typingEnabled };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [autoExhibit, polygons, config, bgAlpha, useBg, typingParams, typingEnabled]);

  // ── Typewriter effect ──
  // Reruns when user clicks replay (playKey) or flips language (cycle) or toggles typing on.
  useEffect(() => {
    if (!typingEnabled) {
      // Typing disabled — show everything fully typed
      const full: Record<string, number> = {};
      for (const p of polygons) {
        full[p.id] = resolveText(p, cycle).length;
      }
      setTypingProg(full);
      setTypingDone(true);
      return;
    }

    let cancelled = false;
    const timers = new Set<number>();
    const schedule = (fn: () => void, ms: number): number => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (!cancelled) fn();
      }, ms);
      timers.add(id);
      return id;
    };

    // Snapshot flat queue at effect start — editing during typing won't disrupt flow.
    // Exhibit: K-lane worker pool pulls from queue head; editor: K=1 (linear).
    const queue = computeTypingSequence(polygons);
    const lanes = exhibitMode ? EXHIBIT_TYPING_LANES : 1;
    let queueIdx = 0;
    let activeLanes = 0;

    setTypingProg({});
    setTypingDone(false);

    const typePoly = (poly: TextPolygon, onDone: () => void) => {
      const text = resolveText(poly, cycle);
      if (text.length === 0) {
        onDone();
        return;
      }
      let charIdx = 0;
      const tick = () => {
        if (cancelled) return;
        charIdx++;
        setTypingProg((prev) => ({ ...prev, [poly.id]: charIdx }));
        if (charIdx < text.length) {
          schedule(tick, typingParamsRef.current.charInterval);
        } else {
          onDone();
        }
      };
      schedule(tick, typingParamsRef.current.charInterval);
    };

    const dispatchNext = () => {
      if (cancelled) return;
      while (activeLanes < lanes && queueIdx < queue.length) {
        const poly = queue[queueIdx++];
        activeLanes++;
        typePoly(poly, () => {
          if (cancelled) return;
          activeLanes--;
          if (queueIdx < queue.length) {
            schedule(dispatchNext, typingParamsRef.current.polyDelay);
          } else if (activeLanes === 0) {
            setTypingDone(true);
          }
        });
      }
    };

    schedule(dispatchNext, 200);
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey, cycle, typingEnabled]);

  // ── Rendered polygons — apply cycle language (+ overrides) + typing slice ──
  const renderedPolygons = useMemo(() => {
    // Exhibit mode: frozen EN layout — PretextTypography handles glitch via props
    if (exhibitMode) return polygons;

    // Normal mode: cycle + typing slice
    return polygons.map((p) => {
      const resolved = resolvePolygon(p, cycle);
      const full = resolved.text;
      const typed = typingEnabled
        ? (typingDone ? full.length : (typingProg[p.id] ?? 0))
        : full.length;
      return { ...resolved, text: full.slice(0, typed) };
    });
  }, [polygons, cycle, typingProg, typingDone, typingEnabled, exhibitMode, glitchAlphas]);

  // Precompute sentence-aware word mapping from sentenceMap
  // Each sentence's KO words are distributed across that sentence's EN word slots
  const sentenceWordInfo = useMemo(() => {
    const defaultSMap = new Map(DEFAULT_POLYGONS.map(dp => [dp.id, dp.sentenceMap]));
    const info: Record<string, {
      mapping: (string | null)[];
      sentenceWordRanges: [number, number][];
      totalWords: number;
    }> = {};

    for (const p of polygons) {
      const sMap = p.sentenceMap ?? defaultSMap.get(p.id) ?? [];
      const parts = splitWordParts(p.text);

      // Word char start positions
      const wordCharStarts: number[] = [];
      let ci = 0;
      for (let i = 0; i < parts.length; i++) {
        if (i % 2 === 0 && parts[i].length > 0) wordCharStarts.push(ci);
        ci += parts[i].length;
      }

      const totalWords = wordCharStarts.length;
      const mapping: (string | null)[] = new Array(totalWords).fill(null);
      const sentenceWordRanges: [number, number][] = [];

      for (const [enSent, koSent] of sMap) {
        const sentStart = p.text.indexOf(enSent);
        if (sentStart < 0) { sentenceWordRanges.push([-1, -1]); continue; }
        const sentEnd = sentStart + enSent.length;

        // Find word indices belonging to this sentence
        const wordsInSent: number[] = [];
        for (let wi = 0; wi < totalWords; wi++) {
          if (wordCharStarts[wi] >= sentStart && wordCharStarts[wi] < sentEnd) {
            wordsInSent.push(wi);
          }
        }
        sentenceWordRanges.push(
          wordsInSent.length > 0
            ? [wordsInSent[0], wordsInSent[wordsInSent.length - 1] + 1]
            : [-1, -1],
        );

        // Always full-sentence: first word → full KO, rest → '' (no overlap)
        // Polygon clip handles overflow for narrow polygons
        if (wordsInSent.length > 0 && koSent.length > 0) {
          mapping[wordsInSent[0]] = koSent;
          for (let i = 1; i < wordsInSent.length; i++) mapping[wordsInSent[i]] = '';
        }
      }
      info[p.id] = { mapping, sentenceWordRanges, totalWords };
    }
    return info;
  }, [polygons]);

  // Build GlitchSubstitution: per-sentence alpha → per-word alphas (broadcast within sentence).
  // Renderer crossfades EN↔KO based on alpha; mask retained for backward compat at α≥0.5.
  // shiftFactor is deterministic per (polyId, sentenceIdx) — no per-tick jumping.
  const hashShift = (key: string): number => {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < key.length; i++) {
      h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    }
    return ((h >>> 0) % 1000) / 1000;
  };
  const exhibitSubstitutions = useMemo(() => {
    if (!exhibitMode) return undefined;
    const subs: Record<string, GlitchSubstitution> = {};
    for (const p of polygons) {
      const wi = sentenceWordInfo[p.id];
      if (!wi) continue;
      const sentAlphas = glitchAlphas[p.id] ?? [];

      const wordAlphas = new Array(wi.totalWords).fill(0);
      const wordMask = new Array(wi.totalWords).fill(false);
      const shiftFactors = new Array(wi.totalWords).fill(0);
      for (let si = 0; si < sentAlphas.length; si++) {
        const a = sentAlphas[si] ?? 0;
        if (a <= 0) continue;
        const [start, end] = wi.sentenceWordRanges[si] ?? [-1, -1];
        if (start < 0) continue;
        for (let w = start; w < end; w++) {
          wordAlphas[w] = a;
          if (a >= 0.5) wordMask[w] = true;
        }
        shiftFactors[start] = hashShift(`${p.id}:${si}`);
      }
      subs[p.id] = { mask: wordMask, mapping: wi.mapping, shiftFactors, alphas: wordAlphas };
    }
    return subs;
  }, [exhibitMode, polygons, glitchAlphas, sentenceWordInfo]);

  // ── Typing order preview (for UI) ──
  const typingSequenceView = useMemo(() => computeTypingSequence(polygons), [polygons]);
  const totalTypingChars = useMemo(
    () => typingSequenceView.reduce((s, p) => s + resolveText(p, cycle).length, 0),
    [typingSequenceView, cycle],
  );
  const estimatedTypingMs =
    totalTypingChars * typingParams.charInterval +
    Math.max(0, typingSequenceView.length - 1) * typingParams.polyDelay;

  const replayTyping = useCallback(() => {
    setTypingProg({});
    setTypingDone(false);
    setPlayKey((k) => k + 1);
  }, []);

  const cycleLanguage = useCallback(() => {
    setCycle((c) => c + 1);
  }, []);

  // ── Exhibit mode handlers ──
  const enterExhibit = useCallback(() => {
    setExhibitMode(true);
    setExhibitPhase('running');
    setEditMode(false);
    setInkBleedActive(false);
    setCycle(0); // Force EN
    setGlitchAlphas({});
    glitchAlphasRef.current = {};
    polyWordStartsRef.current = {};
    sentenceFSMRef.current = {};
    setTypingParams({
      charInterval: EXHIBIT_CHAR_INTERVAL,
      polyDelay: EXHIBIT_POLY_DELAY,
    });
    setTypingEnabled(true);
    setTypingProg({});
    setTypingDone(false);
    setPlayKey((k) => k + 1);
  }, []);

  const [showCh5Overlay, setShowCh5Overlay] = useState(false);
  const { play: playSfx } = useSoundManager();

  // Ch.4 타이핑 — 10개 wav 각각 loop, 일정 간격으로 한 layer씩 추가 누적
  useEffect(() => {
    if (!autoExhibit || showCh5Overlay) return;
    const howls = Array.from({ length: TYPING_COUNT }, (_, i) =>
      new Howl({ src: [`${TYPING_BASE}${i + 1}.mp3`], preload: true, volume: 0.25, loop: true }),
    );
    let cancelled = false;
    const STAGGER_MS = 3000;
    const timers = howls.map((h, i) =>
      setTimeout(() => { if (!cancelled) h.play(); }, i * STAGGER_MS),
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      howls.forEach(h => { h.stop(); h.unload(); });
    };
  }, [autoExhibit, showCh5Overlay]);

  // Auto-exhibit: enter exhibit mode on mount (game mode)
  useEffect(() => {
    if (autoExhibit) {
      // Delay slightly to ensure fonts and canvas are ready
      const t = setTimeout(() => enterExhibit(), 500);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoExhibit]);


  const exitExhibit = useCallback(() => {
    setExhibitMode(false);
    setExhibitPhase('idle');
    setInkBleedActive(false);
    setShowCh5Overlay(false);
    setGlitchAlphas({});
    glitchAlphasRef.current = {};
    polyWordStartsRef.current = {};
    sentenceFSMRef.current = {};
    settleStartRef.current = 0;
  }, []);

  // Phase: running → settling (when all 14 polygons finish typing)
  useEffect(() => {
    if (exhibitMode && exhibitPhase === 'running' && typingDone) {
      settleStartRef.current = performance.now();
      setExhibitPhase('settling');
    }
  }, [exhibitMode, exhibitPhase, typingDone]);

  // Fluorescent-tube flicker FSM — per-sentence dormant ↔ burst cycle.
  // Each sentence stays EN most of the time; occasionally flickers 2~4 times rapidly, then back.
  // Phase 'settling': all masks forced to EN over EXHIBIT_SETTLE_DURATION, then → 'inkBleed'.
  useEffect(() => {
    if (!exhibitMode) return;

    const defaultMap = new Map(DEFAULT_POLYGONS.map(p => [p.id, p.sentenceMap]));
    const polySentenceEnds: Record<string, number[]> = {};
    for (const p of polygons) {
      const map = p.sentenceMap ?? defaultMap.get(p.id) ?? [];
      const ends: number[] = [];
      for (const [enSentence] of map) {
        const idx = p.text.indexOf(enSentence);
        ends.push(idx >= 0 ? idx + enSentence.length : p.text.length);
      }
      polySentenceEnds[p.id] = ends;
    }

    const rand = (min: number, max: number) => min + Math.random() * (max - min);
    const smoothstep = (t: number) => {
      const x = Math.max(0, Math.min(1, t));
      return x * x * (3 - 2 * x);
    };
    const alphasEqual = (
      a: Record<string, number[]>,
      b: Record<string, number[]>,
    ): boolean => {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) return false;
      for (const k of aKeys) {
        const av = a[k]; const bv = b[k];
        if (!bv || av.length !== bv.length) return false;
        // Quantize to 3 decimals for diff — avoids jitter-only renders
        for (let i = 0; i < av.length; i++) {
          if (Math.round(av[i] * 1000) !== Math.round(bv[i] * 1000)) return false;
        }
      }
      return true;
    };

    const tick = window.setInterval(() => {
      const now = performance.now();
      const phase = exhibitPhaseRef.current;
      if (phase === 'idle' || phase === 'inkBleed') return;

      // Settling: force all sentences to fade-to-EN, end phase when window elapses
      if (phase === 'settling') {
        const settleElapsed = now - settleStartRef.current;
        if (settleElapsed >= EXHIBIT_SETTLE_DURATION) {
          window.clearInterval(tick);
          glitchAlphasRef.current = {};
          setGlitchAlphas({});
          setExhibitPhase('inkBleed');
          return;
        }
        // Scale all current alphas down linearly over settle window
        const settleFade = 1 - Math.min(1, settleElapsed / EXHIBIT_SETTLE_DURATION);
        const prev = glitchAlphasRef.current;
        let changed = false;
        const scaled: Record<string, number[]> = {};
        for (const k in prev) {
          const arr = prev[k].map(v => v * settleFade);
          scaled[k] = arr;
          if (!changed) {
            for (let i = 0; i < arr.length; i++) {
              if (Math.round(arr[i] * 1000) !== Math.round(prev[k][i] * 1000)) { changed = true; break; }
            }
          }
        }
        if (changed) {
          glitchAlphasRef.current = scaled;
          setGlitchAlphas(scaled);
        }
        return;
      }

      const typedNow = typingProgRef.current;
      const fsm = sentenceFSMRef.current;
      const next: Record<string, number[]> = {};

      for (const p of polygons) {
        const sentenceEnds = polySentenceEnds[p.id] ?? [];
        const n = sentenceEnds.length;
        if (n === 0) continue;

        const typed = typedNow[p.id] ?? 0;
        if (!fsm[p.id]) fsm[p.id] = [];
        const polyFSM = fsm[p.id];
        const alphas = new Array<number>(n).fill(0);

        for (let si = 0; si < n; si++) {
          if (typed < sentenceEnds[si]) continue;

          // Lazy init on first reach — start in idle, scheduled for first ramp-in
          if (!polyFSM[si]) {
            polyFSM[si] = {
              phase: 'idle',
              phaseStart: now,
              phaseDuration: 0,
              nextEventAt: now + rand(FLICKER_INITIAL_DELAY_MIN, FLICKER_INITIAL_DELAY_MAX),
              alpha: 0,
            };
          }
          const state = polyFSM[si];

          // Phase transitions (with guard)
          let guard = 4;
          while (guard-- > 0) {
            if (state.phase === 'idle') {
              if (now < state.nextEventAt) break;
              state.phase = 'ramp-in';
              state.phaseStart = now;
              state.phaseDuration = rand(FLICKER_RAMP_IN_MIN, FLICKER_RAMP_IN_MAX);
              continue;
            }
            const elapsed = now - state.phaseStart;
            if (elapsed < state.phaseDuration) break;
            // Phase complete — advance
            if (state.phase === 'ramp-in') {
              state.phase = 'hold';
              state.phaseStart = now;
              state.phaseDuration = rand(FLICKER_HOLD_MIN, FLICKER_HOLD_MAX);
            } else if (state.phase === 'hold') {
              state.phase = 'ramp-out';
              state.phaseStart = now;
              state.phaseDuration = rand(FLICKER_RAMP_OUT_MIN, FLICKER_RAMP_OUT_MAX);
            } else if (state.phase === 'ramp-out') {
              state.phase = 'idle';
              state.phaseStart = now;
              state.phaseDuration = 0;
              state.nextEventAt = now + rand(FLICKER_DORMANT_MIN, FLICKER_DORMANT_MAX);
            }
          }

          // Compute alpha for current phase
          let a = 0;
          const t = state.phaseDuration > 0 ? (now - state.phaseStart) / state.phaseDuration : 0;
          if (state.phase === 'idle') {
            a = 0;
          } else if (state.phase === 'ramp-in') {
            a = smoothstep(t) + (Math.random() - 0.5) * FLICKER_JITTER;
          } else if (state.phase === 'hold') {
            a = 1;
            // Occasional blip — briefly drop near EN
            if (Math.random() < FLICKER_BLIP_PROB) a = FLICKER_BLIP_DEPTH;
          } else if (state.phase === 'ramp-out') {
            a = 1 - smoothstep(t) + (Math.random() - 0.5) * FLICKER_JITTER;
          }
          state.alpha = Math.max(0, Math.min(1, a));
          alphas[si] = state.alpha;
        }
        next[p.id] = alphas;
      }

      if (!alphasEqual(glitchAlphasRef.current, next)) {
        glitchAlphasRef.current = next;
        setGlitchAlphas(next);
      }
    }, FLICKER_TICK_MS);

    return () => window.clearInterval(tick);
  }, [exhibitMode, polygons]);

  // Phase: inkBleed — trigger the ink bleed overlay
  useEffect(() => {
    if (exhibitMode && exhibitPhase === 'inkBleed' && !inkBleedActive) {
      const canvas = wrapperRef.current?.querySelector('canvas');
      if (canvas) {
        pretextCanvasRef.current = canvas;
        setInkBleedActive(true);
      }
    }
  }, [exhibitMode, exhibitPhase, inkBleedActive]);

  // ESC to exit exhibit mode
  useEffect(() => {
    if (!exhibitMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitExhibit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exhibitMode, exitExhibit]);

  const updateTypingParam = useCallback(
    <K extends keyof TypingParams>(key: K, val: TypingParams[K]) => {
      setTypingParams((prev) => ({ ...prev, [key]: val }));
    },
    [],
  );

  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{
    polyIdx: number;
    vertIdx: number;       // -1 이면 폴리곤 전체 이동
    startPos?: [number, number]; // 폴리곤 이동 시 드래그 시작점
  } | null>(null);

  const update = useCallback(<K extends keyof TypographyConfig>(key: K, val: TypographyConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: val }));
  }, []);

  const toNormalized = useCallback((e: React.MouseEvent | MouseEvent): [number, number] | null => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return null;
    const canvas = wrapper.querySelector('canvas');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    return [Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y))];
  }, []);

  // 드래그
  useEffect(() => {
    if (!editMode) return;
    const onMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const pos = toNormalized(e);
      if (!pos) return;
      const { polyIdx, vertIdx, startPos } = dragging.current;

      // 폴리곤 전체 이동
      if (vertIdx === -1 && startPos) {
        const dx = pos[0] - startPos[0];
        const dy = pos[1] - startPos[1];
        dragging.current.startPos = pos;
        setPolygons(prev => {
          const next = JSON.parse(JSON.stringify(prev));
          for (const v of next[polyIdx].vertices) {
            v[0] = Math.round((v[0] + dx) * 1000) / 1000;
            v[1] = Math.round((v[1] + dy) * 1000) / 1000;
          }
          return next;
        });
        return;
      }

      // 꼭짓점 이동
      setPolygons(prev => {
        const next = JSON.parse(JSON.stringify(prev));
        next[polyIdx].vertices[vertIdx] = [
          Math.round(pos[0] * 1000) / 1000,
          Math.round(pos[1] * 1000) / 1000,
        ];
        return next;
      });
    };
    const onUp = () => { dragging.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [editMode, toNormalized]);

  // 더블클릭으로 새 폴리곤 추가
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    if (!editMode) return;
    const pos = toNormalized(e);
    if (!pos) return;
    const newPoly = makeNewPolygon(pos[0], pos[1]);
    setPolygons(prev => [...prev, newPoly]);
    setSelectedPoly(newPoly.id);
  }, [editMode, toNormalized]);

  // 폴리곤 삭제
  const deletePoly = useCallback((id: string) => {
    setPolygons(prev => prev.filter(p => p.id !== id));
    if (selectedPoly === id) setSelectedPoly(null);
  }, [selectedPoly]);

  // 폴리곤 복제
  const duplicatePoly = useCallback((id: string) => {
    setPolygons(prev => {
      const src = prev.find(p => p.id === id);
      if (!src) return prev;
      const dup: TextPolygon = {
        ...JSON.parse(JSON.stringify(src)),
        id: `${src.id}-copy-${nextId++}`,
        vertices: src.vertices.map(([x, y]) => [x + 0.03, y + 0.03] as [number, number]),
      };
      return [...prev, dup];
    });
  }, []);

  // 꼭짓점 추가 (선분 중점에)
  const addVertex = useCallback((polyIdx: number, afterVertIdx: number) => {
    setPolygons(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      const verts = next[polyIdx].vertices;
      const a = verts[afterVertIdx];
      const b = verts[(afterVertIdx + 1) % verts.length];
      const mid: [number, number] = [
        Math.round(((a[0] + b[0]) / 2) * 1000) / 1000,
        Math.round(((a[1] + b[1]) / 2) * 1000) / 1000,
      ];
      verts.splice(afterVertIdx + 1, 0, mid);
      return next;
    });
  }, []);

  // 꼭짓점 삭제
  const removeVertex = useCallback((polyIdx: number, vertIdx: number) => {
    setPolygons(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      if (next[polyIdx].vertices.length <= 3) return prev; // 최소 3개
      next[polyIdx].vertices.splice(vertIdx, 1);
      return next;
    });
  }, []);

  // 폴리곤 필드 업데이트 헬퍼
  const updatePoly = useCallback((idx: number, patch: Partial<TextPolygon>) => {
    setPolygons(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  // KO 오버라이드 필드 업데이트 — undefined/빈 값이면 해당 키 제거
  const updateKoOverride = useCallback(
    <K extends keyof KoOverride>(idx: number, key: K, val: KoOverride[K] | undefined) => {
      setPolygons(prev => {
        const next = [...prev];
        const curr = next[idx].koOverride ?? {};
        const updated: KoOverride = { ...curr };
        if (val === undefined || val === '' || (typeof val === 'number' && Number.isNaN(val))) {
          delete updated[key];
        } else {
          updated[key] = val;
        }
        const cleaned: KoOverride | undefined =
          Object.keys(updated).length === 0 ? undefined : updated;
        next[idx] = { ...next[idx], koOverride: cleaned };
        return next;
      });
    },
    [],
  );

  // Export
  const exportJSON = useCallback(() => {
    const json = JSON.stringify(polygons.map(p => ({
      id: p.id, vertices: p.vertices, text: p.text,
      ...(p.textKo && p.textKo.length > 0 ? { textKo: p.textKo } : {}),
      ...(p.koOverride && Object.keys(p.koOverride).length > 0 ? { koOverride: p.koOverride } : {}),
      ...(p.typingOrder !== undefined ? { typingOrder: p.typingOrder } : {}),
      font: p.font, lineHeight: p.lineHeight, color: p.color, padding: p.padding,
      ...(p.rotation !== undefined && p.rotation !== 0 ? { rotation: p.rotation } : {}),
      ...(p.rotationEnd !== undefined ? { rotationEnd: p.rotationEnd } : {}),
      ...(p.fanPivot !== undefined ? { fanPivot: p.fanPivot } : {}),
      ...(p.mode ? { mode: p.mode } : {}),
      ...(p.repeat ? { repeat: true } : {}),
    })), null, 2);
    navigator.clipboard.writeText(json);
    alert('Copied to clipboard!');
  }, [polygons]);

  return (
    <div style={{ display: 'flex', height: '100vh', background: exhibitMode ? '#fff' : '#f0f0f0' }}>
      {/* ── 좌측 패널 ── */}
      {!exhibitMode && <div style={{
        width: 310, padding: 12, background: '#1a1a1a', color: '#fff',
        display: 'flex', flexDirection: 'column', gap: 4, overflow: 'auto',
        fontFamily: 'monospace', fontSize: 11,
      }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Polygon Editor</h3>

        <button
          onClick={enterExhibit}
          style={{
            background: '#222', color: '#e8a030', border: '1px solid #e8a030',
            padding: '8px 12px', borderRadius: 3, cursor: 'pointer', fontSize: 12,
            fontWeight: 'bold', letterSpacing: 1, textTransform: 'uppercase',
            marginTop: 4,
          }}>
          ▶ Enter Exhibit
        </button>

        {/* 글로벌 컨트롤 */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={editMode} onChange={e => setEditMode(e.target.checked)} />
            <strong>Edit</strong>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={useBg} onChange={e => setUseBg(e.target.checked)} />
            BG
          </label>
        </div>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ width: 50 }}>alpha</span>
          <input type="range" min={0} max={0.6} step={0.02} value={bgAlpha}
            onChange={e => setBgAlpha(Number(e.target.value))} style={{ flex: 1 }} />
          <span style={{ width: 30 }}>{bgAlpha.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ width: 50 }}>Scale</span>
          <input type="range" min={0.25} max={2} step={0.05}
            value={config.canvasWidth / 1960}
            onChange={e => {
              const s = Number(e.target.value);
              setConfig(prev => ({ ...prev, canvasWidth: Math.round(1960 * s), canvasHeight: Math.round(1105 * s) }));
            }} style={{ flex: 1 }} />
          <span style={{ width: 55, fontSize: 9 }}>{config.canvasWidth}×{config.canvasHeight}</span>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '4px 0' }} />

        {/* ── Language + Typewriter ── */}
        <div style={{ fontSize: 10, color: '#888', marginBottom: 2 }}>Language / Typewriter</div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={cycleLanguage} style={{
            background: '#4a9eff', color: '#fff', border: 'none',
            padding: '4px 10px', borderRadius: 3, cursor: 'pointer', fontSize: 11,
          }}>
            cycle {cycle % 2 === 0 ? 'en→ko' : 'ko→en'}
          </button>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={typingEnabled}
              onChange={e => setTypingEnabled(e.target.checked)} />
            typing
          </label>
          <button onClick={replayTyping}
            disabled={!typingEnabled}
            style={{
              background: typingEnabled ? '#333' : '#222',
              color: typingEnabled ? '#ccc' : '#555',
              border: '1px solid #444',
              padding: '4px 10px', borderRadius: 3,
              cursor: typingEnabled ? 'pointer' : 'default', fontSize: 11,
            }}>
            replay
          </button>
        </div>

        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ width: 50, fontSize: 9 }}>ms/char</span>
          <input type="range" min={1} max={200} step={1} value={typingParams.charInterval}
            onChange={e => updateTypingParam('charInterval', Number(e.target.value))}
            style={{ flex: 1 }} />
          <span style={{ width: 30, fontSize: 9 }}>{typingParams.charInterval}</span>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ width: 50, fontSize: 9 }}>ms/poly</span>
          <input type="range" min={0} max={3000} step={50} value={typingParams.polyDelay}
            onChange={e => updateTypingParam('polyDelay', Number(e.target.value))}
            style={{ flex: 1 }} />
          <span style={{ width: 30, fontSize: 9 }}>{typingParams.polyDelay}</span>
        </div>
        <div style={{ fontSize: 9, color: '#666', marginBottom: 2 }}>
          {typingSequenceView.length} polys · {totalTypingChars} chars
          · est {(estimatedTypingMs / 1000).toFixed(1)}s
          {typingEnabled && !typingDone && (
            <span style={{ color: '#4a9eff' }}> · running</span>
          )}
          {typingEnabled && typingDone && (
            <span style={{ color: '#4a9' }}> · done</span>
          )}
        </div>

        {/* Sequence preview — clickable IDs jump to selection */}
        <details style={{ fontSize: 9 }}>
          <summary style={{ cursor: 'pointer', color: '#888' }}>
            sequence ({typingSequenceView.length})
          </summary>
          <ol style={{ margin: '4px 0 0 0', padding: '0 0 0 18px', color: '#999' }}>
            {typingSequenceView.map((p, i) => {
              const order = p.typingOrder ?? i;
              const charsNow = typingProg[p.id] ?? 0;
              const total = resolveText(p, cycle).length;
              return (
                <li key={p.id} style={{
                  cursor: 'pointer',
                  color: selectedPoly === p.id ? '#4a9eff' : undefined,
                }}
                  onClick={() => setSelectedPoly(p.id)}>
                  <span style={{ color: '#666' }}>#{order}</span>{' '}
                  {p.id}{' '}
                  <span style={{ color: '#555' }}>{charsNow}/{total}</span>
                </li>
              );
            })}
          </ol>
        </details>

        <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '4px 0' }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#888' }}>Polygons ({polygons.length})</span>
          <span style={{ fontSize: 9, color: '#555' }}>double-click canvas to add</span>
        </div>

        {/* ── 폴리곤 리스트 ── */}
        {polygons.map((p, pi) => {
          const color = COLORS[pi % COLORS.length];
          const isSel = selectedPoly === p.id;
          return (
            <div key={p.id} style={{
              padding: 6, borderRadius: 4,
              background: isSel ? '#2a2a2a' : 'transparent',
              borderLeft: `3px solid ${color}`,
            }}>
              {/* 헤더 */}
              <div
                onClick={() => setSelectedPoly(isSel ? null : p.id)}
                style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span style={{ fontWeight: 'bold', color }}>{p.id}</span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={e => { e.stopPropagation(); duplicatePoly(p.id); }}
                    title="Duplicate" style={btnSmall}>⧉</button>
                  <button onClick={e => { e.stopPropagation(); deletePoly(p.id); }}
                    title="Delete" style={{ ...btnSmall, color: '#ff6666' }}>✕</button>
                </div>
              </div>

              {/* 축소 시 미리보기 */}
              {!isSel && (
                <div style={{ color: '#666', fontSize: 9, marginTop: 2 }}>
                  {p.font} · {p.text.slice(0, 40)}…
                </div>
              )}

              {/* 확장 시 상세 편집 */}
              {isSel && (
                <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {/* ID + typing order */}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ width: 24, color: '#888' }}>id</span>
                    <input type="text" value={p.id}
                      onChange={e => updatePoly(pi, { id: e.target.value })}
                      style={inputStyle} />
                    <span style={{ color: '#888', fontSize: 9 }}>#</span>
                    <input type="number"
                      value={p.typingOrder ?? ''}
                      placeholder={String(pi)}
                      onChange={e => {
                        const v = e.target.value;
                        updatePoly(pi, { typingOrder: v === '' ? undefined : Number(v) });
                      }}
                      title="typing order (lower = earlier)"
                      style={{ ...inputStyle, width: 36, flex: 'none' }} />
                  </div>

                  {/* Font */}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ width: 24, color: '#888' }}>font</span>
                    <input type="text" value={p.font}
                      onChange={e => updatePoly(pi, { font: e.target.value })}
                      style={inputStyle} />
                  </div>

                  {/* lineHeight + padding + color */}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ color: '#888' }}>lh</span>
                    <input type="number" value={p.lineHeight} min={5} max={100} step={1}
                      onChange={e => updatePoly(pi, { lineHeight: Number(e.target.value) })}
                      style={{ ...inputStyle, width: 36 }} />
                    <span style={{ color: '#888' }}>pad</span>
                    <input type="number" value={p.padding ?? 0} min={0} max={60} step={1}
                      onChange={e => updatePoly(pi, { padding: Number(e.target.value) })}
                      style={{ ...inputStyle, width: 36 }} />
                    <input type="color" value={p.color}
                      onChange={e => updatePoly(pi, { color: e.target.value })}
                      style={{ width: 24, height: 20, border: 'none', padding: 0, cursor: 'pointer' }} />
                  </div>

                  {/* rotation + rotationEnd + mode */}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ color: '#888' }}>rot</span>
                    <input type="range" min={-90} max={90} step={1} value={p.rotation ?? 0}
                      onChange={e => updatePoly(pi, { rotation: Number(e.target.value) })}
                      style={{ flex: 1 }} />
                    <span style={{ width: 28, fontSize: 9 }}>{p.rotation ?? 0}°</span>
                    <select value={p.mode ?? 'fill'}
                      onChange={e => updatePoly(pi, { mode: e.target.value as 'fill' | 'outline' })}
                      style={{ background: '#222', color: '#fff', border: '1px solid #444', fontSize: 9, padding: 1 }}>
                      <option value="fill">fill</option>
                      <option value="outline">outline</option>
                    </select>
                  </div>
                  {/* rotationEnd — 방사형 (설정 시 rot→rotEnd로 보간) */}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#888' }}>
                      <input type="checkbox" checked={p.rotationEnd !== undefined}
                        onChange={e => updatePoly(pi, { rotationEnd: e.target.checked ? 0 : undefined })} />
                      fan
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 3, color: '#888' }}>
                      <input type="checkbox" checked={p.repeat ?? false}
                        onChange={e => updatePoly(pi, { repeat: e.target.checked || undefined })} />
                      repeat
                    </label>
                    {p.rotationEnd !== undefined && (<>
                      <span style={{ color: '#888', fontSize: 9 }}>spread</span>
                      <input type="range" min={-45} max={45} step={1} value={p.rotationEnd}
                        onChange={e => updatePoly(pi, { rotationEnd: Number(e.target.value) })}
                        style={{ flex: 1 }} />
                      <span style={{ width: 28, fontSize: 9 }}>{p.rotationEnd}°</span>
                      <span style={{ color: '#888' }}>piv</span>
                      <select value={p.fanPivot ?? 0}
                        onChange={e => updatePoly(pi, { fanPivot: Number(e.target.value) })}
                        style={{ background: '#222', color: '#fff', border: '1px solid #444', fontSize: 9, padding: 1, width: 36 }}>
                        {p.vertices.map((_, vi) => (
                          <option key={vi} value={vi}>v{vi}</option>
                        ))}
                      </select>
                    </>)}
                  </div>

                  {/* Text (en + ko) */}
                  <button onClick={() => setExpandedText(expandedText === p.id ? null : p.id)}
                    style={{ ...btnSmall, width: '100%', textAlign: 'left' }}>
                    {expandedText === p.id ? '▼ Close text' : '▶ Edit text (en/ko)'}
                  </button>
                  {expandedText === p.id && (
                    <>
                      <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>text (en)</div>
                      <textarea value={p.text} rows={4}
                        onChange={e => updatePoly(pi, { text: e.target.value })}
                        style={{ ...inputStyle, resize: 'vertical', width: '100%', minHeight: 50 }} />
                      <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>textKo (한국어)</div>
                      <textarea value={p.textKo ?? ''} rows={4}
                        placeholder="(fallback: en)"
                        onChange={e => updatePoly(pi, { textKo: e.target.value })}
                        style={{ ...inputStyle, resize: 'vertical', width: '100%', minHeight: 50 }} />

                      {/* KO layout overrides */}
                      <div style={{ fontSize: 9, color: '#888', marginTop: 6, marginBottom: 2 }}>
                        KO layout overrides <span style={{ color: '#555' }}>(blank = use en)</span>
                      </div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={{ width: 24, color: '#888' }}>font</span>
                        <input type="text"
                          value={p.koOverride?.font ?? ''}
                          placeholder={p.font}
                          onChange={e => updateKoOverride(pi, 'font', e.target.value || undefined)}
                          style={inputStyle} />
                      </div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={{ color: '#888' }}>lh</span>
                        <input type="number"
                          value={p.koOverride?.lineHeight ?? ''}
                          placeholder={String(p.lineHeight)}
                          onChange={e => updateKoOverride(pi, 'lineHeight',
                            e.target.value === '' ? undefined : Number(e.target.value))}
                          style={{ ...inputStyle, width: 36, flex: 'none' }} />
                        <span style={{ color: '#888' }}>pad</span>
                        <input type="number"
                          value={p.koOverride?.padding ?? ''}
                          placeholder={String(p.padding ?? 0)}
                          onChange={e => updateKoOverride(pi, 'padding',
                            e.target.value === '' ? undefined : Number(e.target.value))}
                          style={{ ...inputStyle, width: 36, flex: 'none' }} />
                        <span style={{ color: '#888' }}>rot</span>
                        <input type="number"
                          value={p.koOverride?.rotation ?? ''}
                          placeholder={String(p.rotation ?? 0)}
                          onChange={e => updateKoOverride(pi, 'rotation',
                            e.target.value === '' ? undefined : Number(e.target.value))}
                          style={{ ...inputStyle, width: 42, flex: 'none' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        <span style={{ color: '#888', width: 24 }}>rotE</span>
                        <input type="number"
                          value={p.koOverride?.rotationEnd ?? ''}
                          placeholder={p.rotationEnd !== undefined ? String(p.rotationEnd) : '—'}
                          onChange={e => updateKoOverride(pi, 'rotationEnd',
                            e.target.value === '' ? undefined : Number(e.target.value))}
                          style={{ ...inputStyle, width: 42, flex: 'none' }} />
                        <span style={{ color: '#888' }}>piv</span>
                        <input type="number"
                          value={p.koOverride?.fanPivot ?? ''}
                          placeholder={p.fanPivot !== undefined ? String(p.fanPivot) : '—'}
                          onChange={e => updateKoOverride(pi, 'fanPivot',
                            e.target.value === '' ? undefined : Number(e.target.value))}
                          style={{ ...inputStyle, width: 32, flex: 'none' }} />
                        <span style={{ color: '#888' }}>mode</span>
                        <select
                          value={p.koOverride?.mode ?? ''}
                          onChange={e => updateKoOverride(pi, 'mode',
                            (e.target.value || undefined) as 'fill' | 'outline' | undefined)}
                          style={{ background: '#222', color: '#fff', border: '1px solid #444', fontSize: 9, padding: 1 }}>
                          <option value="">(en)</option>
                          <option value="fill">fill</option>
                          <option value="outline">outline</option>
                        </select>
                      </div>
                    </>
                  )}

                  {/* Vertices */}
                  <div style={{ fontSize: 9, color: '#888', marginTop: 2 }}>
                    Vertices ({p.vertices.length}):
                  </div>
                  {p.vertices.map((v, vi) => (
                    <div key={vi} style={{ display: 'flex', gap: 3, alignItems: 'center', fontSize: 9 }}>
                      <span style={{ color, width: 14 }}>v{vi}</span>
                      <span style={{ color: '#666' }}>[{v[0]}, {v[1]}]</span>
                      <button onClick={() => addVertex(pi, vi)}
                        title="Add vertex after this" style={{ ...btnTiny, color: '#4a9eff' }}>+</button>
                      {p.vertices.length > 3 && (
                        <button onClick={() => removeVertex(pi, vi)}
                          title="Remove vertex" style={{ ...btnTiny, color: '#ff6666' }}>-</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <hr style={{ border: 'none', borderTop: '1px solid #333', margin: '4px 0' }} />

        <button
          onClick={() => {
            setPolygons(prev => prev.map(p => ({
              ...p,
              koOverride: {
                ...(p.koOverride ?? {}),
                font: deriveKoFont(p.font),
              },
            })));
          }}
          style={{ background: '#4a4', color: '#fff', border: 'none', padding: 6, borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
          Apply DXTypeB to all KO
        </button>
        <button onClick={exportJSON}
          style={{ background: '#4a9eff', color: '#fff', border: 'none', padding: 6, borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
          Export JSON (clipboard)
        </button>
        <button onClick={() => {
          localStorage.removeItem(STORAGE_KEY);
          setPolygons(JSON.parse(JSON.stringify(DEFAULT_POLYGONS)));
          setConfig({ ...DEFAULT_CONFIG, showPolygonOutlines: false });
          setBgAlpha(0.2); setUseBg(true);
          setSelectedPoly(null);
        }}
          style={{ background: '#333', color: '#fff', border: 'none', padding: 6, borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
          Reset to Default
        </button>
        <button onClick={() => { setPolygons([]); setSelectedPoly(null); }}
          style={{ background: '#333', color: '#888', border: 'none', padding: 6, borderRadius: 3, cursor: 'pointer', fontSize: 11 }}>
          Clear All
        </button>
      </div>}

      {/* ── 캔버스 + 오버레이 ── */}
      <div ref={wrapperRef} style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'auto', padding: exhibitMode ? 0 : 20,
        background: exhibitMode ? '#fff' : '#e8e8e8',
      }}>
        <div
          style={{ position: 'relative', display: 'inline-block' }}
          onDoubleClick={exhibitMode ? undefined : handleDoubleClick}
        >
          <PretextTypography
            backgroundSrc={useBg && !exhibitMode ? `${BASE}assets/ch4/outline.png` : undefined}
            backgroundAlpha={bgAlpha}
            polygons={renderedPolygons}
            config={config}
            typingProgress={exhibitMode ? typingProg : undefined}
            glitchSubstitutions={exhibitSubstitutions}
            svgOpacity={exhibitPhase === 'inkBleed' ? 0 : 1}
            style={{
              boxShadow: exhibitMode ? 'none' : '0 4px 20px rgba(0,0,0,0.15)',
              display: 'block',
            }}
          />

          {/* SVG 핸들 오버레이 — 3레이어: fill → outlines → handles */}
          {!exhibitMode && editMode && (
            <svg style={{
              position: 'absolute', inset: 0, width: '100%', height: '100%',
              pointerEvents: 'none',
            }}
            viewBox={`0 0 ${config.canvasWidth} ${config.canvasHeight}`}>

              {/* Layer 1: 폴리곤 fill (선택용, 맨 아래) */}
              <g>
                {polygons.map((poly, pi) => {
                  const color = COLORS[pi % COLORS.length];
                  const isSel = selectedPoly === poly.id;
                  return (
                    <polygon key={`fill-${poly.id}`}
                      points={poly.vertices.map(([x, y]) =>
                        `${x * config.canvasWidth},${y * config.canvasHeight}`
                      ).join(' ')}
                      fill={isSel ? `${color}10` : 'none'}
                      stroke={color}
                      strokeWidth={isSel ? 2 : 1}
                      strokeDasharray={isSel ? 'none' : '4 2'}
                      opacity={isSel ? 0.8 : 0.35}
                      style={{ pointerEvents: 'all', cursor: isSel ? 'move' : 'pointer' }}
                      onClick={() => setSelectedPoly(poly.id)}
                      onMouseDown={e => {
                        if (!isSel) return; // 선택 안 된 상태면 클릭=선택만
                        e.preventDefault(); e.stopPropagation();
                        const pos = toNormalized(e);
                        if (pos) {
                          dragging.current = { polyIdx: pi, vertIdx: -1, startPos: pos };
                        }
                      }}
                    />
                  );
                })}
              </g>

              {/* Layer 2: 라벨 */}
              <g style={{ pointerEvents: 'none' }}>
                {polygons.map((poly, pi) => {
                  const color = COLORS[pi % COLORS.length];
                  if (selectedPoly !== poly.id) return null;
                  return (
                    <text key={`label-${poly.id}`}
                      x={poly.vertices[0][0] * config.canvasWidth + 8}
                      y={poly.vertices[0][1] * config.canvasHeight - 6}
                      fill={color} fontSize={10} fontFamily="monospace"
                    >
                      {poly.id}
                    </text>
                  );
                })}
              </g>

              {/* Layer 3: 꼭짓점 핸들 (맨 위 — 항상 클릭/드래그 가능) */}
              <g>
                {/* 비선택 폴리곤 핸들 먼저 */}
                {polygons.map((poly, pi) => {
                  if (selectedPoly === poly.id) return null;
                  const color = COLORS[pi % COLORS.length];
                  return poly.vertices.map(([x, y], vi) => (
                    <circle key={`h-${poly.id}-${vi}`}
                      cx={x * config.canvasWidth} cy={y * config.canvasHeight}
                      r={4} fill={color} stroke="#fff" strokeWidth={1}
                      opacity={0.5}
                      style={{ pointerEvents: 'all', cursor: 'grab' }}
                      onMouseDown={e => {
                        e.preventDefault(); e.stopPropagation();
                        dragging.current = { polyIdx: pi, vertIdx: vi };
                        setSelectedPoly(poly.id);
                      }}
                    >
                      <title>{poly.id} v{vi} [{x}, {y}]</title>
                    </circle>
                  ));
                })}
                {/* 선택된 폴리곤 핸들 (맨 위) + 라벨 */}
                {polygons.map((poly, pi) => {
                  if (selectedPoly !== poly.id) return null;
                  const color = COLORS[pi % COLORS.length];
                  return poly.vertices.map(([x, y], vi) => (
                    <g key={`hs-${poly.id}-${vi}`}>
                      <circle
                        cx={x * config.canvasWidth} cy={y * config.canvasHeight}
                        r={7} fill={color} stroke="#fff" strokeWidth={2}
                        opacity={1}
                        style={{ pointerEvents: 'all', cursor: 'grab' }}
                        onMouseDown={e => {
                          e.preventDefault(); e.stopPropagation();
                          dragging.current = { polyIdx: pi, vertIdx: vi };
                        }}
                      >
                        <title>v{vi} [{x}, {y}]</title>
                      </circle>
                      <text
                        x={x * config.canvasWidth + 10}
                        y={y * config.canvasHeight - 2}
                        fill={color} fontSize={11} fontFamily="monospace" fontWeight="bold"
                        style={{ pointerEvents: 'none' }}
                      >
                        v{vi}
                      </text>
                    </g>
                  ));
                })}
              </g>

            </svg>
          )}

          {/* Ink Bleed overlay */}
          {inkBleedActive && pretextCanvasRef.current && (
            <InkBleed
              sourceCanvas={pretextCanvasRef.current}
              onStop={() => setInkBleedActive(false)}
              onRampComplete={() => {
                if (exhibitMode) {
                  // CH.5 진입: CH.4 ending BGM 정지 + boot 사운드
                  stopAllMusic();
                  playSfx('boot_sound');
                  setShowCh5Overlay(true);
                }
              }}
              hideTuning={exhibitMode}
              fullscreen={exhibitMode}
            />
          )}

          {/* CH.5 overlay — mounts after ink bleed ramp completes */}
          {showCh5Overlay && <Ch5Screen overlayMode />}

          {/* Ink Bleed run button — 일반 모드에서만 */}
          {!exhibitMode && !inkBleedActive && (
            <button
              onClick={() => {
                const canvas = wrapperRef.current?.querySelector('canvas');
                if (canvas) {
                  pretextCanvasRef.current = canvas;
                  setInkBleedActive(true);
                }
              }}
              style={{
                position: 'absolute',
                bottom: 12,
                right: 12,
                zIndex: 5,
                padding: '6px 16px',
                background: '#e8a030',
                color: '#000',
                border: 'none',
                borderRadius: 3,
                fontFamily: "'Courier New', monospace",
                fontSize: 11,
                fontWeight: 'bold',
                cursor: 'pointer',
                letterSpacing: 1,
              }}
            >
              ink bleed
            </button>
          )}
        </div>
      </div>

      {/* ── Exhibit exit + phase indicator (hidden in game mode) ── */}
      {exhibitMode && !autoExhibit && (
        <>
          <button
            onClick={exitExhibit}
            style={{
              position: 'fixed', top: 16, right: 16, zIndex: 1000,
              padding: '6px 14px',
              background: 'rgba(0,0,0,0.6)',
              color: '#fff',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: 3,
              fontFamily: 'monospace',
              fontSize: 11,
              cursor: 'pointer',
              letterSpacing: 1,
            }}
          >
            exit (esc)
          </button>
          <div
            style={{
              position: 'fixed', top: 16, left: 16, zIndex: 1000,
              padding: '4px 10px',
              background: 'rgba(0,0,0,0.4)',
              color: '#888',
              fontFamily: 'monospace',
              fontSize: 10,
              letterSpacing: 1,
              textTransform: 'uppercase',
              borderRadius: 2,
            }}
          >
            exhibit · {exhibitPhase}
          </div>
        </>
      )}
    </div>
  );
}

// ── 스타일 상수 ──

const inputStyle: React.CSSProperties = {
  background: '#222', color: '#fff', border: '1px solid #444',
  padding: '2px 4px', fontSize: 10, flex: 1, borderRadius: 2,
};

const btnSmall: React.CSSProperties = {
  background: '#333', color: '#ccc', border: 'none',
  padding: '2px 6px', fontSize: 10, cursor: 'pointer', borderRadius: 2,
};

const btnTiny: React.CSSProperties = {
  background: 'none', border: 'none', padding: '0 3px',
  fontSize: 11, cursor: 'pointer',
};
