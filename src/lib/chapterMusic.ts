import { Howl } from 'howler';
import type { Chapter } from '@/store/useGameStore';

const BASE = `${import.meta.env.BASE_URL ?? '/'}assets/audio/bgm/`;

const CHAPTER_BGM: Partial<Record<Chapter, string>> = {
  START: `${BASE}intro.mp3`,
  // INTRO + CH.1 동안 ch1.mp3 — 영상에서 챕터 본편으로 같은 트랙 이어짐
  INTRO: `${BASE}ch1.mp3`,
  CH1: `${BASE}ch1.mp3`,
  CH2: `${BASE}ch2.mp3`,
  CH3: `${BASE}ch3-map.mp3`,
  CH4: `${BASE}ending.mp3`,
  // CH5: omitted — silence on entry (CH.4 ending fades out)
  END: `${BASE}ending.mp3`,
};

const ELEVATOR_SRC = `${BASE}ch3-elevator.mp3`;

const FADE_MS = 1500;
const ELEVATOR_FADE_MS = 800;
const TARGET_VOLUME = 0.6;

const cache: Record<string, Howl> = {};
let currentTrack: Howl | null = null;
let currentSrc: string | null = null;
let chapterTrackBeforeElevator: Howl | null = null;
let chapterSrcBeforeElevator: string | null = null;

function getOrCreate(src: string): Howl {
  if (!cache[src]) {
    cache[src] = new Howl({
      src: [src],
      loop: true,
      volume: 0,
      html5: true,
      preload: true,
    });
  }
  return cache[src];
}

function fadeOutAndStop(track: Howl, fadeMs = FADE_MS) {
  const from = (track.volume() as number) || 0;
  track.fade(from, 0, fadeMs);
  setTimeout(() => track.stop(), fadeMs);
}

function fadeIn(track: Howl, fadeMs = FADE_MS, target = TARGET_VOLUME) {
  track.volume(0);
  track.play();
  track.fade(0, target, fadeMs);
}

export function playChapterMusic(chapter: Chapter) {
  const newSrc = CHAPTER_BGM[chapter] ?? null;
  if (newSrc === currentSrc && currentTrack?.playing()) return;

  if (currentTrack) fadeOutAndStop(currentTrack);

  if (newSrc) {
    const next = getOrCreate(newSrc);
    fadeIn(next);
    currentTrack = next;
    currentSrc = newSrc;
  } else {
    currentTrack = null;
    currentSrc = null;
  }
}

export function startElevatorMusic() {
  chapterTrackBeforeElevator = currentTrack;
  chapterSrcBeforeElevator = currentSrc;
  if (currentTrack) fadeOutAndStop(currentTrack, ELEVATOR_FADE_MS);
  const elevator = getOrCreate(ELEVATOR_SRC);
  fadeIn(elevator, ELEVATOR_FADE_MS);
  currentTrack = elevator;
  currentSrc = ELEVATOR_SRC;
}

export function endElevatorMusic() {
  // Force-stop elevator immediately to avoid lingering fades stomping the restore
  if (currentTrack) {
    currentTrack.stop();
  }
  currentTrack = null;
  currentSrc = null;

  const restoreSrc = chapterSrcBeforeElevator;
  chapterTrackBeforeElevator = null;
  chapterSrcBeforeElevator = null;

  if (restoreSrc) {
    const restored = getOrCreate(restoreSrc);
    fadeIn(restored, ELEVATOR_FADE_MS);
    currentTrack = restored;
    currentSrc = restoreSrc;
  }
}

export function stopAllMusic() {
  if (currentTrack) fadeOutAndStop(currentTrack);
  currentTrack = null;
  currentSrc = null;
}
