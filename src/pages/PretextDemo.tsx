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

import { useState, useCallback, useRef, useEffect } from 'react';
import {
  PretextTypography,
  DEFAULT_CONFIG,
  DEFAULT_POLYGONS,
  type TypographyConfig,
  type TextPolygon,
} from '@/components/effects/PretextTypography';
import { InkBleed } from '@/components/effects/InkBleed';

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

export default function PretextDemo() {
  const saved = useRef(loadSaved());

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

  // 자동 저장 — 상태 변경 시 localStorage에 저장
  useEffect(() => {
    const state = { polygons, config, bgAlpha, useBg };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [polygons, config, bgAlpha, useBg]);

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

  // Export
  const exportJSON = useCallback(() => {
    const json = JSON.stringify(polygons.map(p => ({
      id: p.id, vertices: p.vertices, text: p.text,
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
    <div style={{ display: 'flex', height: '100vh', background: '#f0f0f0' }}>
      {/* ── 좌측 패널 ── */}
      <div style={{
        width: 310, padding: 12, background: '#1a1a1a', color: '#fff',
        display: 'flex', flexDirection: 'column', gap: 4, overflow: 'auto',
        fontFamily: 'monospace', fontSize: 11,
      }}>
        <h3 style={{ margin: 0, fontSize: 14 }}>Polygon Editor</h3>

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
                  {/* ID */}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <span style={{ width: 24, color: '#888' }}>id</span>
                    <input type="text" value={p.id}
                      onChange={e => updatePoly(pi, { id: e.target.value })}
                      style={inputStyle} />
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

                  {/* Text */}
                  <button onClick={() => setExpandedText(expandedText === p.id ? null : p.id)}
                    style={{ ...btnSmall, width: '100%', textAlign: 'left' }}>
                    {expandedText === p.id ? '▼ Close text' : '▶ Edit text'}
                  </button>
                  {expandedText === p.id && (
                    <textarea value={p.text} rows={5}
                      onChange={e => updatePoly(pi, { text: e.target.value })}
                      style={{ ...inputStyle, resize: 'vertical', width: '100%', minHeight: 60 }} />
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
      </div>

      {/* ── 캔버스 + 오버레이 ── */}
      <div ref={wrapperRef} style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'auto', padding: 20, background: '#e8e8e8',
      }}>
        <div
          style={{ position: 'relative', display: 'inline-block' }}
          onDoubleClick={handleDoubleClick}
        >
          <PretextTypography
            backgroundSrc={useBg ? `${BASE}assets/ch4/outline.png` : undefined}
            backgroundAlpha={bgAlpha}
            polygons={polygons}
            config={config}
            style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.15)', display: 'block' }}
          />

          {/* SVG 핸들 오버레이 — 3레이어: fill → outlines → handles */}
          {editMode && (
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
            />
          )}

          {/* Ink Bleed run button */}
          {!inkBleedActive && (
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
