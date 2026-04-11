/**
 * PretextTypography — 폴리곤 기반 건축적 텍스트 레이아웃
 *
 * 건물 벽면을 폴리곤으로 정의하고, 각 폴리곤 안에서
 * Pretext의 layoutNextLineRange로 행마다 가변 폭 텍스트를 리플로우.
 *
 * 파이프라인:
 * 1. 벽면 폴리곤 정의 (꼭짓점 배열, 정규화 좌표 0~1)
 * 2. 각 행(y좌표)에서 폴리곤 경계의 좌/우 교점 계산
 * 3. Pretext prepareWithSegments → layoutNextLineRange(가변 폭)
 * 4. Canvas에 렌더링 — 배경 이미지 위에 텍스트 오버레이
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  prepareWithSegments,
  layoutNextLineRange,
  materializeLineRange,
  type PreparedTextWithSegments,
  type LayoutCursor,
} from '@chenglou/pretext';

// ── 폴리곤 영역 정의 ──

/**
 * 한국어 전용 레이아웃 오버라이드 — KO 모드일 때 폴리곤 기본값 위에 덮어씀.
 * 한글은 글자 폭/행 높이 메트릭스가 영어와 달라 별개 조정이 필요할 때 사용.
 */
export type KoOverride = {
  font?: string;
  lineHeight?: number;
  padding?: number;
  rotation?: number;
  rotationEnd?: number;
  fanPivot?: number;
  mode?: 'fill' | 'outline';
  color?: string;
};

/** 꼭짓점은 정규화 좌표 (0~1). 시계 방향 또는 반시계 방향. */
export type TextPolygon = {
  /** 고유 ID */
  id: string;
  /** 꼭짓점 배열 [[x, y], ...] — 정규화 좌표 (0~1) */
  vertices: [number, number][];
  /** 텍스트 내용 (영어/기본) */
  text: string;
  /** 한국어 텍스트 (선택, 없으면 text로 폴백) */
  textKo?: string;
  /** 한국어 전용 타이포 오버라이드 (선택). 지정된 필드만 KO 모드에서 덮어씀. */
  koOverride?: KoOverride;
  /** 타이핑 순서 (작은 값이 먼저). 없으면 배열 인덱스 사용 */
  typingOrder?: number;
  /** CSS font 문자열 */
  font: string;
  /** 줄 높이 (캔버스 px) */
  lineHeight: number;
  /** 텍스트 색상 */
  color: string;
  /** 좌우 내부 패딩 (캔버스 px) */
  padding?: number;
  /** 텍스트 정렬 */
  align?: 'left' | 'center' | 'right';
  /** 렌더링 모드: 'fill'(기본)=내부 채움, 'outline'=외곽선 따라 텍스트 */
  mode?: 'fill' | 'outline';
  /** 텍스트 기울기 (도, degree). 0=수평, 양수=시계방향 */
  rotation?: number;
  /** 방사형: 설정 시 rotation 대신 위→아래로 각도가 선형 보간 (도) */
  rotationEnd?: number;
  /** 방사형 고정축: 꼭짓점 인덱스. 이 점을 중심으로 텍스트가 회전 */
  fanPivot?: number;
  /** 텍스트 반복: true면 텍스트 끝나도 처음부터 다시 채움 */
  repeat?: boolean;
};

// ── 폴리곤 ↔ 스캔라인 교차 계산 ──

/**
 * 수평선 y와 폴리곤의 교점 x좌표들을 구해서
 * 가장 왼쪽과 가장 오른쪽을 반환.
 */
function getPolygonSpanAtY(
  vertices: [number, number][],
  y: number,
  canvasW: number,
  canvasH: number,
): { left: number; right: number } | null {
  const intersections: number[] = [];
  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const [x1, y1] = vertices[i];
    const [x2, y2] = vertices[(i + 1) % n];

    // 캔버스 좌표로 변환
    const ay = y1 * canvasH;
    const by = y2 * canvasH;

    // 이 변이 y를 가로지르는지 확인
    if ((ay <= y && by > y) || (by <= y && ay > y)) {
      const t = (y - ay) / (by - ay);
      const ix = (x1 + t * (x2 - x1)) * canvasW;
      intersections.push(ix);
    }
  }

  if (intersections.length < 2) return null;

  intersections.sort((a, b) => a - b);
  return {
    left: intersections[0],
    right: intersections[intersections.length - 1],
  };
}

/**
 * 폴리곤의 y범위(최소~최대) 반환 (캔버스 좌표)
 */
function getPolygonYRange(vertices: [number, number][], canvasH: number): { top: number; bottom: number } {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of vertices) {
    const cy = y * canvasH;
    if (cy < minY) minY = cy;
    if (cy > maxY) maxY = cy;
  }
  return { top: minY, bottom: maxY };
}

// ── Outline 모드: 폴리곤 외곽선을 따라 텍스트 렌더링 ──

function renderOutlineText(
  ctx: CanvasRenderingContext2D,
  poly: TextPolygon,
  cw: number,
  ch: number,
) {
  const verts = poly.vertices;
  const n = verts.length;

  // 1. 폴리곤 둘레 선분 구축 (캔버스 좌표)
  type Seg = { x1: number; y1: number; x2: number; y2: number; len: number; angle: number };
  const segs: Seg[] = [];
  let totalLen = 0;

  for (let i = 0; i < n; i++) {
    const [ax, ay] = verts[i];
    const [bx, by] = verts[(i + 1) % n];
    const x1 = ax * cw, y1 = ay * ch;
    const x2 = bx * cw, y2 = by * ch;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    segs.push({ x1, y1, x2, y2, len, angle: Math.atan2(dy, dx) });
    totalLen += len;
  }

  // 2. 텍스트를 둘레를 따라 배치 — 텍스트 반복으로 전체 둘레 채움
  ctx.save();
  ctx.font = poly.font;
  ctx.fillStyle = poly.color;
  ctx.textBaseline = 'middle';

  const text = poly.text;
  let textIdx = 0;

  let si = 0;
  let offset = 0;
  let traveled = 0;

  while (traveled < totalLen) {
    if (si >= segs.length) break;
    // 텍스트 끝나면 멈춤 (반복 안 함)
    if (textIdx >= text.length) break;

    const ch_ = text[textIdx];
    textIdx++;

    const charW = ctx.measureText(ch_).width;
    if (charW <= 0) continue;

    // 현재 위치 (선분 내 offset + charW/2 지점)
    let drawOffset = offset + charW / 2;

    // 선분 끝을 넘으면 다음 선분으로
    while (si < segs.length && drawOffset > segs[si].len) {
      drawOffset -= segs[si].len;
      offset = 0;
      si++;
    }
    if (si >= segs.length) break;

    const s = segs[si];
    const t = Math.min(drawOffset / s.len, 1);
    const px = s.x1 + (s.x2 - s.x1) * t;
    const py = s.y1 + (s.y2 - s.y1) * t;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(s.angle);
    ctx.fillText(ch_, 0, 0);
    ctx.restore();

    // 전진
    const advance = charW + 0.3;
    offset = drawOffset - charW / 2 + advance;
    traveled += advance;

    // offset이 현재 선분을 넘으면 다음으로
    while (si < segs.length && offset >= segs[si].len) {
      offset -= segs[si].len;
      si++;
    }
  }

  ctx.restore();
}

// ── CH.4 사과문 — 건물 벽면 폴리곤 ──

const DEFAULT_POLYGONS: TextPolygon[] = [
  { id: 'roofline', vertices: [[0.904,0.232],[0.723,0.006],[0.675,0.005],[0.356,0.182],[0.339,0.627],[0.676,0.635],[0.911,0.669]],
    text: "I want to build a madman's world out of matter. A sealed world. A room packed with delusion. It will not be understood, but its density will do the work of persuading. Or perhaps it has always been this way, perhaps every room I have ever made was a room like this. ",
    textKo: '미친 사람의 세계를 물질적으로 재현하고 싶다. 닫힌 우주. 방 안에 포진된 망상. 그것은 납득되지 않을 것이지만 그 밀도는 설득적일 것이다. 아니 언제나 그래왔을지도 모른다. 내가 만들어온 것들에 대해서 생각해보면, 나는 그때도 미쳐있었다. 오히려 그것을 모사해야하는 지금이야말로 제일 제정신이다. 다만 내가 믿지 않는 세계를 믿을 수 있게 만들 수 있을까?',
    koOverride: { font: '22.3px "DXTypeB", sans-serif' },
    typingOrder: 1,
    font: '22.3px "Oceanside Typewriter", Georgia', lineHeight: 10, color: '#333', padding: 4, mode: 'outline' },
  { id: 'front-title', vertices: [[0.356,0.144],[0.659,0.07],[0.636,0.257],[0.356,0.346]],
    text: 'I Belive in Madness.',
    textKo: '나는 광기를 믿는다.',
    koOverride: { font: '53px "DXTypeB", sans-serif', rotation: -8, rotationEnd: -3, mode: 'fill', fanPivot: -1 },
    typingOrder: 3,
    font: '53px "Oceanside Typewriter", Georgia', lineHeight: 100, color: '#000', padding: 0, rotation: -12 },
  { id: 'front-subtitle', vertices: [[0.353,0.516],[0.632,0.483],[0.631,0.572],[0.352,0.588]],
    text: '29 October 2022. \nThe Annihilation happened three years ago.',
    textKo: '2022년 10월 29일.\n멸망은 삼년 전 일이었다.',
    koOverride: { font: '23px "DXTypeB", sans-serif' },
    typingOrder: 6,
    font: '23px "Oceanside Typewriter", Georgia', lineHeight: 32, color: '#000', padding: 0, rotation: -3 },
  { id: 'right-wall-top', vertices: [[0.74,0.093],[0.895,0.233],[0.894,0.268],[0.74,0.142]],
    text: 'Three years back.',
    textKo: '3년 전.',
    koOverride: { font: '20px "DXTypeB", sans-serif' },
    typingOrder: 9,
    font: '20px "Oceanside Typewriter", Georgia', lineHeight: 18, color: '#000', padding: 12, rotation: 25 },
  { id: 'right-wall-bottom', vertices: [[0.684,0.074],[0.728,0.084],[0.727,0.57],[0.688,0.566],[0.648,0.565],[0.647,0.09]],
    text: "Look at the things I built. I was mad then, too. It is only now, now that I have been asked to copy the madness down, that I am most sane.\nThe trouble is, can I make a world I don't believe in believable?",
    textKo: '공항에 도착한 나는 뚜렷한 환상을 보기 시작했다. 죽은 영혼들이 눈 앞에 보이고 그들의 목소리가 들렸다. 공항 안에 이상한 인물들이 나타나기 시작했다. 예를 들면 빨간 십자가를 든 예수천국 불신지옥 아저씨라거나 내 주변으로 몰려든 천사들. 아픈 사람들. ',
    koOverride: { font: '13.1px "DXTypeB", sans-serif' },
    typingOrder: 2,
    font: '12.1px "Oceanside Typewriter", Georgia', lineHeight: 13, color: '#000', padding: 6, mode: 'outline' },
  { id: 'ground', vertices: [[0.008,0.854],[0.41,1.015],[0.279,1.069],[0.008,0.967]],
    text: '2 February 2023. \nThat I saved the world that day, \nnobody needs to know.',
    textKo: '2023년 2월 2일. \n그때 내가 세상을 구했다는 사실은 아무도 알 필요 없다.',
    koOverride: { font: '19.5px "DXTypeB", sans-serif', lineHeight: 29 },
    typingOrder: 13,
    font: '20px "Oceanside Typewriter", Georgia', lineHeight: 27, color: '#000', padding: 5, rotation: 12, rotationEnd: 12, fanPivot: 0 },
  { id: 'right-wall-top-copy-100', vertices: [[0.738,0.325],[0.9,0.43],[0.901,0.532],[0.735,0.456]],
    text: 'The lift at Yeongang Cham Hospital, across from the Ora-1-dong bus terminal, rises all the way into space. ',
    textKo: '오라일동 버스터미널 맞은편 연강참병원 엘리베이터는 우주로 향한다.',
    koOverride: { font: '20px "DXTypeB", sans-serif', lineHeight: 34 },
    typingOrder: 11,
    font: '20px "Oceanside Typewriter", Georgia', lineHeight: 23, color: '#000', padding: 12, rotation: 19, rotationEnd: -1 },
  { id: 'right-wall-top-copy-101', vertices: [[0.739,0.153],[0.896,0.281],[0.896,0.412],[0.736,0.31]],
    text: 'The Earth Patrol fished me out of my drift through outer space and delivered me to Jeju. \nJeju is the secret base of the magical girls.',
    textKo: '지구방범대는 우주미아가 된 나를 수거해 제주도로 보냈다. 제주도는 마법소녀 비밀기지다.',
    koOverride: { font: '20px "DXTypeB", sans-serif', lineHeight: 34 },
    typingOrder: 10,
    font: '20px "Oceanside Typewriter", Georgia', lineHeight: 23, color: '#000', padding: 12, rotation: 22, rotationEnd: -2 },
  { id: 'right-wall-top-copy-100-copy-102', vertices: [[0.734,0.466],[0.901,0.529],[0.904,0.651],[0.732,0.606]],
    text: 'On the fifth floor, a Space President who looks like Park Geun-hye walks the corridors dressed in purple uniform.',
    textKo: '5층에는 박근혜 닮은 우주대통령이 보라색 가운을 입고 복도를 돌아다닌다.',
    koOverride: { font: '20px "DXTypeB", sans-serif', lineHeight: 34 },
    typingOrder: 12,
    font: '20px "Oceanside Typewriter", Georgia', lineHeight: 23, color: '#000', padding: 12, rotation: 11 },
  { id: 'ground-copy-103', vertices: [[0.008,0.733],[0.008,0.85],[0.277,1.012],[0.716,1.011],[0.888,0.869]],
    text: "My grandmother's house, the second floor, the rooftop terrace. A camping chair set out in one corner, and in front of it a tin of coffee capsules doing its duty as an ashtray. Here where I am writing, beside the chair where I sit, a bug is crossing the floor. It comes closer. Closer. \nIt seems to be looking at me. Then, reading some signal I cannot name, it turns on itself and moves off. \nSunlight. A cigarette. I have been looking through the old photographs.\nI lean toward them, then away, sickened. Like the bug…",
    textKo: '할머니집 이층 옥탑방 테라스. 한 켠에 캠핑의자를 펴 놓고, 그 앞에는 캡슐커피통을 재떨이로 쓰고 있다. 이것을 쓰고 있는 테라스에, 내가 앉아 있는 캠핑의자 옆에, 벌레가 지나가고 있다.\n점점 내 쪽으로 온다. 나를 쳐다보는 듯하다. 위험 신호를 감지했는지 다시 유턴해서 나에게서 멀어진다. \n햇빛과 담배. 그간의 사진들을 들여다보았다. 그것들에 가까워졌다가 역겨움을 느끼며 멀어진다. 벌레처럼…',
    koOverride: { font: '20px "DXTypeB", sans-serif', rotationEnd: 21, lineHeight: 35 },
    typingOrder: 8,
    font: '20px "Oceanside Typewriter", Georgia', lineHeight: 23, color: '#000', padding: 5, rotation: 5, rotationEnd: 21, fanPivot: 1 },
  { id: 'ground-copy-103-copy-106', vertices: [[0.013,0.696],[0.014,0.719],[0.894,0.856],[0.984,0.79]],
    text: 'Write anything. A promise is a promise. There is only one reason I put up with this tiresome life. Because I gave my word. I prove it by staying alive.',
    textKo: '무엇이라도 쓰자. 약속은 지켜야 하니까. 지긋지긋한 생을 버티는 이유는 단 하나다. 약속이니까. 나는 삶으로써 증명한다.',
    koOverride: { font: '20px "DXTypeB", sans-serif' },
    typingOrder: 7,
    font: '20px "Oceanside Typewriter", Georgia', lineHeight: 13, color: '#000', padding: 5, rotation: 3, rotationEnd: 14, fanPivot: 1 },
  { id: 'front-title-copy-100', vertices: [[0.365,0.242],[0.643,0.197],[0.644,0.363],[0.359,0.44]],
    text: "I don't believe.",
    textKo: '믿지 않는다.',
    koOverride: { font: '60px "DXTypeB", sans-serif', rotation: -6, rotationEnd: 1 },
    typingOrder: 4,
    font: '60px "Oceanside Typewriter", Georgia', lineHeight: 100, color: '#000', padding: 0, rotation: -8 },
  { id: 'front-title-copy-100-copy-101', vertices: [[0.361,0.347],[0.645,0.316],[0.64,0.463],[0.352,0.544]],
    text: 'Be lie —-ve?.',
    textKo: '믿?.',
    koOverride: { font: '65px "DXTypeB", sans-serif' },
    typingOrder: 5,
    font: '65px "Oceanside Typewriter", Georgia', lineHeight: 100, color: '#000', padding: 0, rotation: -5 },
  { id: 'box-101', vertices: [[0.018,0.477],[0.308,0.394],[0.299,0.679],[0.008,0.67]],
    text: 'Jeju is an island of myths. The moment I got off the plane, I knew I had come to where I was meant to be. The world was falling to pieces. A great earthquake had hit Türkiye and Syria. And the honeybees were going missing, in their thousands.',
    textKo: '제주도는 신화의 섬. 내리자마자 내가 있어야 할 곳에 왔다는 사실을 알았다. 세상은 무너지고 있었다. 튀르키예와 시리아에는 대지진이 일어났고. 꿀벌들은 대규모 실종되고 있었다.',
    koOverride: { font: '20px "DXTypeB", sans-serif' },
    typingOrder: 14,
    font: '20px "Oceanside Typewriter", Georgia', lineHeight: 32, color: '#000', padding: 8, rotation: -10, rotationEnd: 14 },
];

// ── 컴포넌트 ──

export type TypographyConfig = {
  canvasWidth: number;
  canvasHeight: number;
  background: string;
  showPolygonOutlines: boolean;
};

// 원본 해상도 비율: 3920x2210 ≈ 16:9
export const DEFAULT_CONFIG: TypographyConfig = {
  canvasWidth: 1960,
  canvasHeight: 1105,
  background: '#ffffff',
  showPolygonOutlines: false,
};

type Props = {
  /** 배경 이미지 (선택) */
  backgroundSrc?: string;
  backgroundAlpha?: number;
  polygons?: TextPolygon[];
  config?: TypographyConfig;
  className?: string;
  style?: React.CSSProperties;
  /**
   * Per-polygon typing progress — max character index visible (in poly.text).
   * When provided, polygon.text is NOT sliced; PT renders the full text and
   * clips per-word to this limit, keeping layout frozen.
   */
  typingProgress?: Record<string, number>;
  /**
   * Per-polygon glitch substitutions — for fully-typed words, apply mask/mapping.
   * KO substitutions render at the EN word position (overflow or gap natural).
   */
  glitchSubstitutions?: Record<string, GlitchSubstitution>;
};

/** SVG selectable overlay — one entry per rendered line (fill mode). */
interface SvgLine {
  key: string;
  text: string;
  x: number;
  y: number;
  font: string;
  /** SVG transform string — wraps origin + rotation. undefined = horizontal. */
  transform?: string;
}

/** SVG selectable overlay — one entry per outline-mode polygon. */
interface SvgOutline {
  key: string;
  pathId: string;
  pathD: string;
  text: string;
  font: string;
}

// ── Frozen-layout cache (for exhibit glitch mode) ─────────────
/** A single word's position within a cached line. */
interface CachedWord {
  text: string;           // Original EN word
  xOffset: number;        // Relative to line start (drawX)
  width: number;
  wordIdx: number;        // Global word index in the polygon
  charStart: number;      // Character index in full poly.text (inclusive)
  charEnd: number;        // Character index in full poly.text (exclusive)
}

/** A single pretext-computed line within a polygon. */
interface CachedLine {
  drawX: number;          // In local frame (inside group transform if present)
  drawY: number;
  words: CachedWord[];
  /** Fan mode: additional rotation (deg) around fanPivot applied per line */
  fanRotateDeg?: number;
}

/** Frozen layout for a single fill-mode polygon. */
interface CachedPolygon {
  /** Cache key = poly.text + '|' + font/lh/rotation... — invalidates on change */
  key: string;
  font: string;           // EN font
  koFont?: string;        // KO font (from koOverride)
  color: string;
  lines: CachedLine[];
  /** Non-fan rotated fill */
  groupTransform?: { pivX: number; pivY: number; rotDeg: number };
  /** Fan mode pivot (per-line fanRotateDeg used with this pivot) */
  fanPivot?: { pivX: number; pivY: number };
}

/** Parent-supplied per-polygon substitution state (for glitch). */
export interface GlitchSubstitution {
  /** mask[wordIdx] = true → use mapping[wordIdx] (KO) for that word */
  mask: boolean[];
  /** mapping[wordIdx] = KO substitution string, or null if no KO available for that slot */
  mapping: (string | null)[];
}

/** Pre-compute char range for each word (whitespace-split) in full text. */
function computeWordRanges(text: string): { start: number; end: number }[] {
  const parts = text.split(/(\s+)/);
  const ranges: { start: number; end: number }[] = [];
  let charIdx = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i % 2 === 0 && part.length > 0) {
      ranges.push({ start: charIdx, end: charIdx + part.length });
    }
    charIdx += part.length;
  }
  return ranges;
}

/**
 * Draw a pretext-computed line word by word, applying typing clip + glitch substitution.
 * Layout is preserved: each word is drawn at its EN x-position; KO substitutions
 * overflow or leave gap naturally.
 *
 * Returns the updated global word index.
 */
function drawLineByWords(
  ctx: CanvasRenderingContext2D,
  lineText: string,
  drawX: number,
  drawY: number,
  baseFont: string,
  koFont: string | undefined,
  globalWordIdxStart: number,
  wordRanges: { start: number; end: number }[] | null,
  sub: GlitchSubstitution | null,
  typedLimit: number,
): number {
  const parts = lineText.split(/(\s+)/);
  let xOffset = 0;
  let globalWordIdx = globalWordIdxStart;
  ctx.font = baseFont;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.length === 0) continue;
    const partWidth = ctx.measureText(part).width;

    if (i % 2 === 0) {
      // Word token
      const wIdx = globalWordIdx;
      globalWordIdx++;
      const range = wordRanges?.[wIdx];
      const start = range?.start ?? 0;
      const end = range?.end ?? part.length;

      if (start >= typedLimit) {
        // Not yet typed — skip draw, but still advance xOffset to preserve slot
      } else if (end <= typedLimit) {
        // Fully typed — apply glitch substitution if any
        const swap = sub?.mask?.[wIdx] ?? false;
        const koText = swap ? sub?.mapping?.[wIdx] ?? null : null;
        if (koText !== null && koText !== undefined) {
          // KO substitution — draw with KO font at EN position
          ctx.save();
          if (koFont) ctx.font = koFont;
          ctx.fillText(koText, drawX + xOffset, drawY);
          ctx.restore();
          ctx.font = baseFont;
        } else {
          ctx.fillText(part, drawX + xOffset, drawY);
        }
      } else {
        // Partially typed — draw sliced head
        const partialLen = typedLimit - start;
        ctx.fillText(part.slice(0, Math.max(0, partialLen)), drawX + xOffset, drawY);
      }
    }
    // Whitespace: don't draw, just advance
    xOffset += partWidth;
  }
  return globalWordIdx;
}

/** Build a cache key that invalidates when layout-affecting fields change. */
function buildCacheKey(poly: TextPolygon, cw: number, ch: number): string {
  return [
    poly.text,
    poly.font,
    poly.lineHeight,
    poly.padding ?? 0,
    poly.rotation ?? 0,
    poly.rotationEnd ?? '',
    poly.fanPivot ?? '',
    poly.mode ?? 'fill',
    cw,
    ch,
  ].join('|');
}

/** Split a line's text into per-word entries with cumulative x offsets. */
function splitLineWords(
  ctx: CanvasRenderingContext2D,
  lineText: string,
  font: string,
  baseCharIdx: number,
  globalWordIdxStart: number,
): { words: CachedWord[]; nextGlobalWordIdx: number; nextCharIdx: number } {
  ctx.save();
  ctx.font = font;
  const parts = lineText.split(/(\s+)/);
  const words: CachedWord[] = [];
  let xOffset = 0;
  let charIdx = baseCharIdx;
  let globalWordIdx = globalWordIdxStart;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const width = ctx.measureText(part).width;
    if (i % 2 === 0 && part.length > 0) {
      words.push({
        text: part,
        xOffset,
        width,
        wordIdx: globalWordIdx,
        charStart: charIdx,
        charEnd: charIdx + part.length,
      });
      globalWordIdx++;
    }
    xOffset += width;
    charIdx += part.length;
  }
  ctx.restore();
  return { words, nextGlobalWordIdx: globalWordIdx, nextCharIdx: charIdx };
}

export function PretextTypography({
  backgroundSrc,
  backgroundAlpha = 0.2,
  polygons = DEFAULT_POLYGONS,
  config = DEFAULT_CONFIG,
  className,
  style,
  typingProgress,
  glitchSubstitutions,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImg = useRef<HTMLImageElement | null>(null);
  const [bgReady, setBgReady] = useState(!backgroundSrc);
  const [fontReady, setFontReady] = useState(false);
  const [svgLines, setSvgLines] = useState<SvgLine[]>([]);
  const [svgOutlines, setSvgOutlines] = useState<SvgOutline[]>([]);
  const ready = bgReady && fontReady;

  // 커스텀 폰트 로드 — @font-face CSS + FontFace API 병행
  useEffect(() => {
    const BASE = import.meta.env.BASE_URL;

    // 1. @font-face CSS 등록 (document 전역에 폰트 스택 알림 — canvas 매칭용)
    const STYLE_ID = 'pretext-fonts';
    if (!document.getElementById(STYLE_ID)) {
      const styleEl = document.createElement('style');
      styleEl.id = STYLE_ID;
      styleEl.textContent = `
        @font-face {
          font-family: 'Oceanside Typewriter';
          src: url('${BASE}assets/fonts/OceansideTypewriter.ttf') format('truetype');
          font-display: block;
        }
        @font-face {
          font-family: 'DXTypeB';
          src: url('${BASE}assets/fonts/DXTypeB.ttf') format('truetype');
          font-display: block;
        }
      `;
      document.head.appendChild(styleEl);
    }

    // 2. FontFace API로 강제 로드 — ready 시점 확보
    const osFace = new FontFace(
      'Oceanside Typewriter',
      `url(${BASE}assets/fonts/OceansideTypewriter.ttf)`,
    );
    const koFace = new FontFace(
      'DXTypeB',
      `url(${BASE}assets/fonts/DXTypeB.ttf)`,
    );
    Promise.allSettled([osFace.load(), koFace.load()]).then((results) => {
      results.forEach((r, i) => {
        const name = i === 0 ? 'Oceanside Typewriter' : 'DXTypeB';
        if (r.status === 'fulfilled') {
          document.fonts.add(r.value);
          console.log(`[PretextTypography] loaded ${name}`, r.value.status);
        } else {
          console.warn(
            `[PretextTypography] Failed to load ${name}:`,
            r.reason,
          );
        }
      });
      // @font-face에 등록된 폰트까지 포함해 ready 대기
      Promise.all([
        document.fonts.load('20px "DXTypeB"', '가나'),
        document.fonts.load('20px "Oceanside Typewriter"', 'Ab'),
      ]).then(() => {
        console.log('[PretextTypography] canvas font checks', {
          'DXTypeB ascii': document.fonts.check('20px "DXTypeB"'),
          'DXTypeB 한글': document.fonts.check('20px "DXTypeB"', '가나'),
          'Oceanside ascii': document.fonts.check('20px "Oceanside Typewriter"'),
        });
        setFontReady(true);
      });
    });
  }, []);

  // 배경 이미지 로드
  useEffect(() => {
    if (!backgroundSrc) { setBgReady(true); return; }
    const img = new Image();
    img.onload = () => { bgImg.current = img; setBgReady(true); };
    img.onerror = () => setBgReady(true);
    img.src = backgroundSrc;
  }, [backgroundSrc]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Collect per-line data for SVG selectable overlay
    const collected: SvgLine[] = [];
    const collectedOutlines: SvgOutline[] = [];

    const { canvasWidth: cw, canvasHeight: ch, background, showPolygonOutlines } = config;
    canvas.width = cw;
    canvas.height = ch;

    // 배경
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, cw, ch);

    // 배경 이미지
    if (bgImg.current) {
      ctx.save();
      ctx.globalAlpha = backgroundAlpha;
      ctx.drawImage(bgImg.current, 0, 0, cw, ch);
      ctx.restore();
    }

    // 각 폴리곤 영역에 텍스트 렌더링
    for (const poly of polygons) {
      // Per-word render mode (exhibit: typing + glitch substitutions)
      const sub = glitchSubstitutions?.[poly.id] ?? null;
      // When typingProgress prop is provided but a polygon isn't in it,
      // that polygon hasn't started typing yet — fall back to 0, not Infinity.
      const typedLimit =
        typingProgress !== undefined
          ? typingProgress[poly.id] ?? 0
          : Infinity;
      const perWordMode = sub !== null || typingProgress !== undefined;
      const wordRanges = perWordMode ? computeWordRanges(poly.text) : null;
      const globalWordIdxRef = { current: 0 };
      const koFont = poly.koOverride?.font;

      // 디버그: 폴리곤 외곽선
      if (showPolygonOutlines) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        poly.vertices.forEach(([x, y], i) => {
          const px = x * cw, py = y * ch;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,0,0,0.7)';
        ctx.font = '10px monospace';
        ctx.fillText(poly.id, poly.vertices[0][0] * cw + 2, poly.vertices[0][1] * ch + 10);
        ctx.restore();
      }

      // outline 모드: 외곽선을 따라 텍스트
      if (poly.mode === 'outline') {
        // Typing clip: slice to typedLimit (chars already typed).
        // Outline walker is char-by-char so slicing preserves per-char positions.
        const effText =
          typedLimit < poly.text.length
            ? poly.text.slice(0, Math.max(0, Math.floor(typedLimit)))
            : poly.text;
        const effPoly = effText === poly.text ? poly : { ...poly, text: effText };
        renderOutlineText(ctx, effPoly, cw, ch);
        // SVG: polygon perimeter path + textPath for native browser selection
        if (poly.vertices.length >= 2 && effText.length > 0) {
          const pathD =
            poly.vertices
              .map(([x, y], i) =>
                `${i === 0 ? 'M' : 'L'}${x * cw},${y * ch}`,
              )
              .join(' ') + ' Z';
          collectedOutlines.push({
            key: poly.id,
            pathId: `pretext-path-${poly.id}`,
            pathD,
            text: effText,
            font: poly.font,
          });
        }
        continue;
      }

      // fill 모드: 수평 / 회전 / 방사형 텍스트 + 폴리곤 가변 마진
      const paragraphs = poly.text.split('\n');
      const padding = poly.padding ?? 0;
      const rotDeg = poly.rotation ?? 0;
      const hasRadial = poly.rotationEnd !== undefined;

      // 방사형: rot으로 기본 좌표계 회전 (스캔라인 포함) + spread로 줄별 추가 회전
      if (hasRadial) {
        const baseRad = (rotDeg * Math.PI) / 180;
        const spreadDeg = poly.rotationEnd!;

        // 피벗: fanPivot 꼭짓점 or 폴리곤 중심 — 음수/초과 인덱스는 Euclidean modulo로 wrap
        const n = poly.vertices.length;
        if (n === 0) continue;
        const rawPiv = poly.fanPivot ?? 0;
        const pivIdx = ((rawPiv % n) + n) % n;
        const pivVert = poly.vertices[pivIdx];
        if (!pivVert) continue;
        const pivX = pivVert[0] * cw;
        const pivY = pivVert[1] * ch;

        // rot 각도로 역회전한 폴리곤 (피벗 기준, 픽셀 좌표)
        const cosB = Math.cos(-baseRad), sinB = Math.sin(-baseRad);
        const rotVerts = poly.vertices.map(([vx, vy]) => {
          const dx = vx * cw - pivX, dy = vy * ch - pivY;
          return { x: dx * cosB - dy * sinB, y: dx * sinB + dy * cosB };
        });

        let rMinY = Infinity, rMaxY = -Infinity;
        for (const p of rotVerts) {
          if (p.y < rMinY) rMinY = p.y;
          if (p.y > rMaxY) rMaxY = p.y;
        }

        // 회전 좌표계에서 스캔라인
        const getRotSpan = (y: number): { left: number; right: number } | null => {
          const xs: number[] = [];
          for (let i = 0; i < rotVerts.length; i++) {
            const a = rotVerts[i], b = rotVerts[(i + 1) % rotVerts.length];
            if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
              xs.push(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x));
            }
          }
          if (xs.length < 2) return null;
          xs.sort((a, b) => a - b);
          return { left: xs[0], right: xs[xs.length - 1] };
        };

        ctx.save();
        ctx.fillStyle = poly.color;
        ctx.font = poly.font;
        ctx.textBaseline = 'top';

        let ry = rMinY + padding;
        const maxRepeats = poly.repeat ? 50 : 1;

        for (let rep = 0; rep < maxRepeats && ry + poly.lineHeight <= rMaxY - padding; rep++) {
        for (const para of paragraphs) {
          if (ry + poly.lineHeight > rMaxY - padding) break;
          if (para.trim() === '') { ry += poly.lineHeight; continue; }

          const prepared = prepareWithSegments(para, poly.font);
          let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };

          while (ry + poly.lineHeight <= rMaxY - padding) {
            const span = getRotSpan(ry);
            if (!span) { ry += poly.lineHeight; continue; }

            const effectiveWidth = (span.right - span.left) - padding * 2;
            if (effectiveWidth < 20) { ry += poly.lineHeight; continue; }

            const range = layoutNextLineRange(prepared, cursor, effectiveWidth);
            if (range === null) break;

            const line = materializeLineRange(prepared, range);

            // spread: 줄 위치에 따른 추가 회전
            const t = (rMaxY - rMinY) > 0 ? (ry - rMinY) / (rMaxY - rMinY) : 0;
            const spreadRad = (spreadDeg * t * Math.PI) / 180;

            let drawX = span.left + padding;
            if (poly.align === 'center') drawX += (effectiveWidth - line.width) / 2;
            else if (poly.align === 'right') drawX += effectiveWidth - line.width;

            // 피벗 기준: 기본 회전(rot) + 줄별 추가 회전(spread)
            ctx.save();
            ctx.translate(pivX, pivY);
            ctx.rotate(baseRad + spreadRad);
            if (perWordMode) {
              globalWordIdxRef.current = drawLineByWords(
                ctx, line.text, drawX, ry,
                poly.font, koFont,
                globalWordIdxRef.current,
                wordRanges, sub, typedLimit,
              );
            } else {
              ctx.fillText(line.text, drawX, ry);
            }
            ctx.restore();

            // SVG: fan 모드 — per-line 회전 + 피벗 이동
            const totalDegFan = ((baseRad + spreadRad) * 180) / Math.PI;
            collected.push({
              key: `${poly.id}-${rep}-${collected.length}`,
              text: line.text,
              x: drawX,
              y: ry,
              font: poly.font,
              transform: `translate(${pivX} ${pivY}) rotate(${totalDegFan})`,
            });

            cursor = range.end;
            ry += poly.lineHeight;
          }
        }
        } // repeat loop

        ctx.restore();
        continue;
      }

      const rotRad = (rotDeg * Math.PI) / 180;

      // 스캔라인 함수: 수평 or 회전
      type SpanFn = (y: number) => { left: number; right: number } | null;
      let spanFn: SpanFn;
      let yMin: number, yMax: number;
      // SVG overlay transform (for all lines in this polygon)
      let svgTransform: string | undefined;

      if (Math.abs(rotDeg) < 0.5) {
        // 수평
        const { top, bottom } = getPolygonYRange(poly.vertices, ch);
        yMin = top; yMax = bottom;
        spanFn = (y) => getPolygonSpanAtY(poly.vertices, y, cw, ch);
        ctx.save();
        svgTransform = undefined;
      } else {
        // 회전
        let pivX = 0, pivY = 0;
        for (const [vx, vy] of poly.vertices) { pivX += vx * cw; pivY += vy * ch; }
        pivX /= poly.vertices.length;
        pivY /= poly.vertices.length;

        const cosA = Math.cos(-rotRad), sinA = Math.sin(-rotRad);
        const rotVerts = poly.vertices.map(([vx, vy]) => {
          const dx = vx * cw - pivX, dy = vy * ch - pivY;
          return { x: dx * cosA - dy * sinA, y: dx * sinA + dy * cosA };
        });

        let rMin = Infinity, rMax = -Infinity;
        for (const p of rotVerts) {
          if (p.y < rMin) rMin = p.y;
          if (p.y > rMax) rMax = p.y;
        }
        yMin = rMin; yMax = rMax;

        spanFn = (y) => {
          const xs: number[] = [];
          for (let i = 0; i < rotVerts.length; i++) {
            const a = rotVerts[i], b = rotVerts[(i + 1) % rotVerts.length];
            if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
              xs.push(a.x + (y - a.y) / (b.y - a.y) * (b.x - a.x));
            }
          }
          if (xs.length < 2) return null;
          xs.sort((a, b) => a - b);
          return { left: xs[0], right: xs[xs.length - 1] };
        };

        ctx.save();
        ctx.translate(pivX, pivY);
        ctx.rotate(rotRad);
        svgTransform = `translate(${pivX} ${pivY}) rotate(${rotDeg})`;
      }

      ctx.fillStyle = poly.color;
      ctx.font = poly.font;
      ctx.textBaseline = 'top';

      let y = yMin + padding;
      const maxRepeats = poly.repeat ? 50 : 1;

      for (let rep = 0; rep < maxRepeats && y + poly.lineHeight <= yMax - padding; rep++) {
      for (const para of paragraphs) {
        if (y + poly.lineHeight > yMax - padding) break;

        if (para.trim() === '') {
          y += poly.lineHeight;
          continue;
        }

        const prepared = prepareWithSegments(para, poly.font);
        let cursor: LayoutCursor = { segmentIndex: 0, graphemeIndex: 0 };

        while (y + poly.lineHeight <= yMax - padding) {
          const span = spanFn(y);
          if (!span) { y += poly.lineHeight; continue; }

          const effectiveWidth = (span.right - span.left) - padding * 2;
          if (effectiveWidth < 20) { y += poly.lineHeight; continue; }

          const range = layoutNextLineRange(prepared, cursor, effectiveWidth);
          if (range === null) break;

          const line = materializeLineRange(prepared, range);

          let drawX = span.left + padding;
          if (poly.align === 'center') drawX += (effectiveWidth - line.width) / 2;
          else if (poly.align === 'right') drawX += effectiveWidth - line.width;

          if (perWordMode) {
            globalWordIdxRef.current = drawLineByWords(
              ctx, line.text, drawX, y,
              poly.font, koFont,
              globalWordIdxRef.current,
              wordRanges, sub, typedLimit,
            );
          } else {
            ctx.fillText(line.text, drawX, y);
          }

          // SVG: horizontal or rotated fill 모드
          collected.push({
            key: `${poly.id}-${rep}-${collected.length}`,
            text: line.text,
            x: drawX,
            y: y,
            font: poly.font,
            transform: svgTransform,
          });

          cursor = range.end;
          y += poly.lineHeight;
        }
      }
      } // repeat loop

      ctx.restore();
    }

    // Commit collected lines to SVG overlay state
    setSvgLines(collected);
    setSvgOutlines(collectedOutlines);
  }, [polygons, config, backgroundAlpha, typingProgress, glitchSubstitutions]);

  // 렌더 — polygons 변경 시 강제 재렌더
  const polygonsKey = JSON.stringify(polygons);
  useEffect(() => {
    if (ready) render();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, render, polygonsKey, config]);

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        display: 'inline-block',
        ...style,
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          display: 'block',
          maxWidth: '100%',
          height: 'auto',
        }}
      />
      {/* SVG selectable overlay — fill-mode polygons only (3a).
          Canvas still draws all polygons including outline; SVG sits on top with
          transparent fill so users can drag-select text via native browser selection. */}
      <svg
        viewBox={`0 0 ${config.canvasWidth} ${config.canvasHeight}`}
        preserveAspectRatio="none"
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          userSelect: 'text',
          WebkitUserSelect: 'text',
          pointerEvents: 'auto',
        }}
      >
        <defs>
          {svgOutlines.map((o) => (
            <path key={`def-${o.key}`} id={o.pathId} d={o.pathD} fill="none" />
          ))}
        </defs>
        {/* Outline-mode text — follows polygon perimeter via textPath */}
        {svgOutlines.map((o) => (
          <text
            key={`out-${o.key}`}
            fill="#000"
            fillOpacity={0}
            pointerEvents="all"
            style={{ font: o.font, whiteSpace: 'pre' }}
          >
            <textPath href={`#${o.pathId}`}>{o.text}</textPath>
          </text>
        ))}
        {/* Fill-mode lines — one <text> per line */}
        {svgLines.map((line) => (
          <text
            key={line.key}
            x={line.x}
            y={line.y}
            fill="#000"
            fillOpacity={0}
            pointerEvents="all"
            dominantBaseline="text-before-edge"
            transform={line.transform}
            style={{ font: line.font, whiteSpace: 'pre' }}
          >
            {line.text}
          </text>
        ))}
      </svg>
    </div>
  );
}

export { DEFAULT_POLYGONS };
