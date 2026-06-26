import React, { useEffect, useRef } from 'react';
import type { MazeData } from '@/utils/mazeGenerator';

export interface MinimapMarker {
  /** World-space X */
  x: number;
  /** World-space Z */
  z: number;
  color: string;
  radius?: number;
  glow?: boolean;
}

interface Props {
  maze: MazeData;
  playerX: number;
  playerZ: number;
  cellSize?: number;
  markers?: MinimapMarker[];
  /** Show the auto exit dot at maze.end. Default true. */
  showExit?: boolean;
}

const MINIMAP_SIZE = 320;
const PADDING = 12;

export const Minimap: React.FC<Props> = ({ maze, playerX, playerZ, cellSize = 2, markers, showExit = true }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const res = 120; // 저해상 캔버스 → CSS pixelated 업스케일로 도트(픽셀) 룩
    const scale = res / (maze.width * cellSize);
    canvas.width = res;
    canvas.height = res;

    // Background — 완전 투명 (블랙 배경 제거). 가시성은 라인 색·굵기로.
    ctx.clearRect(0, 0, res, res);
    ctx.imageSmoothingEnabled = false;

    // Draw walls — 진하고 굵은 픽셀 라인
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'square';

    for (let y = 0; y < maze.height; y++) {
      for (let x = 0; x < maze.width; x++) {
        const cell = maze.cells[y][x];
        const cx = x * cellSize * scale;
        const cy = y * cellSize * scale;
        const cs = cellSize * scale;

        if (cell.walls.north) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + cs, cy);
          ctx.stroke();
        }
        if (cell.walls.west) {
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx, cy + cs);
          ctx.stroke();
        }
        // Right boundary
        if (x === maze.width - 1 && cell.walls.east) {
          ctx.beginPath();
          ctx.moveTo(cx + cs, cy);
          ctx.lineTo(cx + cs, cy + cs);
          ctx.stroke();
        }
        // Bottom boundary
        if (y === maze.height - 1 && cell.walls.south) {
          ctx.beginPath();
          ctx.moveTo(cx, cy + cs);
          ctx.lineTo(cx + cs, cy + cs);
          ctx.stroke();
        }
      }
    }

    // Exit marker
    if (showExit) {
      const ex = maze.end.x * cellSize * scale + (cellSize * scale) / 2;
      const ey = maze.end.y * cellSize * scale + (cellSize * scale) / 2;
      ctx.fillStyle = '#4f4';
      ctx.beginPath();
      ctx.arc(ex, ey, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Custom markers
    if (markers) {
      markers.forEach(m => {
        const mx = m.x * scale;
        const mz = m.z * scale;
        if (m.glow) {
          ctx.shadowColor = m.color;
          ctx.shadowBlur = 5;
        }
        ctx.fillStyle = m.color;
        ctx.beginPath();
        ctx.arc(mx, mz, m.radius ?? 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      });
    }

    // Player dot
    const px = playerX * scale;
    const pz = playerZ * scale;
    ctx.fillStyle = '#ff69b4';
    ctx.shadowColor = '#ff1493';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(px, pz, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [maze, playerX, playerZ, cellSize, markers, showExit]);

  return (
    <div style={{
      position: 'fixed',
      bottom: PADDING,
      right: PADDING,
      width: MINIMAP_SIZE,
      height: MINIMAP_SIZE,
      border: '5px solid rgba(255,255,255,0.8)', // 픽셀 벽 굵기·색과 통일 (테두리만 얇던 문제)
      zIndex: 200,
      pointerEvents: 'none',
    }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', imageRendering: 'pixelated' }} />
    </div>
  );
};
