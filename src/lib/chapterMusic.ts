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

// INTRO + CH.1 음악은 한 번만 재생하고 끝 (영상 길이에 맞춰 들어가는 트랙)
const NO_LOOP_TRACKS = new Set<string>([`${BASE}ch1.mp3`]);

const ELEVATOR_SRC = `${BASE}ch3-elevator.mp3`;

const FADE_MS = 1500;
const ELEVATOR_FADE_MS = 1500;
const TARGET_VOLUME = 0.95;

const cache: Record<string, Howl> = {};
let currentTrack: Howl | null = null;
let currentSrc: string | null = null;
let chapterTrackBeforeElevator: Howl | null = null;
let chapterSrcBeforeElevator: string | null = null;

function getOrCreate(src: string): Howl {
  if (!cache[src]) {
    cache[src] = new Howl({
      src: [src],
      loop: !NO_LOOP_TRACKS.has(src),
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

// 현재 챕터 BGM의 재생 위치(초) — 영상 등 외부 미디어를 오디오 클럭에 동기할 때 사용.
export function getChapterMusicSeek(): number | null {
  if (!currentTrack) return null;
  const s = currentTrack.seek();
  return typeof s === 'number' ? s : null;
}

// 메인 챕터 BGM 정지 (복원 없음) — 빈 네모 finale 등에서 bgm만 끄고 sfx는 유지할 때
export function stopChapterMusic() {
  if (currentTrack) fadeOutAndStop(currentTrack);
  currentTrack = null;
  currentSrc = null;
}

// 엘베 진입 시: 챕터 BGM 페이드아웃 + 저장만 (음악은 시작 안 함 — 엘베 안에선 엘베 SFX만)
export function suspendChapterMusic() {
  chapterTrackBeforeElevator = currentTrack;
  chapterSrcBeforeElevator = currentSrc;
  if (currentTrack) fadeOutAndStop(currentTrack, ELEVATOR_FADE_MS);
  currentTrack = null;
  currentSrc = null;
}

// 우주씬 진입 시 호출 — 코스믹 BGM 시작 (챕터 저장은 suspendChapterMusic이 이미 함)
export function startElevatorMusic() {
  const elevator = getOrCreate(ELEVATOR_SRC);
  fadeIn(elevator, ELEVATOR_FADE_MS);
  currentTrack = elevator;
  currentSrc = ELEVATOR_SRC;
}

export function endElevatorMusic() {
  // Cross-fade: 엘베 트랙 fade out + 챕터 BGM fade in (자연스러운 음악 페이드)
  const elevatorTrack = currentTrack;
  if (elevatorTrack) {
    fadeOutAndStop(elevatorTrack, ELEVATOR_FADE_MS);
  }
  currentTrack = null;
  currentSrc = null;

  const restoreSrc = chapterSrcBeforeElevator;
  chapterTrackBeforeElevator = null;
  chapterSrcBeforeElevator = null;

  if (restoreSrc) {
    // 기존 cache 인스턴스가 stop 후 stale 상태일 수 있어 unload 후 새로 생성
    cache[restoreSrc]?.unload();
    delete cache[restoreSrc];
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
