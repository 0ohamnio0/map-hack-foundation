import React, { useMemo } from 'react';

const KEY_UNIT = 28;
const KEY_GAP = 3;

type KeyDef = { label: string; w?: number; id?: string };

const ROWS: KeyDef[][] = [
  [
    { label: 'Tab', w: 1.5 },
    { label: 'Q' }, { label: 'W' }, { label: 'E' }, { label: 'R' }, { label: 'T' },
    { label: 'Y' }, { label: 'U' }, { label: 'I' }, { label: 'O' }, { label: 'P' },
    { label: '[' }, { label: ']' }, { label: '\\', w: 1.5 },
  ],
  [
    { label: 'Caps', w: 1.75 },
    { label: 'A' }, { label: 'S' }, { label: 'D' }, { label: 'F' }, { label: 'G' },
    { label: 'H' }, { label: 'J' }, { label: 'K' }, { label: 'L' },
    { label: ';' }, { label: "'" }, { label: '↵', w: 2.25 },
  ],
  [
    { label: '⇧', w: 2.25, id: 'L⇧' },
    { label: 'Z' }, { label: 'X' }, { label: 'C' }, { label: 'V' }, { label: 'B' },
    { label: 'N' }, { label: 'M' }, { label: ',' }, { label: '.' }, { label: '/' },
    { label: '⇧', w: 2.75, id: 'R⇧' },
  ],
  [
    { label: 'Ctrl', w: 1.5 },
    { label: '⌥' },
    { label: '⌘', w: 1.25 },
    { label: 'Space', w: 6.25, id: 'Space' },
    { label: '⌘', w: 1.25 },
    { label: '⌥' },
    { label: 'Fn' },
    { label: 'Ctrl', w: 1.5 },
  ],
];

const ACTIVE_KEYBOARD = new Set(['Q', 'W', 'A', 'S', 'D', 'E', 'L⇧', 'Space']);
const ACTIVE_ARROWS = new Set(['↑', '←', '↓', '→']);

type AnnotDir = 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right';
type Annot = { id: string; label: string; dir: AnnotDir; dist?: number; elbow?: number };

const ANNOTATIONS: Annot[] = [
  { id: 'Q', label: 'TOGGLE · 토글', dir: 'up-left', dist: 22, elbow: 90 },
  { id: 'W', label: 'MOVE · 이동', dir: 'up', dist: 50 },
  { id: 'E', label: 'INTERACT · 상호작용', dir: 'up-right', dist: 22, elbow: 110 },
  { id: 'L⇧', label: 'RUN · 달리기', dir: 'left', dist: 40 },
  { id: 'Space', label: 'JUMP · 점프', dir: 'down', dist: 36 },
];

const LINE_STROKE = 'rgba(255, 255, 255, 0.5)';
const LABEL_FILL = 'rgba(255, 255, 255, 0.75)';
const LABEL_FONT = '"Unifont", monospace';
const LINE_WIDTH = 0.7;
const LABEL_GAP = 8;
const LABEL_FONT_SIZE = 9;
const LABEL_LETTER_SPACING = 2;

const useKeyPositions = () => useMemo(() => {
  const positions: Record<string, { cx: number; cy: number; left: number; right: number; top: number; bottom: number }> = {};
  let maxX = 0;
  ROWS.forEach((row, ri) => {
    let x = 0;
    const y = ri * (KEY_UNIT + KEY_GAP);
    row.forEach((k) => {
      const w = (k.w ?? 1) * KEY_UNIT + ((k.w ?? 1) - 1) * KEY_GAP;
      const id = k.id ?? k.label;
      if (!positions[id]) {
        positions[id] = {
          cx: x + w / 2,
          cy: y + KEY_UNIT / 2,
          left: x,
          right: x + w,
          top: y,
          bottom: y + KEY_UNIT,
        };
      }
      x += w + KEY_GAP;
    });
    maxX = Math.max(maxX, x - KEY_GAP);
  });
  const height = ROWS.length * KEY_UNIT + (ROWS.length - 1) * KEY_GAP;
  return { positions, width: maxX, height };
}, []);

const keyStyle = (w: number, active: boolean): React.CSSProperties => {
  const width = w * KEY_UNIT + (w - 1) * KEY_GAP;
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width,
    height: KEY_UNIT,
    fontSize: 9,
    fontFamily: LABEL_FONT,
    flexShrink: 0,
    boxSizing: 'border-box',
    lineHeight: 1,
    border: `1px solid ${active ? '#ffffff' : '#3a3a3a'}`,
    background: 'transparent',
    color: active ? '#ffffff' : '#3a3a3a',
    borderRadius: 2,
  };
};

const Key: React.FC<{ k: KeyDef; active?: boolean }> = ({ k, active }) => (
  <div style={keyStyle(k.w ?? 1, !!active)}>{k.label}</div>
);

const Mouse: React.FC = () => (
  <div style={{
    width: 46,
    height: 70,
    border: '1px solid #ffffff',
    borderRadius: '22px 22px 14px 14px',
    position: 'relative',
    boxSizing: 'border-box',
    background: 'transparent',
  }}>
    <div style={{
      position: 'absolute',
      top: 10,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 4,
      height: 11,
      border: '1px solid #ffffff',
      borderRadius: 2,
      boxSizing: 'border-box',
    }} />
    <div style={{
      position: 'absolute',
      top: 0,
      left: '50%',
      width: 1,
      height: 28,
      background: '#3a3a3a',
    }} />
  </div>
);

const ArrowPad: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: KEY_GAP, alignItems: 'flex-start' }}>
    <div style={{ paddingLeft: KEY_UNIT + KEY_GAP }}>
      <Key k={{ label: '↑' }} active={ACTIVE_ARROWS.has('↑')} />
    </div>
    <div style={{ display: 'flex', gap: KEY_GAP }}>
      <Key k={{ label: '←' }} active={ACTIVE_ARROWS.has('←')} />
      <Key k={{ label: '↓' }} active={ACTIVE_ARROWS.has('↓')} />
      <Key k={{ label: '→' }} active={ACTIVE_ARROWS.has('→')} />
    </div>
  </div>
);

const PAD_X = 200;
const PAD_Y = 110;
const SECTION_GAP = 30;
const ARROW_PAD_WIDTH = KEY_UNIT * 3 + KEY_GAP * 2;
const ARROW_PAD_HEIGHT = KEY_UNIT * 2 + KEY_GAP;
const MOUSE_WIDTH = 46;
const MOUSE_HEIGHT = 70;

export const KeyboardHints: React.FC = () => {
  const { positions, width: kbWidth, height: kbHeight } = useKeyPositions();

  const arrowLeft = PAD_X + kbWidth + SECTION_GAP;
  const arrowTop = PAD_Y + kbHeight - ARROW_PAD_HEIGHT;

  const mouseLeft = arrowLeft + ARROW_PAD_WIDTH + SECTION_GAP;
  const mouseTop = PAD_Y + kbHeight - MOUSE_HEIGHT;

  const totalWidth = mouseLeft + MOUSE_WIDTH + PAD_X;
  const totalHeight = kbHeight + PAD_Y * 2;

  const arrowDownCx = arrowLeft + KEY_UNIT + KEY_GAP + KEY_UNIT / 2;
  const arrowDownBottom = arrowTop + KEY_UNIT + KEY_GAP + KEY_UNIT;

  const mouseCx = mouseLeft + MOUSE_WIDTH / 2;
  const mouseBottom = mouseTop + MOUSE_HEIGHT;

  const SIDE_DIST = 36;

  return (
    <div style={{ position: 'relative', width: totalWidth, height: totalHeight }}>
      <div style={{
        position: 'absolute',
        left: PAD_X,
        top: PAD_Y,
        display: 'flex',
        flexDirection: 'column',
        gap: KEY_GAP,
      }}>
        {ROWS.map((row, i) => (
          <div key={i} style={{ display: 'flex', gap: KEY_GAP }}>
            {row.map((k, j) => {
              const id = k.id ?? k.label;
              return <Key key={j} k={k} active={ACTIVE_KEYBOARD.has(id)} />;
            })}
          </div>
        ))}
      </div>

      <div style={{ position: 'absolute', left: arrowLeft, top: arrowTop }}>
        <ArrowPad />
      </div>

      <div style={{ position: 'absolute', left: mouseLeft, top: mouseTop }}>
        <Mouse />
      </div>

      <svg
        width={totalWidth}
        height={totalHeight}
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', overflow: 'visible' }}
      >
        {ANNOTATIONS.map((a) => {
          const pos = positions[a.id];
          if (!pos) return null;
          const cx = pos.cx + PAD_X;
          const cy = pos.cy + PAD_Y;
          const dist = a.dist ?? 36;

          if (a.dir === 'up-left' || a.dir === 'up-right') {
            const elbow = a.elbow ?? 80;
            const sign = a.dir === 'up-left' ? -1 : 1;
            const x1 = cx;
            const y1 = pos.top + PAD_Y;
            const xm = cx;
            const ym = y1 - dist;
            const x2 = xm + sign * elbow;
            const y2 = ym;
            const textX = x2 + sign * LABEL_GAP;
            const textY = y2 + LABEL_FONT_SIZE / 2 - 1;
            const textAnchor: 'start' | 'end' = a.dir === 'up-left' ? 'end' : 'start';
            return (
              <g key={a.id}>
                <polyline
                  points={`${x1},${y1} ${xm},${ym} ${x2},${y2}`}
                  stroke={LINE_STROKE}
                  strokeWidth={LINE_WIDTH}
                  fill="none"
                />
                <text
                  x={textX}
                  y={textY}
                  fill={LABEL_FILL}
                  fontSize={LABEL_FONT_SIZE}
                  fontFamily={LABEL_FONT}
                  letterSpacing={LABEL_LETTER_SPACING}
                  textAnchor={textAnchor}
                >
                  {a.label}
                </text>
              </g>
            );
          }

          let x1 = cx, y1 = cy, x2 = cx, y2 = cy;
          let textX = cx, textY = cy, textAnchor: 'start' | 'middle' | 'end' = 'middle';
          if (a.dir === 'up') {
            y1 = pos.top + PAD_Y;
            y2 = y1 - dist;
            textY = y2 - LABEL_GAP;
          } else if (a.dir === 'down') {
            y1 = pos.bottom + PAD_Y;
            y2 = y1 + dist;
            textY = y2 + LABEL_GAP + LABEL_FONT_SIZE;
          } else if (a.dir === 'left') {
            x1 = pos.left + PAD_X;
            x2 = x1 - dist;
            textX = x2 - LABEL_GAP;
            textY = cy + LABEL_FONT_SIZE / 2 - 1;
            textAnchor = 'end';
          } else {
            x1 = pos.right + PAD_X;
            x2 = x1 + dist;
            textX = x2 + LABEL_GAP;
            textY = cy + LABEL_FONT_SIZE / 2 - 1;
            textAnchor = 'start';
          }
          return (
            <g key={a.id}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={LINE_STROKE} strokeWidth={LINE_WIDTH} />
              <text
                x={textX}
                y={textY}
                fill={LABEL_FILL}
                fontSize={LABEL_FONT_SIZE}
                fontFamily={LABEL_FONT}
                letterSpacing={LABEL_LETTER_SPACING}
                textAnchor={textAnchor}
              >
                {a.label}
              </text>
            </g>
          );
        })}

        <line
          x1={arrowDownCx}
          y1={arrowDownBottom}
          x2={arrowDownCx}
          y2={arrowDownBottom + SIDE_DIST}
          stroke={LINE_STROKE}
          strokeWidth={LINE_WIDTH}
        />
        <text
          x={arrowDownCx}
          y={arrowDownBottom + SIDE_DIST + LABEL_GAP + LABEL_FONT_SIZE}
          fill={LABEL_FILL}
          fontSize={LABEL_FONT_SIZE}
          fontFamily={LABEL_FONT}
          letterSpacing={LABEL_LETTER_SPACING}
          textAnchor="middle"
        >
          MOVE · 이동
        </text>

        <line
          x1={mouseCx}
          y1={mouseBottom}
          x2={mouseCx}
          y2={mouseBottom + SIDE_DIST}
          stroke={LINE_STROKE}
          strokeWidth={LINE_WIDTH}
        />
        <text
          x={mouseCx}
          y={mouseBottom + SIDE_DIST + LABEL_GAP + LABEL_FONT_SIZE}
          fill={LABEL_FILL}
          fontSize={LABEL_FONT_SIZE}
          fontFamily={LABEL_FONT}
          letterSpacing={LABEL_LETTER_SPACING}
          textAnchor="middle"
        >
          LOOK · 둘러보기
        </text>
      </svg>
    </div>
  );
};

export default KeyboardHints;
