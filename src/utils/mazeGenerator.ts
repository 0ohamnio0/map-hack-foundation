/**
 * Recursive backtracker maze generator.
 * Returns a 2D grid where each cell stores which walls are open.
 */

export interface MazeCell {
  x: number;
  y: number;
  walls: { north: boolean; south: boolean; east: boolean; west: boolean };
  visited: boolean;
}

export interface MazeData {
  width: number;
  height: number;
  cells: MazeCell[][];
  /** Wall segments as [x, z] positions in world space */
  wallPositions: { x: number; z: number; scaleX: number; scaleZ: number }[];
  /** Start cell grid coords */
  start: { x: number; y: number };
  /** End cell grid coords */
  end: { x: number; y: number };
}

type Dir = 'north' | 'south' | 'east' | 'west';
const DIRS: { dir: Dir; opposite: Dir; dx: number; dy: number }[] = [
  { dir: 'north', opposite: 'south', dx: 0, dy: -1 },
  { dir: 'south', opposite: 'north', dx: 0, dy: 1 },
  { dir: 'east', opposite: 'west', dx: 1, dy: 0 },
  { dir: 'west', opposite: 'east', dx: -1, dy: 0 },
];

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateMaze(width: number, height: number, seed?: number, cellSize = 2): MazeData {
  // Init grid
  const cells: MazeCell[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      cells[y][x] = {
        x, y, visited: false,
        walls: { north: true, south: true, east: true, west: true },
      };
    }
  }

  // Recursive backtracker
  const stack: MazeCell[] = [];
  const startCell = cells[0][0];
  startCell.visited = true;
  stack.push(startCell);

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const neighbors = shuffle(DIRS)
      .map(d => {
        const nx = current.x + d.dx;
        const ny = current.y + d.dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && !cells[ny][nx].visited) {
          return { cell: cells[ny][nx], dir: d.dir, opposite: d.opposite };
        }
        return null;
      })
      .filter(Boolean) as { cell: MazeCell; dir: Dir; opposite: Dir }[];

    if (neighbors.length === 0) {
      stack.pop();
    } else {
      const { cell: next, dir, opposite } = neighbors[0];
      current.walls[dir] = false;
      next.walls[opposite] = false;
      next.visited = true;
      stack.push(next);
    }
  }

  // Convert to wall positions for 3D rendering
  const CELL = cellSize;
  const WALL_THICKNESS = 0.15;
  const wallPositions: MazeData['wallPositions'] = [];

  // Outer boundary walls
  // Top boundary
  wallPositions.push({ x: (width * CELL) / 2, z: 0, scaleX: width * CELL + WALL_THICKNESS, scaleZ: WALL_THICKNESS });
  // Bottom boundary
  wallPositions.push({ x: (width * CELL) / 2, z: height * CELL, scaleX: width * CELL + WALL_THICKNESS, scaleZ: WALL_THICKNESS });
  // Left boundary
  wallPositions.push({ x: 0, z: (height * CELL) / 2, scaleX: WALL_THICKNESS, scaleZ: height * CELL });
  // Right boundary
  wallPositions.push({ x: width * CELL, z: (height * CELL) / 2, scaleX: WALL_THICKNESS, scaleZ: height * CELL });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];
      const wx = x * CELL + CELL / 2;
      const wz = y * CELL + CELL / 2;

      // South wall
      if (cell.walls.south) {
        wallPositions.push({
          x: wx,
          z: wz + CELL / 2,
          scaleX: CELL,
          scaleZ: WALL_THICKNESS,
        });
      }
      // East wall
      if (cell.walls.east) {
        wallPositions.push({
          x: wx + CELL / 2,
          z: wz,
          scaleX: WALL_THICKNESS,
          scaleZ: CELL,
        });
      }
    }
  }

  return {
    width, height, cells, wallPositions,
    start: { x: 0, y: 0 },
    end: { x: width - 1, y: height - 1 },
  };
}

/** Convert grid coords to world position (center of cell) */
export function cellToWorld(gx: number, gy: number, cellSize = 2): { x: number; z: number } {
  return { x: gx * cellSize + cellSize / 2, z: gy * cellSize + cellSize / 2 };
}
