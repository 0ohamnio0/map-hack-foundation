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

export interface MazeOptions {
  /** Deterministic seed. If omitted, a random seed is generated. */
  seed?: number;
  /**
   * 0 = perfect maze (no cycles).
   * >0 = post-process removes that fraction of inner walls,
   * making the layout more open / arena-like.
   */
  removalRatio?: number;
  /** 중앙 셀에 ㄱ자 코너(북+서 벽) 강제 — 시착실 고정용. 끊긴 영역은 자동 재연결. */
  forceCenterCorner?: boolean;
  /** 이 셀의 4면 벽을 열어둠 — 약 픽업 후 재생성 시 플레이어가 벽을 마주보지 않게(어느 방향이든 통로). */
  openAround?: { x: number; y: number };
}

type Dir = 'north' | 'south' | 'east' | 'west';
const DIRS: { dir: Dir; opposite: Dir; dx: number; dy: number }[] = [
  { dir: 'north', opposite: 'south', dx: 0, dy: -1 },
  { dir: 'south', opposite: 'north', dx: 0, dy: 1 },
  { dir: 'east', opposite: 'west', dx: 1, dy: 0 },
  { dir: 'west', opposite: 'east', dx: -1, dy: 0 },
];

/** Mulberry32 — small, fast, seeded PRNG. Same seed = same sequence. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** (0,0)에서 통로로 도달 가능한 셀 집합 */
function bfsReachable(cells: MazeCell[][], w: number, h: number): Set<string> {
  const reach = new Set<string>(['0,0']);
  const stack: [number, number][] = [[0, 0]];
  while (stack.length) {
    const [x, y] = stack.pop()!;
    const c = cells[y][x].walls;
    const step = (nx: number, ny: number, open: boolean) => {
      if (open && nx >= 0 && nx < w && ny >= 0 && ny < h) {
        const k = `${nx},${ny}`;
        if (!reach.has(k)) { reach.add(k); stack.push([nx, ny]); }
      }
    };
    step(x, y - 1, !c.north);
    step(x, y + 1, !c.south);
    step(x - 1, y, !c.west);
    step(x + 1, y, !c.east);
  }
  return reach;
}

/** 끊긴 영역을 인접 도달셀과 통로로 이어 전체 연결 복구. protect로 특정 벽(강제 코너)은 안 엶. */
function ensureConnected(
  cells: MazeCell[][], w: number, h: number,
  protect: (x: number, y: number, dir: Dir) => boolean,
): void {
  const opp: Record<Dir, Dir> = { north: 'south', south: 'north', east: 'west', west: 'east' };
  for (let pass = 0; pass < w * h; pass++) {
    const reach = bfsReachable(cells, w, h);
    if (reach.size === w * h) return;
    let opened = false;
    for (let y = 0; y < h && !opened; y++) {
      for (let x = 0; x < w && !opened; x++) {
        if (reach.has(`${x},${y}`)) continue;
        const tries: { dir: Dir; nx: number; ny: number }[] = [
          { dir: 'north', nx: x, ny: y - 1 }, { dir: 'south', nx: x, ny: y + 1 },
          { dir: 'west', nx: x - 1, ny: y }, { dir: 'east', nx: x + 1, ny: y },
        ];
        for (const { dir, nx, ny } of tries) {
          if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
          if (!reach.has(`${nx},${ny}`)) continue;
          if (protect(x, y, dir)) continue;
          cells[y][x].walls[dir] = false;
          cells[ny][nx].walls[opp[dir]] = false;
          opened = true;
          break;
        }
      }
    }
    if (!opened) return;
  }
}

export function generateMaze(
  width: number,
  height: number,
  options: MazeOptions = {},
  cellSize = 2,
): MazeData {
  const seed = options.seed ?? Math.floor(Math.random() * 0xFFFFFFFF);
  const removalRatio = Math.max(0, Math.min(1, options.removalRatio ?? 0));
  const rng = mulberry32(seed);

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
    const neighbors = shuffle(DIRS, rng)
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

  // Post-process: remove a fraction of remaining inner walls to add cycles.
  // Drug effects use this to vary "openness" of the same maze geometry.
  if (removalRatio > 0) {
    const innerWalls: { cell: MazeCell; dir: 'south' | 'east' }[] = [];
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const c = cells[y][x];
        if (c.walls.south && y < height - 1) innerWalls.push({ cell: c, dir: 'south' });
        if (c.walls.east && x < width - 1) innerWalls.push({ cell: c, dir: 'east' });
      }
    }
    const removeCount = Math.floor(innerWalls.length * removalRatio);
    const shuffled = shuffle(innerWalls, rng);
    for (let i = 0; i < removeCount; i++) {
      const { cell, dir } = shuffled[i];
      cell.walls[dir] = false;
      if (dir === 'south') {
        cells[cell.y + 1][cell.x].walls.north = false;
      } else {
        cells[cell.y][cell.x + 1].walls.west = false;
      }
    }
  }

  // 시착실 고정 — 중앙 셀에 ㄱ자 코너(북+서 벽) 강제. 끊긴 영역은 강제 코너 보호하며 재연결.
  if (options.forceCenterCorner) {
    const ccx = Math.floor(width / 2);
    const ccy = Math.floor(height / 2);
    cells[ccy][ccx].walls.north = true;
    cells[ccy][ccx].walls.west = true;
    if (ccy > 0) cells[ccy - 1][ccx].walls.south = true;
    if (ccx > 0) cells[ccy][ccx - 1].walls.east = true;
    // 진입 통로 — 남쪽 개방 (부스는 코너 반대쪽 SE로 열림)
    if (ccy < height - 1) { cells[ccy][ccx].walls.south = false; cells[ccy + 1][ccx].walls.north = false; }
    const protect = (x: number, y: number, dir: Dir): boolean =>
      (x === ccx && y === ccy && (dir === 'north' || dir === 'west')) ||
      (x === ccx && y === ccy - 1 && dir === 'south') ||
      (x === ccx - 1 && y === ccy && dir === 'east');
    ensureConnected(cells, width, height, protect);
  }

  // 플레이어 칸 4면 개방 — 약 픽업 후 재생성에서 정면이 벽이 되어 "유령 안 보임"으로 보이던 문제 차단.
  // (forceCenterCorner/ensureConnected 이후 — 벽을 열기만 하므로 연결성 깨짐 없음)
  if (options.openAround) {
    const { x: ax, y: ay } = options.openAround;
    if (ax >= 0 && ax < width && ay >= 0 && ay < height) {
      const c = cells[ay][ax];
      if (ay > 0)          { c.walls.north = false; cells[ay - 1][ax].walls.south = false; }
      if (ay < height - 1) { c.walls.south = false; cells[ay + 1][ax].walls.north = false; }
      if (ax > 0)          { c.walls.west  = false; cells[ay][ax - 1].walls.east  = false; }
      if (ax < width - 1)  { c.walls.east  = false; cells[ay][ax + 1].walls.west  = false; }
    }
  }

  // Convert to wall positions for 3D rendering
  const CELL = cellSize;
  const WALL_THICKNESS = 0.4;
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
