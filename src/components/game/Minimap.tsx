import React, { useEffect, useRef } from 'react';
import type { MazeData } from '@/utils/mazeGenerator';

interface Props {
  maze: MazeData;
  playerX: number;
  playerZ: number;
  cellSize?: number;
}

const MINIMAP_SIZE = 160;
const PADDING = 12;

export const Minimap: React.FC<Props> = ({ maze, playerX, playerZ, cellSize = 2 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scale = MINIMAP_SIZE / (maze.width * cellSize);
    const res = MINIMAP_SIZE;
    canvas.width = res;
    canvas.height = res;

    // Background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, res, res);

    // Draw walls
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1;

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
    const ex = maze.end.x * cellSize * scale + (cellSize * scale) / 2;
    const ey = maze.end.y * cellSize * scale + (cellSize * scale) / 2;
    ctx.fillStyle = '#4f4';
    ctx.beginPath();
    ctx.arc(ex, ey, 3, 0, Math.PI * 2);
    ctx.fill();

    // Player dot
    const px = playerX * scale;
    const pz = playerZ * scale;
    ctx.fillStyle = '#ff3333';
    ctx.shadowColor = '#ff0000';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(px, pz, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [maze, playerX, playerZ, cellSize]);

  return (
    <div style={{
      position: 'fixed',
      bottom: PADDING,
      right: PADDING,
      width: MINIMAP_SIZE,
      height: MINIMAP_SIZE,
      border: '1px solid rgba(255,255,255,0.15)',
      zIndex: 200,
      pointerEvents: 'none',
    }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
};
