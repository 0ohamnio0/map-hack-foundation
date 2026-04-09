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

/** 꼭짓점은 정규화 좌표 (0~1). 시계 방향 또는 반시계 방향. */
export type TextPolygon = {
  /** 고유 ID */
  id: string;
  /** 꼭짓점 배열 [[x, y], ...] — 정규화 좌표 (0~1) */
  vertices: [number, number][];
  /** 텍스트 내용 */
  text: string;
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
    text: 'I wish to materially recreate the world of a mad presence. A closed universe. The delusions scattered throughout the room may not be implausible, but their density will be persuasive. Or perhaps it always has been. Reflecting on the things I have created, I realize I was already mad even back then. Rather, it is now, when I must emulate that madness, that I am most sane. But can I make a world I do not believe in seem believable?',
    font: '17.6px "Oceanside Typewriter", Georgia', lineHeight: 10, color: '#333', padding: 4, mode: 'outline' },
  { id: 'front-title', vertices: [[0.362,0.22],[0.648,0.075],[0.644,0.232],[0.359,0.297]],
    text: 'I Belive in Madness.', font: '70px "Oceanside Typewriter", Georgia', lineHeight: 100, color: '#000', padding: 0, rotation: -9 },
  { id: 'front-subtitle', vertices: [[0.353,0.513],[0.632,0.48],[0.631,0.569],[0.352,0.585]],
    text: '29 October 2022. \nThe Annihilation happened three years ago.', font: '30px "Oceanside Typewriter", Georgia', lineHeight: 31, color: '#000', padding: 0, rotation: -3 },
  { id: 'right-wall-top', vertices: [[0.738,0.227],[0.902,0.358],[0.904,0.43],[0.738,0.305]],
    text: 'The Earth Patrol picked up my stranded self and rescued me to Jeju Island. Jeju Island is a Maho shōjo\'s secret base.',
    font: '20px "Oceanside Typewriter", Georgia', lineHeight: 18, color: '#000', padding: 12, rotation: 24 },
  { id: 'right-wall-bottom', vertices: [[0.684,0.074],[0.728,0.084],[0.727,0.57],[0.688,0.566],[0.648,0.565],[0.647,0.09]],
    text: 'The lift opposite Ora-ri dong Bus Terminal at Yeonkang Chea Hospital ascends into space. On the fifth floor, a space-dwelling Nyangnyangpung Park Guardian reads her purple uniform. ',
    font: '17.4px "Oceanside Typewriter", Georgia', lineHeight: 13, color: '#000', padding: 6, mode: 'outline' },
  { id: 'ground', vertices: [[0.007,0.807],[0.593,0.991],[0.254,0.993],[0.003,0.847]],
    text: 'In the terrace of the attic on the second floor of my grandmother\'s house, I\'ve unfolded a camping chair in one corner, and in an empty opposite corner, a bug is heading towards me. It\'s gradually coming in front of it. On this terrace where I\'m writing, beside the camping chair I\'m sitting on, a coffee container is on the floor. Next to it is an ashtray. Something about the sunlight and cigarettes. I looked through the photos from past, I drew near them, then recoiled in disgust, like the bug. In the terrace of 2 February 2023. Nobody needs to know that I saved the world back then.',
    font: '20px "Oceanside Typewriter", Georgia', lineHeight: 13, color: '#000', padding: 5, rotation: 10, rotationEnd: -5 },
  { id: 'right-wall-top-copy-100', vertices: [[0.738,0.349],[0.903,0.459],[0.904,0.526],[0.738,0.439]],
    text: 'The Earth Patrol picked up my stranded self and rescued me to Jeju Island. Jeju Island is a Maho shōjo\'s secret base.',
    font: '20px "Oceanside Typewriter", Georgia', lineHeight: 18, color: '#000', padding: 12, rotation: 19 },
  { id: 'right-wall-top-copy-101', vertices: [[0.74,0.098],[0.901,0.266],[0.902,0.332],[0.739,0.191]],
    text: 'The Earth Patrol picked up my stranded self and rescued me to Jeju Island. Jeju Island is a Maho shōjo\'s secret base.',
    font: '25px "Oceanside Typewriter", Georgia', lineHeight: 18, color: '#000', padding: 12, rotation: 25 },
  { id: 'right-wall-top-copy-100-copy-102', vertices: [[0.738,0.471],[0.902,0.552],[0.902,0.627],[0.737,0.57]],
    text: 'The Earth Patrol picked up my stranded self and rescued me to Jeju Island. Jeju Island is a Maho shōjo\'s secret base.',
    font: '20px "Oceanside Typewriter", Georgia', lineHeight: 18, color: '#000', padding: 12, rotation: 14 },
  { id: 'ground-copy-103', vertices: [[0.009,0.76],[0.006,0.79],[0.702,0.998],[0.803,0.914]],
    text: 'In the terrace of the attic on the second floor of my grandmother\'s house, I\'ve unfolded a camping chair in one corner, and in an empty opposite corner, a bug is heading towards me. It\'s gradually coming in front of it. On this terrace where I\'m writing, beside the camping chair I\'m sitting on, a coffee container is on the floor. Next to it is an ashtray. Something about the sunlight and cigarettes. I looked through the photos from past, I drew near them, then recoiled in disgust, like the bug. In the terrace of 2 February 2023. Nobody needs to know that I saved the world back then.',
    font: '20px "Oceanside Typewriter", Georgia', lineHeight: 13, color: '#000', padding: 5, rotation: 6, rotationEnd: -2 },
  { id: 'ground-copy-103-copy-106', vertices: [[0.067,0.738],[0.021,0.75],[0.16,0.789],[0.814,0.911],[0.968,0.793]],
    text: 'In the terrace of the attic on the second floor of my grandmother\'s house, I\'ve unfolded a camping chair in one corner, and in an empty opposite corner, a bug is heading towards me. It\'s gradually coming in front of it. On this terrace where I\'m writing, beside the camping chair I\'m sitting on, a coffee container is on the floor. Next to it is an ashtray. Something about the sunlight and cigarettes. I looked through the photos from past, I drew near them, then recoiled in disgust, like the bug. In the terrace of 2 February 2023. Nobody needs to know that I saved the world back then.',
    font: '20px "Oceanside Typewriter", Georgia', lineHeight: 13, color: '#000', padding: 5, rotation: 2, rotationEnd: -4 },
  { id: 'front-title-copy-100', vertices: [[0.357,0.256],[0.635,0.211],[0.636,0.377],[0.355,0.42]],
    text: 'I don\'t believe.', font: '80px "Oceanside Typewriter", Georgia', lineHeight: 100, color: '#000', padding: 0, rotation: -5 },
  { id: 'front-title-copy-100-copy-101', vertices: [[0.354,0.352],[0.638,0.321],[0.633,0.468],[0.348,0.495]],
    text: 'Be lie —-ve?.', font: '100px "Oceanside Typewriter", Georgia', lineHeight: 100, color: '#000', padding: 0, rotation: -5 },
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
};

export function PretextTypography({
  backgroundSrc,
  backgroundAlpha = 0.2,
  polygons = DEFAULT_POLYGONS,
  config = DEFAULT_CONFIG,
  className,
  style,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bgImg = useRef<HTMLImageElement | null>(null);
  const [bgReady, setBgReady] = useState(!backgroundSrc);
  const [fontReady, setFontReady] = useState(false);
  const ready = bgReady && fontReady;

  // 커스텀 폰트 로드 (FontFace API)
  useEffect(() => {
    const BASE = import.meta.env.BASE_URL;
    const fontUrl = `${BASE}assets/fonts/OceansideTypewriter.ttf`;
    const face = new FontFace('Oceanside Typewriter', `url(${fontUrl})`);
    face.load().then(loaded => {
      document.fonts.add(loaded);
      setFontReady(true);
    }).catch(() => {
      console.warn('[PretextTypography] Failed to load Oceanside Typewriter, using fallback');
      setFontReady(true);
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
        renderOutlineText(ctx, poly, cw, ch);
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

        // 피벗: fanPivot 꼭짓점 or 폴리곤 중심
        const pivIdx = poly.fanPivot ?? 0;
        const pivVert = poly.vertices[pivIdx % poly.vertices.length];
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
            ctx.fillText(line.text, drawX, ry);
            ctx.restore();

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

      if (Math.abs(rotDeg) < 0.5) {
        // 수평
        const { top, bottom } = getPolygonYRange(poly.vertices, ch);
        yMin = top; yMax = bottom;
        spanFn = (y) => getPolygonSpanAtY(poly.vertices, y, cw, ch);
        ctx.save();
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

          ctx.fillText(line.text, drawX, y);
          cursor = range.end;
          y += poly.lineHeight;
        }
      }
      } // repeat loop

      ctx.restore();
    }
  }, [polygons, config, backgroundAlpha]);

  // 렌더 — polygons 변경 시 강제 재렌더
  const polygonsKey = JSON.stringify(polygons);
  useEffect(() => {
    if (ready) render();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, render, polygonsKey, config]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        display: 'block',
        maxWidth: '100%',
        height: 'auto',
        ...style,
      }}
    />
  );
}

export { DEFAULT_POLYGONS };
