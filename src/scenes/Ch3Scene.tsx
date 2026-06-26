import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react';
import { Minimap, type MinimapMarker } from '@/components/game/Minimap';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { useGLTF, useAnimations, PerspectiveCamera } from '@react-three/drei';
import { r3f } from '@/lib/r3fTunnel';
import { Suspense } from 'react';
import { PlayerController, type WallAABB, cartTuning } from '@/components/game/PlayerController';
import { SceneExporter } from '@/components/dev/SceneExporter';
import { useGameStore } from '@/store/useGameStore';
import { useSoundManager } from '@/hooks/useSoundManager';
import { generateMaze, cellToWorld, type MazeData } from '@/utils/mazeGenerator';
import { useDevMode } from '@/hooks/useDevMode';
import { useMute } from '@/hooks/useMute';
import { Ch3Effects } from '@/components/effects/ChapterEffects';
import { StarNestOverlay } from '@/components/effects/StarNestOverlay';
import { PixelateEffect, type PixelateEffectImpl } from '@/components/effects/PixelateEffect';
import { ItaewonLayer } from '@/components/game/ItaewonLayer';
import { NoteReader } from '@/components/game/NoteReader';
import { PoemFragment, FRAG_TINT } from '@/components/game/PoemFragment';
import { BATTLE_FRAGMENT_IDS, NPC_FRAGMENT_IDS } from '@/data/ch3Fragments';
import { CH2_NOTES } from '@/data/ch2Notes';
import { SPARKLE_COLOR, DEFAULT_SPARKLE } from '@/components/game/Note';
import { suspendChapterMusic, startElevatorMusic, endElevatorMusic, stopChapterMusic } from '@/lib/chapterMusic';

const MAZE_SIZE = 10;
const CELL_SIZE = 7;
const WALL_HEIGHT = 4;
const SNAP_FACTOR = 64;
const PS1_SNAP = false;   // ⚠️ 임시 off — 바닥 정점 워프가 멀리서 NPC 발 가리는지 확인용. 복구 시 true

function makeSnapMaterial(color: string): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ color });
  mat.onBeforeCompile = (shader) => {
    if (PS1_SNAP) shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      gl_Position.xyz = floor(gl_Position.xyz / gl_Position.w * ${SNAP_FACTOR}.0 + 0.5) / ${SNAP_FACTOR}.0 * gl_Position.w;`,
    );
  };
  return mat;
}

const TEX_BASE = `${import.meta.env.BASE_URL ?? '/'}assets/tex/ch3/`;
const ELEV = `${TEX_BASE}elevator/`;
const _texLoader = new THREE.TextureLoader();
// 같은 파일은 한 번만 로드 → clone으로 공유 (GPU 업로드는 source 공유, repeat/offset만 독립). mart_atlas 3중 로드 방지
const _texBase = new Map<string, THREE.Texture>();
const _texClones = new Map<string, THREE.Texture[]>();

function makeSnapMaterialWithTexture(
  texFile: string,
  opts?: { repeat?: number; repeatX?: number; repeatY?: number; offsetX?: number; grayscale?: boolean; emissive?: number; rotateDeg?: number; pixelize?: number; pixelAspect?: number }
): THREE.MeshStandardMaterial {
  let base = _texBase.get(texFile);
  if (!base) {
    base = _texLoader.load(`${TEX_BASE}${texFile}`, () => {
      // 로드 완료 시 모든 clone 재업로드(공유 source에 데이터 반영)
      (_texClones.get(texFile) ?? []).forEach((c) => { c.needsUpdate = true; });
    });
    _texBase.set(texFile, base);
    _texClones.set(texFile, []);
  }
  // 픽셀라이즈 시 밉맵 off — 양자화된 UV가 블록 경계서 급변→밉맵 LOD 튐→경계 어두운 선(테두리) 생기던 것 방지. (메모리도 절감)
  if (opts?.pixelize) {
    base.minFilter = THREE.LinearFilter;
    base.generateMipmaps = false;
    base.needsUpdate = true;
  }
  const tex = base.clone();
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;  // sRGB 이미지 — 미설정 시 linear 오인 → 저대비·뿌옇·회색빛
  if (opts?.pixelize) { tex.minFilter = THREE.LinearFilter; tex.generateMipmaps = false; }
  _texClones.get(texFile)!.push(tex);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(opts?.repeatX ?? opts?.repeat ?? 1, opts?.repeatY ?? opts?.repeat ?? 1);
  if (opts?.offsetX) tex.offset.x = opts.offsetX;
  if (opts?.rotateDeg) { tex.center.set(0.5, 0.5); tex.rotation = (opts.rotateDeg * Math.PI) / 180; }
  const mat = new THREE.MeshStandardMaterial({ color: '#fff', map: tex });
  // 벽 = 빛나는 사이니지: 텍스처를 emissive로 자체발광 (피광이라 세로 벽이 어둡던 문제 해소, 카트/고스트 밝기와 맞춤)
  if (opts?.emissive) {
    mat.emissive = new THREE.Color('#ffffff');
    mat.emissiveMap = tex;
    mat.emissiveIntensity = opts.emissive;
  }
  mat.onBeforeCompile = (shader) => {
    if (PS1_SNAP) shader.vertexShader = shader.vertexShader.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
      gl_Position.xyz = floor(gl_Position.xyz / gl_Position.w * ${SNAP_FACTOR}.0 + 0.5) / ${SNAP_FACTOR}.0 * gl_Position.w;`,
    );
    if (opts?.grayscale) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float __gray = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = vec3(__gray);`,
      );
    }
    // 픽셀라이즈 — map/emissive UV를 격자에 양자화(텍스처 저해상 블록). 환경 머티리얼에만 → npc/cart 자동 제외.
    //   #include 지시문 자체를 양자화 버전으로 교체 (onBeforeCompile 시점엔 chunk가 아직 미확장이라 내부 texture2D는 못 잡음)
    if (opts?.pixelize && opts.pixelize > 0) {
      const PIX = Math.max(6, Math.min(4000, 29 / opts.pixelize));  // 역수형: 작을수록 미세
      // U는 텍스처 가로, V는 세로에 매핑되는데 월드 비율이 달라 정사각 블록이 되려면 pixV = PIX/aspect (aspect=가로/세로 월드비)
      const aspect = opts.pixelAspect ?? 1;
      const pu = PIX.toFixed(2);
      const pv = (PIX / aspect).toFixed(2);
      // 블록 중심(+0.5)을 샘플 → 블록당 단색. 밉맵 off라 테두리선 없음.
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <map_fragment>', `
        #ifdef USE_MAP
          vec2 _pm = vec2(${pu}, ${pv});
          diffuseColor *= texture2D( map, (floor(vMapUv * _pm) + 0.5) / _pm );
        #endif`)
        .replace('#include <emissivemap_fragment>', `
        #ifdef USE_EMISSIVEMAP
          vec2 _pe = vec2(${pu}, ${pv});
          totalEmissiveRadiance *= texture2D( emissiveMap, (floor(vEmissiveMapUv * _pe) + 0.5) / _pe ).rgb;
        #endif`);
    }
  };
  return mat;
}

/** InstancedMesh walls for performance.
 *  args[2] is the GL buffer maxCount — fixed at MAX so the InstancedMesh
 *  isn't recreated on maze regen. Per-frame `count` is set in useEffect
 *  to the actual wall count so we render exactly the new layout. */
const MAX_WALLS = 512;

// 벽 텍스처 — mart_walls/wall_1~4 (각 3168×1344, 2.357:1). 높이고정·폭 늘림없이(repeatX=길이/텍폭).
// 인접 벽끼리 다른 이미지가 오도록 위치 기반 인덱스로 4장 분산.
const WALL_TEX_FILES = ['mart_walls/wall_1.webp', 'mart_walls/wall_2.webp', 'mart_walls/wall_3.webp', 'mart_walls/wall_4.webp', 'mart_walls/other_mart.webp'];
const WALL_TEX_W = (3168 / 1344) * WALL_HEIGHT;  // 텍스처 1장이 벽높이(4)에서 차지하는 가로 월드폭 ≈ 9.43
const WALL_PIXELIZE = 0.2;                        // 환경 픽셀라이즈 강도 (클수록 거침). npc/cart는 미적용
const BOUND_PAIR = [1, 3];                        // (비-빈네모) 경계벽에 CELL 단위로 번갈아 깔 두 텍스처 (wall_2, wall_4)
// 빈 네모(마지막 단계) 전용 — 경계벽 전부를 이 빈 진열대로 채움. 자체 종횡비(1500×779)로 repeat 계산.
const EMPTY_TEX_FILE = 'mart_walls/empty_mart.webp';
const EMPTY_TEX_W = (1500 / 779) * WALL_HEIGHT;   // ≈ 7.70

const MazeWalls: React.FC<{ maze: MazeData; emptySquare: boolean }> = ({ maze, emptySquare }) => {
  const N = WALL_TEX_FILES.length;
  // 좁은 벽(길이 CELL_SIZE) 텍스처 N장 + 빈 네모 전용 1장
  const narrowRefs = useMemo(() => Array.from({ length: N }, () => React.createRef<THREE.InstancedMesh>()), [N]);
  const emptyRef = useRef<THREE.InstancedMesh>(null);
  const narrowMats = useMemo(() => WALL_TEX_FILES.map((f) =>
    makeSnapMaterialWithTexture(f, { repeatX: CELL_SIZE / WALL_TEX_W, repeatY: 1, emissive: 0.6, pixelize: WALL_PIXELIZE, pixelAspect: WALL_TEX_W / WALL_HEIGHT })), []);
  const emptyMat = useMemo(() => makeSnapMaterialWithTexture(EMPTY_TEX_FILE,
    { repeatX: CELL_SIZE / EMPTY_TEX_W, repeatY: 1, emissive: 0.6, pixelize: WALL_PIXELIZE, pixelAspect: EMPTY_TEX_W / WALL_HEIGHT }), []);

  useEffect(() => {
    const dummy = new THREE.Object3D();
    const nc = new Array(N).fill(0);
    let ec = 0;
    maze.wallPositions.forEach((w) => {
      const isLong = Math.max(w.scaleX, w.scaleZ) > 20;
      if (emptySquare) {
        // 빈 네모 — 긴 경계벽 + 짧은 가장자리벽(바닥행 south·우측열 east) 전부 CELL 단위 empty_mart로
        const longX = w.scaleX >= w.scaleZ;
        const length = longX ? w.scaleX : w.scaleZ;
        const thin = longX ? w.scaleZ : w.scaleX;
        const segN = Math.max(1, Math.round(length / CELL_SIZE));
        const segLen = length / segN;
        const startC = (longX ? w.x : w.z) - length / 2 + segLen / 2;
        for (let s = 0; s < segN; s++) {
          const c = startC + s * segLen;
          dummy.position.set(longX ? c : w.x, WALL_HEIGHT / 2, longX ? w.z : c);
          dummy.scale.set(longX ? segLen : thin, WALL_HEIGHT, longX ? thin : segLen);
          dummy.updateMatrix();
          if (emptyRef.current) emptyRef.current.setMatrixAt(ec++, dummy.matrix);
        }
      } else if (isLong) {
        // 긴 경계벽 — CELL 단위로 쪼개 BOUND_PAIR(wall_2/4) 교차
        const longX = w.scaleX >= w.scaleZ;
        const length = longX ? w.scaleX : w.scaleZ;
        const segN = Math.max(1, Math.round(length / CELL_SIZE));
        const segLen = length / segN;
        const startC = (longX ? w.x : w.z) - length / 2 + segLen / 2;
        for (let s = 0; s < segN; s++) {
          const c = startC + s * segLen;
          dummy.position.set(longX ? c : w.x, WALL_HEIGHT / 2, longX ? w.z : c);
          dummy.scale.set(longX ? segLen : w.scaleX, WALL_HEIGHT, longX ? w.scaleZ : segLen);
          dummy.updateMatrix();
          const idx = BOUND_PAIR[s % 2];
          const m = narrowRefs[idx].current; if (m) m.setMatrixAt(nc[idx]++, dummy.matrix);
        }
      } else {
        dummy.position.set(w.x, WALL_HEIGHT / 2, w.z);
        dummy.scale.set(w.scaleX, WALL_HEIGHT, w.scaleZ);
        dummy.updateMatrix();
        // 인접 벽(같은 run에서 x 또는 z가 CELL씩 변화)끼리 인덱스가 달라짐 → 같은 이미지 옆에 안 옴
        const idx = (((Math.round(w.x / CELL_SIZE) + Math.round(w.z / CELL_SIZE)) % N) + N) % N;
        const m = narrowRefs[idx].current; if (m) m.setMatrixAt(nc[idx]++, dummy.matrix);
      }
    });
    narrowRefs.forEach((r, i) => { if (r.current) { r.current.count = nc[i]; r.current.instanceMatrix.needsUpdate = true; } });
    if (emptyRef.current) { emptyRef.current.count = ec; emptyRef.current.instanceMatrix.needsUpdate = true; }
  }, [maze, narrowRefs, emptySquare, N]);

  return (
    <>
      {narrowMats.map((m, i) => (
        <instancedMesh key={`n${i}`} ref={narrowRefs[i]} args={[undefined, undefined, MAX_WALLS]} material={m} frustumCulled={false}>
          <boxGeometry args={[1, 1, 1]} />
        </instancedMesh>
      ))}
      <instancedMesh ref={emptyRef} args={[undefined, undefined, MAX_WALLS]} material={emptyMat} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
      </instancedMesh>
    </>
  );
};

const MazeFloor: React.FC = () => {
  const size = MAZE_SIZE * CELL_SIZE;
  const material = useMemo(() => makeSnapMaterialWithTexture('floor_tile.webp', { repeat: 16, emissive: 0.6, pixelize: WALL_PIXELIZE }), []);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[size / 2, 0, size / 2]} material={material}>
      <planeGeometry args={[size, size, MAZE_SIZE, MAZE_SIZE]} />
    </mesh>
  );
};

// 천장 — 벽(높이 4) 위로 노출되던 검은 배경을 덮어 "검은 띠"(이동 시 벽 윗단 위 void) 제거
const MazeCeiling: React.FC = () => {
  const size = MAZE_SIZE * CELL_SIZE;
  const material = useMemo(() => makeSnapMaterialWithTexture('ceiling_hvac.webp', { repeatX: 16.67, repeatY: 11.17, emissive: 0.5, rotateDeg: 90, pixelize: WALL_PIXELIZE, pixelAspect: 11.17 / 16.67 }), []);
  return (
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[size / 2, WALL_HEIGHT, size / 2]} material={material}>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
};

const FlickerLight: React.FC = () => {
  const lightRef = useRef<THREE.AmbientLight>(null);
  useFrame(({ clock }) => {
    if (lightRef.current) {
      lightRef.current.intensity = 0.6 + Math.sin(clock.elapsedTime * 8) * 0.08 + Math.sin(clock.elapsedTime * 13) * 0.04;
    }
  });
  return <ambientLight ref={lightRef} intensity={0.6} color="#f0f0e8" />;
};

const MEDICINES = [
  // duration = 효과 minimum 지속 시간 (ms). 그 후 자동 종료. encounter는 ghost cycle 트리거 (효과 종료와 별개)
  { name: 'Lithium Carbonate', color: '#ff3333', effect: 'desaturate', duration: 8000, soundSlot: 'gulp_red', cell: { gx: 2, gy: 2 } },
  { name: 'Aripiprazole', color: '#3366ff', effect: 'blur', duration: 10000, soundSlot: 'gulp_blue', cell: { gx: 5, gy: 3 } },
  { name: 'Quetiapine Fumarate', color: '#ffcc00', effect: 'darken', duration: 8000, soundSlot: 'gulp_yellow', cell: { gx: 3, gy: 6 } },
  { name: 'Alprazolam', color: '#33cc33', effect: 'anxiolytic', duration: 6000, soundSlot: 'gulp_green', cell: { gx: 7, gy: 7 } },
  { name: 'Fluoxetine', color: '#ffffff', effect: 'whiteflash', duration: 1800, soundSlot: 'gulp_white', cell: { gx: 8, gy: 5 } },
];

// 약 먹을수록 미로가 단순해진다 — 픽업 순서(약 종류 무관)대로 벽 제거 비율 단조 증가.
// index = 0-based 픽업 차수. 마지막(5번째 = 흰약)은 1.0 → 내벽 전부 제거 = 빈 정사각형.
const MAZE_REMOVAL_RAMP = [0.15, 0.35, 0.55, 0.78, 1.0];

// 약 이름 영문 → 한글 매핑 (cart 클릭 시 글리치 표기)
const MED_KOREAN: Record<string, string> = {
  'Lithium Carbonate': '기분안정제',
  'Aripiprazole': '항정신병약',
  'Quetiapine Fumarate': '수면제',
  'Alprazolam': '항불안제',
  'Fluoxetine': '항우울제',
};

const GLITCH_CHARS = '!@#$%^&*+=[]{}|<>?/~가나다라마바사아자차카타파하ㅁㄴㅇㄹㅎㅋㅌㅊㅍ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function glitchText(src: string, target: string, progress: number): string {
  const len = Math.max(src.length, target.length);
  let out = '';
  for (let i = 0; i < len; i++) {
    const charProgress = progress * 1.5 - (i / len) * 0.3;
    if (charProgress < 0.2) {
      out += src[i] ?? ' ';
    } else if (charProgress > 0.8) {
      out += target[i] ?? ' ';
    } else {
      out += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
    }
  }
  return out;
}

const GlitchCartButton: React.FC<{ item: string }> = ({ item }) => {
  const [clicked, setClicked] = useState(false);
  const [display, setDisplay] = useState(item);
  // 진짜 물건 담은 것처럼 라벨마다 랜덤 기울기 (마운트 1회 고정)
  const tilt = useMemo(() => (Math.random() * 2 - 1) * 14, []); // ±14deg

  useEffect(() => {
    setDisplay(item);
    setClicked(false);
  }, [item]);

  useEffect(() => {
    if (!clicked) return;
    const A = item;
    const B = MED_KOREAN[item] ?? item;
    const GLITCH_FRAMES = 40; // ~1s @ 25ms tick
    const HOLD_FRAMES = 40;   // ~1s static between glitches
    let direction: 'AB' | 'BA' = 'AB';
    let mode: 'glitch' | 'hold' = 'glitch';
    let frame = 0;
    const interval = setInterval(() => {
      if (mode === 'glitch') {
        frame++;
        if (frame > GLITCH_FRAMES) {
          setDisplay(direction === 'AB' ? B : A);
          mode = 'hold';
          frame = 0;
          return;
        }
        const progress = frame / GLITCH_FRAMES;
        const src = direction === 'AB' ? A : B;
        const dst = direction === 'AB' ? B : A;
        setDisplay(glitchText(src, dst, progress));
      } else {
        frame++;
        if (frame > HOLD_FRAMES) {
          direction = direction === 'AB' ? 'BA' : 'AB';
          mode = 'glitch';
          frame = 0;
        }
      }
    }, 25);
    return () => clearInterval(interval);
  }, [clicked, item]);

  return (
    <button
      onClick={() => { if (!clicked) setClicked(true); }}
      style={{
        padding: '4px 10px',
        fontFamily: '"Unifont", monospace',
        fontSize: 11,
        color: '#fff',
        backgroundColor: 'rgba(0,0,0,0.7)',
        border: '1px solid rgba(255,255,255,0.2)',
        cursor: 'pointer',
        transform: `rotate(${tilt}deg)`,
        transition: 'opacity 0.15s',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.6'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
    >
      {display}
    </button>
  );
};

// 시착실 부스 치수 — 좁고 길쭉. 천장(y=4) 아래로 H≤3.9. (flush 배치가 반폭에 의존하므로 상수 공유)
const FITTING_W = 1.5;
const FITTING_D = 1.5;
const FITTING_H = 3.8;

// --- Fitting room (= space elevator portal) — 중앙 셀 북쪽 변에 고정, 거울은 남(+z)을 향함 ---
// x는 셀 중심에 정렬(=플레이어 그리드 열과 일치) → 거울 바로 정면 열에 설 수 있다. z만 북쪽(−z)으로 밀어
// 부스를 셀 안쪽에 들이고 거울이 남쪽 진입 통로를 마주보게 한다. 반환은 결정적(Ch3Inner·Ch3Scene 동일).
type FittingPlacement = { pos: { x: number; z: number }; nx: number; nz: number };
function findFittingCorner(maze: MazeData, cellSize: number): FittingPlacement {
  const cx0 = Math.floor(maze.width / 2);
  const cy0 = Math.floor(maze.height / 2);
  const nx = -1, nz = -1; // nz=-1 → 거울이 +z(남, 진입 방향)을 향함. nx는 부스 박스 좌우 구성용
  const cw = cellToWorld(cx0, cy0, cellSize);
  // 부스를 셀 중심(그리드 정렬)에 둠 — 유령이 옆벽에 기대면서 정면 접근 가능. 거울은 양면이라 안에서도 보임.
  return { pos: { x: cw.x, z: cw.z }, nx, nz };
}

// 시착실 거울 영상 — pingpong 루프 31종. 진입 시 랜덤 시작 + 종료 시 다음 영상으로 순차 전환.
const MIRROR_VIDEO_BASE = `${import.meta.env.BASE_URL ?? '/'}assets/video/mirror/`;
const MIRROR_VIDEO_COUNT = 31;
const mirrorVideoUrl = (i: number) => `${MIRROR_VIDEO_BASE}mirror_${String(i).padStart(2, '0')}.mp4`;

const MirrorScreen: React.FC<{
  position: [number, number, number];
  rotation: [number, number, number];
  width: number;
  height: number;
}> = ({ position, rotation, width, height }) => {
  const idxRef = useRef(Math.floor(Math.random() * MIRROR_VIDEO_COUNT));
  const { texture, video } = useMemo(() => {
    const v = document.createElement('video');
    v.src = mirrorVideoUrl(idxRef.current);
    v.loop = false; // 종료(ended) 이벤트로 다음 영상 전환
    v.muted = true;
    v.playsInline = true;
    const tex = new THREE.VideoTexture(v);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter; // 픽셀 스냅 룩 유지
    tex.colorSpace = THREE.SRGBColorSpace;
    return { texture: tex, video: v };
  }, []);

  useEffect(() => {
    const onEnded = () => {
      idxRef.current = (idxRef.current + 1) % MIRROR_VIDEO_COUNT;
      video.src = mirrorVideoUrl(idxRef.current);
      video.play().catch(() => {});
    };
    video.addEventListener('ended', onEnded);
    video.play().catch(() => {});
    return () => {
      video.removeEventListener('ended', onEnded);
      video.pause();
      video.removeAttribute('src');
      video.load();
      texture.dispose();
    };
  }, [video, texture]);

  return (
    <mesh position={position} rotation={rotation}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  );
};

/** Fitting room booth — 두 벽(side+back)을 미로 코너에 붙이고 안쪽으로 개방, 거울은 back에 */
const FittingRoom: React.FC<{ worldPos: { x: number; z: number }; nx: number; nz: number; revealed: boolean }> = ({ worldPos, nx, nz, revealed }) => {
  const W = FITTING_W, D = FITTING_D, T = 0.15, H = FITTING_H, Hh = H / 2;
  const Wh = W / 2, Dh = D / 2;
  const FITTING_Y = -0.5; // 부스 전체 Y 하강 (바닥 아래는 가려짐)
  const MIRROR_RAISE = 0.5; // 거울(프레임+그린면)만 다시 올림
  const FRAME_W = 1.3, FRAME_H = FRAME_W * (3915 / 1934); // 틀 비율(세로 김)
  const OPEN_W = FRAME_W * 0.72, OPEN_H = FRAME_H * 0.88; // 개구부(64/82)보다 살짝 크게 → 가장자리가 틀 테두리 뒤로 들어감(틈 없이)
  const mirrorY = Hh + MIRROR_RAISE;
  // 픽셀라이즈를 바닥과 같은 블록 크기로 — 면마다 월드폭이 달라 pixelize 값을 환산
  const FLOOR_BLOCK = ((MAZE_SIZE * CELL_SIZE) / 16) * WALL_PIXELIZE / 29;
  const blkPix = (w: number) => (29 * FLOOR_BLOCK) / w;
  // 커튼 — 4벽. 색 반전 텍스처(curtain_invert.webp) 사용. emissive + 바닥 블록 크기 픽셀라이즈(세로 폴드 유지)
  const curtainMat = useMemo(() => makeSnapMaterialWithTexture('curtain_invert.webp',
    { emissive: 0.4, pixelize: blkPix(FITTING_W), pixelAspect: FITTING_W / FITTING_H }), []);
  // 거울 틀 — 알파(중앙 개구부 투명, 뒤로 그린/영상 비침) + emissive + 바닥 블록 픽셀라이즈
  const frameMat = useMemo(() => {
    const m = makeSnapMaterialWithTexture('mirror_frame.webp',
      { emissive: 0.9, pixelize: blkPix(FRAME_W), pixelAspect: FRAME_W / FRAME_H });
    m.transparent = true;
    m.side = THREE.DoubleSide;
    return m;
  }, []);
  // E.R 로고 데칼 — 뒷 벽(nz 면) 바깥(북쪽) 아래쪽. 빈 네모(revealed)일 때만 드러남.
  const ER_W = W * 0.85, ER_H = ER_W * (996 / 1321);
  const erMat = useMemo(() => makeSnapMaterialWithTexture('er_logo.webp',
    { emissive: 0.7, pixelize: WALL_PIXELIZE, pixelAspect: ER_W / ER_H }), []);
  return (
    <group position={[worldPos.x, FITTING_Y, worldPos.z]}>
      {/* 4면 닫힌 박스 — flush 2면(코너 벽에 붙음) + outer 2면 + 천장. 벽=커튼 텍스처 */}
      {/* Flush side wall — x 모서리(nx) */}
      <mesh position={[nx * Wh, Hh, 0]} material={curtainMat}>
        <boxGeometry args={[T, H, D]} />
      </mesh>
      {/* Flush back wall — z 모서리(nz) */}
      <mesh position={[0, Hh, nz * Dh]} material={curtainMat}>
        <boxGeometry args={[W, H, T]} />
      </mesh>
      {/* Outer side wall — 안쪽 x면 */}
      <mesh position={[-nx * Wh, Hh, 0]} material={curtainMat}>
        <boxGeometry args={[T, H, D]} />
      </mesh>
      {/* Outer front wall — 안쪽 z면 (거울 부착 면) */}
      <mesh position={[0, Hh, -nz * Dh]} material={curtainMat}>
        <boxGeometry args={[W, H, T]} />
      </mesh>
      {/* Ceiling lid */}
      <mesh position={[0, H, 0]}>
        <boxGeometry args={[W, T, D]} />
        <meshStandardMaterial color="#554433" />
      </mesh>
      {/* 거울 영상 (pingpong 루프) — 틀 개구부 크기, 틀 뒤에 둠 */}
      <MirrorScreen
        position={[0, mirrorY, -nz * (Dh + 0.08)]}
        rotation={[0, nz < 0 ? 0 : Math.PI, 0]}
        width={OPEN_W}
        height={OPEN_H}
      />
      {/* 거울 틀 이미지 (알파 — 중앙 개구부로 그린/영상 비침) — 그린 앞에 겹침 */}
      <mesh position={[0, mirrorY, -nz * (Dh + 0.12)]} rotation={[0, nz < 0 ? 0 : Math.PI, 0]} material={frameMat}>
        <planeGeometry args={[FRAME_W, FRAME_H]} />
      </mesh>
      {/* E.R 로고 데칼 — 뒷 벽(nz 면) 바깥 중앙. 빈 네모 전엔 미로벽에 가려 안 보이다 드러남 */}
      {revealed && (
        <mesh position={[0, Hh, nz * (Dh + 0.09)]} rotation={[0, nz < 0 ? Math.PI : 0, 0]} material={erMat}>
          <planeGeometry args={[ER_W, ER_H]} />
        </mesh>
      )}
    </group>
  );
};

// --- Space character (FBX with PBR, R3F overlay) ---
// 우주씬 메인 캐릭터 — mx.pott (Meshy GLB, withSkin + idle 애니메이션)
const SPACE_GLB_URL = `${import.meta.env.BASE_URL}assets/characters_biped/mx_pott/mxpott_idle.glb`;

const SpaceCharacterMesh: React.FC = () => {
  const ref = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(SPACE_GLB_URL);

  // per-instance 클론(스켈레톤 포함) + 정규화 — 렌더 중(useMemo)에 적용.
  //  · 클론: useGLTF 공유 캐시 scene을 직접 변형하면 재생(재마운트) 시 중복 스케일됨 → 클론으로 격리
  //  · useMemo(렌더 중): useEffect면 첫 페인트 후 적용돼 GLB 로드 시 잠깐 거대하게 떴음
  const model = useMemo(() => {
    const c = skeletonClone(scene);
    c.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(c);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const s = 0.513 / maxDim;  // ~1/3 × 0.9
    c.scale.setScalar(s);
    c.position.set(-center.x * s, -center.y * s, -center.z * s);
    return c;
  }, [scene]);

  const { actions, names } = useAnimations(animations, ref);

  // idle 애니메이션 재생
  useEffect(() => {
    const name = names[0];
    if (name && actions[name]) {
      actions[name].reset().fadeIn(0.3).play();
      return () => { actions[name]?.fadeOut(0.3); };
    }
    return undefined;
  }, [actions, names]);

  // 천천히 회전 + 부유
  useFrame((_, delta) => {
    if (ref.current) {
      ref.current.rotation.y += delta * 0.18;
      ref.current.position.y = -0.85 + Math.sin(performance.now() * 0.001) * 0.03;  // 화면 하단 부유
    }
  });

  return (
    <group ref={ref}>
      <primitive object={model} />
    </group>
  );
};
// (mx.pott 15MB는 eager preload 안 함 — 우주씬 진입 시 로드. CH.3 미로 동안 GPU 메모리 절약 → 고스트 로드 여유)

// PixelateEffect는 prop 비반응 → ref+useFrame으로 구동 (CH.2와 동일 패턴).
// 우주씬 끝 PIX_RAMP_MS 동안(캐릭터 풀 opacity 중에) 0→1 픽셀 붕괴 → returning 동안 1 유지하며 페이드.
//   (returning에만 램프하면 동시 fadeout에 가려 안 보임)
const PIX_RAMP_MS = 8000;          // 우주씬 끝 8초 동안 픽셀 붕괴
const SPACE_PIX_MAX_PX = 40;       // 우주 캐릭터 전용 최대 블록(px) — CH.2(14)보다 강함
const SPACE_PIX_MIN_LEVELS = 3;    // 우주 캐릭터 전용 최소 색계조 — CH.2(5)보다 강함
const PixelProgress: React.FC<{ pixRef: React.RefObject<PixelateEffectImpl | null>; phase: CutscenePhase }> = ({ pixRef, phase }) => {
  const startRef = useRef<number | null>(null);
  useFrame(() => {
    if (phase === 'space') {
      if (startRef.current === null) startRef.current = performance.now();
      const elapsed = performance.now() - startRef.current;
      const t = Math.min(Math.max((elapsed - (SPACE_DURATION - PIX_RAMP_MS)) / PIX_RAMP_MS, 0), 1);
      pixRef.current?.setProgressTo(t, SPACE_PIX_MAX_PX, SPACE_PIX_MIN_LEVELS);
    } else if (phase === 'returning') {
      pixRef.current?.setProgressTo(1, SPACE_PIX_MAX_PX, SPACE_PIX_MIN_LEVELS);  // 최대 유지
    } else {
      startRef.current = null;
      pixRef.current?.setProgressTo(0, SPACE_PIX_MAX_PX, SPACE_PIX_MIN_LEVELS);
    }
  });
  return null;
};

const SpaceCharacterCanvas: React.FC<{ phase: CutscenePhase }> = ({ phase }) => {
  const pixRef = useRef<PixelateEffectImpl>(null);
  return (
    <Canvas
      style={{ position: 'fixed', inset: 0, zIndex: 1002, pointerEvents: 'none' }}
      camera={{ fov: 35, position: [0, 0.4, 3.2] }}
      gl={{ alpha: true }}
    >
      <ambientLight intensity={0.45} color="#dde8ff" />
      <directionalLight position={[2, 4, 3]} intensity={1.2} color="#ffffff" />
      <directionalLight position={[-2, 1, -1]} intensity={0.4} color="#88aaff" />
      <Suspense fallback={null}>
        <SpaceCharacterMesh />
      </Suspense>
      <PixelProgress pixRef={pixRef} phase={phase} />
      <EffectComposer>
        <Bloom
          intensity={0.9}
          luminanceThreshold={0.35}
          luminanceSmoothing={0.4}
          mipmapBlur
        />
        <PixelateEffect ref={pixRef} />
      </EffectComposer>
    </Canvas>
  );
};

// --- Elevator Cutscene ---
type CutscenePhase = 'elevator' | 'space' | 'returning' | null;

const ELEVATOR_DURATION = 21000; // 21s elevator interior — 명상적 호흡 확보 (+3s)
const SPACE_DURATION = 42500;    // 42.5s space scene (-2.5s polish)
const RETURN_FADE = 1500;       // 화이트아웃 → 맵 복귀 fade

// 버튼 패널 핫스팟 — baked 패널 bbox 내 로컬 좌표(%). 버튼 n → elevator_btn_(n-1)
const ELEV_BUTTONS: { label: string; x: number; y: number; sound: number }[] = [
  { label: '9', x: 29, y: 22, sound: 8 }, { label: '10', x: 72, y: 22, sound: 9 },
  { label: '7', x: 29, y: 35, sound: 6 }, { label: '8', x: 72, y: 35, sound: 7 },
  { label: '5', x: 29, y: 48, sound: 4 }, { label: '6', x: 72, y: 48, sound: 5 },
  { label: '3', x: 29, y: 62, sound: 2 }, { label: '4', x: 72, y: 62, sound: 3 },
  { label: '1', x: 29, y: 75, sound: 0 }, { label: '2', x: 72, y: 75, sound: 1 },
];

const ElevatorCutscene: React.FC<{
  phase: CutscenePhase;
}> = ({ phase }) => {
  const [floor, setFloor] = useState<string>('01');
  const [lookDir, setLookDir] = useState<'up' | 'down' | null>(null);
  const [stars, setStars] = useState<{ x: number; y: number; size: number; opacity: number; speed: number }[]>([]);
  const [earthY, setEarthY] = useState(80);
  const animRef = useRef<number>(0);
  const { play, loop } = useSoundManager();

  // 엘베 안 룸톤 loop — elevator phase 시작 ~ space 진입 직전까지
  useEffect(() => {
    if (phase === 'elevator') {
      loop('elevator_room', true);
      return () => loop('elevator_room', false);
    }
    return undefined;
  }, [phase, loop]);

  // 도착 ding — space 전환 2초 전 (문 열림 사운드는 우주씬 진입 시 = 실제 문 열리는 순간)
  useEffect(() => {
    if (phase === 'elevator') {
      const dingTimer = setTimeout(() => {
        play('elevator_ding');
      }, ELEVATOR_DURATION - 2000);
      return () => clearTimeout(dingTimer);
    }
    return undefined;
  }, [phase, play]);

  // 우주씬: 진입 시 문 열림 사운드 (실제 문 슬라이드와 동기)
  useEffect(() => {
    if (phase !== 'space') return;
    play('elevator_door');
    return undefined;
  }, [phase, play]);

  // Auto floor counter — 1 → 99 → ★
  useEffect(() => {
    if (phase !== 'elevator') { setFloor('01'); setLookDir(null); return; }
    let count = 1;
    setFloor('01');
    const interval = setInterval(() => {
      count++;
      if (count > 99) {
        setFloor('★');
        clearInterval(interval);
      } else {
        setFloor(String(count).padStart(2, '0'));
      }
    }, 170);
    return () => clearInterval(interval);
  }, [phase]);

  // 위/아래 키(hold) = 세로 패닝: W/↑ → 천장(up), S/↓ → 바닥(down), 떼면 정면(default)
  useEffect(() => {
    if (phase !== 'elevator') return;
    const UP = (e: KeyboardEvent) => e.code === 'ArrowUp' || e.code === 'KeyW';
    const DOWN = (e: KeyboardEvent) => e.code === 'ArrowDown' || e.code === 'KeyS';
    const down = (e: KeyboardEvent) => { if (UP(e)) setLookDir('up'); else if (DOWN(e)) setLookDir('down'); };
    const up = (e: KeyboardEvent) => { if (UP(e) || DOWN(e)) setLookDir(null); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [phase]);

  // Generate stars once
  useEffect(() => {
    const s = Array.from({ length: 200 }, () => ({
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.5 + 0.5,
      opacity: Math.random() * 0.7 + 0.3,
      speed: Math.random() * 0.3 + 0.05,
    }));
    setStars(s);
  }, []);

  // Animate earth rising during space phase
  useEffect(() => {
    if (phase !== 'space') { setEarthY(80); return; }
    let start: number | null = null;
    const animate = (ts: number) => {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / SPACE_DURATION, 1);
      setEarthY(80 - progress * 30); // earth rises from 80% to 50%
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [phase]);

  if (!phase) return null;

  const fadeStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    transition: `opacity ${RETURN_FADE}ms ease`,
    opacity: phase === 'returning' ? 0 : 1,
  };

  // --- Elevator interior ---
  if (phase === 'elevator') {
    // 세로 패닝: full.webp(3:2)을 height 200vh로 깔고(빨강밴드 ≈ 1뷰포트) translateY로 위/아래
    //  up = 0vh(천장), default = -62vh(문·버튼=빨강밴드 31~81%), down = -100vh(바닥)
    const panY = lookDir === 'up' ? '0vh' : lookDir === 'down' ? '-100vh' : '-62vh';
    return (
      <div style={fadeStyle}>
        <style>{`
          @font-face {
            font-family: 'Digital-7';
            src: url('${import.meta.env.BASE_URL}fonts/digital-7.ttf') format('truetype');
            font-display: swap;
          }
          .elev-hotspot {
            position: absolute;
            transform: translate(-50%, -50%);
            width: 38%; height: 11%;
            border-radius: 50%;
            cursor: pointer;
            background: transparent;
          }
        `}</style>

        {/* Viewport — overflow hidden + 진동 shake (내부 전체가 흔들림) */}
        <div style={{
          position: 'absolute', inset: 0, overflow: 'hidden', background: '#000',
          animation: 'elevatorShake 0.1s infinite',
        }}>
          {/* 패닝 컨테이너 = full.webp 이미지 박스(높이 200vh, 3:2). translateY로 상/중/하 */}
          <div style={{
            position: 'absolute', top: 0, left: '50%',
            height: '200vh', aspectRatio: '3 / 2',
            transform: `translateX(-50%) translateY(${panY})`,
            transition: 'transform 0.5s cubic-bezier(0.22, 0.61, 0.36, 1)',
          }}>
            <img src={`${ELEV}full.webp`} alt="" style={{ display: 'block', width: '100%', height: '100%' }} />

            {/* 층 표시기 — baked 디스플레이 스크린(문 위, 중심 49%/23.6%, 6%×3.6%) 안에 그린 카운터 */}
            <div style={{
              position: 'absolute', left: '49%', top: '23.6%', transform: 'translate(-50%, -50%)',
              width: '6%', height: '3.6%', containerType: 'size',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: '"Digital-7", "Unifont", monospace',
              color: '#39ff5a', textShadow: '0 0 0.6vh rgba(57,255,90,0.75)',
              whiteSpace: 'nowrap', overflow: 'hidden',
            }}>
              <span style={{ fontSize: '80cqh', lineHeight: 1, display: 'flex', alignItems: 'center', gap: '0.05em' }}>
                {floor === '★' ? '★' : <>{floor}<span style={{ fontSize: '0.7em' }}>↑</span></>}
              </span>
            </div>

            {/* 버튼 패널 — baked 패널 bbox(x66.8~72.6% / y42.6~67.6%) 위 투명 클릭 핫스팟. 버튼은 baked 그대로 */}
            <div style={{ position: 'absolute', left: '66.8%', top: '42.6%', width: '5.8%', height: '25%' }}>
              {/* 미니 스크린 — 현재 층 (중심 로컬 50%/8%) */}
              <div style={{
                position: 'absolute', left: '50%', top: '8%', transform: 'translate(-50%, -50%)',
                width: '60%', height: '8%', containerType: 'size',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: '"Digital-7", monospace', color: '#39ff5a',
                textShadow: '0 0 0.4vh rgba(57,255,90,0.6)', pointerEvents: 'none',
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}>
                <span style={{ fontSize: '78cqh', lineHeight: 1, display: 'inline-block', transform: floor === '★' ? 'translateX(-0.08em)' : undefined }}>{floor === '★' ? '★' : floor}</span>
              </div>
              {/* 버튼 그리드 — 전반적으로 0.95배(그리드 중심으로 수축). 미니스크린은 영향 없음 */}
              <div style={{ position: 'absolute', inset: 0, transform: 'scale(0.9)', transformOrigin: '50% 55%' }}>
                {ELEV_BUTTONS.map((b) => (
                  <div
                    key={b.label}
                    className="elev-hotspot"
                    style={{ left: `${b.x}%`, top: `${b.y}%` }}
                    onClick={(e) => { e.stopPropagation(); play(`elevator_btn_${b.sound}`); }}
                  />
                ))}
                {/* door close / open */}
                <div className="elev-hotspot" style={{ left: '29%', top: '88%' }}
                  onClick={(e) => { e.stopPropagation(); play('elevator_btn_close'); }} />
                <div className="elev-hotspot" style={{ left: '72%', top: '88%' }}
                  onClick={(e) => { e.stopPropagation(); play('elevator_btn_open'); }} />
              </div>
            </div>
          </div>
        </div>{/* end viewport */}

        {/* 키 힌트 — 패닝 안 할 때만 */}
        <div style={{
          position: 'absolute', bottom: '6%', left: '50%', transform: 'translateX(-50%)',
          fontFamily: '"Unifont", monospace', fontSize: 11, color: 'rgba(255,255,255,0.18)',
          letterSpacing: 3,
          opacity: lookDir ? 0 : 1,
          transition: 'opacity 0.3s ease',
          animation: 'fadeInSlow 3s ease-in forwards',
          pointerEvents: 'none',
        }}>
          ▲ W / ↑ &nbsp;&nbsp; ▼ S / ↓
        </div>

        <style>{`
          @keyframes elevatorShake {
            0% { transform: translate(0, 0); }
            25% { transform: translate(0.4px, 0.6px); }
            50% { transform: translate(-0.3px, 0.4px); }
            75% { transform: translate(0.3px, -0.5px); }
            100% { transform: translate(-0.4px, 0.2px); }
          }
          @keyframes fadeInSlow {
            0% { opacity: 0; }
            100% { opacity: 1; }
          }
        `}</style>
      </div>
    );
  }

  // --- Space scene (STEP 9: StarNest shader background) ---
  if (phase === 'space' || phase === 'returning') {
    return (
      <div style={{ ...fadeStyle, background: '#000' }}>
        {/* STEP 9: Star Nest shader background (REF-7) */}
        <StarNestOverlay duration={SPACE_DURATION / 1000} />

        {/* Main character — mx.pott GLB, floating + slow rotation */}
        <SpaceCharacterCanvas phase={phase} />

        {/* returning: 화이트아웃 제거 — 캐릭터 픽셀 붕괴(0→1) + 씬 fadeout으로 맵 복귀가 보이게 */}

        {/* 문 열림 — 우주씬 위 엘베 인테리어(개구부 투명) + 좌우 도어 슬라이드, 열린 뒤 인테리어 페이드아웃 */}
        <div style={{
          position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 1005, pointerEvents: 'none',
          animation: 'elevDoorsFade 1.7s ease-in forwards',
          willChange: 'opacity', // 마운트 시 미리 레이어 승격 → 문 열릴 때(애니 시작) 200vh 자식이 재래스터화되며 위치가 반짝 점프하는 것 방지
        }}>
          {/* transform 대신 top/margin으로 배치 — translate는 이 200vh 패널을 거대 단일 GPU 레이어로
              승격시켜 레티나(DPR2)에서 GPU 최대 텍스처 한계 초과 → 슬라이드 중 검정/투명 블록 깨짐.
              루트(타일) 레이어에 그려지게 두고, 애니메이션하는 leaf만 작은 레이어로 승격시킨다. */}
          <div style={{
            position: 'absolute', top: '-62vh', left: '50%', marginLeft: '-150vh',
            height: '200vh', aspectRatio: '3 / 2',
          }}>
            <img src={`${ELEV}full_nodoor.webp`} alt="" style={{ display: 'block', width: '100%', height: '100%' }} />
            {/* 도어 개구부 클립 — leaf가 좌우로 슬라이드하며 문틀로 사라짐, 사이로 우주씬 노출 */}
            <div style={{
              position: 'absolute', left: '35.4%', top: '29.25%', width: '26.4%', height: '63.75%', overflow: 'hidden',
            }}>
              <img src={`${ELEV}door_left.webp`} alt="" style={{
                position: 'absolute', left: 0, top: 0, width: '50%', height: '100%',
                willChange: 'transform',
                animation: 'elevDoorL 1.7s cubic-bezier(0.45, 0, 0.2, 1) forwards',
              }} />
              <img src={`${ELEV}door_right.webp`} alt="" style={{
                position: 'absolute', right: 0, top: 0, width: '50%', height: '100%',
                willChange: 'transform',
                animation: 'elevDoorR 1.7s cubic-bezier(0.45, 0, 0.2, 1) forwards',
              }} />
            </div>
          </div>
        </div>

        {/* Text */}
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          fontFamily: '"Unifont", monospace',
          fontSize: 14,
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: 6,
          animation: 'fadeInSlow 2s ease-in forwards',
          textAlign: 'center',
          zIndex: 1004,
        }}>
          . . .
        </div>

        <style>{`
          @keyframes fadeInSlow {
            0% { opacity: 0; }
            100% { opacity: 1; }
          }
          @keyframes elevDoorL { from { transform: translateX(0); } to { transform: translateX(-102%); } }
          @keyframes elevDoorR { from { transform: translateX(0); } to { transform: translateX(102%); } }
          @keyframes elevDoorsFade { 0%, 30% { opacity: 1; } 100% { opacity: 0; } }
        `}</style>
      </div>
    );
  }


  return null;
};

const MedicinePickup: React.FC<{
  med: typeof MEDICINES[0];
  worldPos: { x: number; z: number };
  collected: boolean;
}> = ({ med, worldPos, collected }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (meshRef.current && !collected) {
      meshRef.current.rotation.y = clock.elapsedTime * 2;
      meshRef.current.position.y = 0.5 + Math.sin(clock.elapsedTime * 3) * 0.1;
    }
  });

  if (collected) return null;

  return (
    <mesh ref={meshRef} position={[worldPos.x, 0.5, worldPos.z]}>
      <boxGeometry args={[0.3, 0.5, 0.3]} />
      <meshStandardMaterial color={med.color} emissive={med.color} emissiveIntensity={0.3} />
    </mesh>
  );
};

// cart — Canvas 안 카메라 고정 HUD 평면. 메인 씬에 있어 약 효과(EffectComposer)를 동일하게 받음
const CART_ASPECT = 1536 / 1030;
const CartHud: React.FC = () => {
  const { camera } = useThree();
  const tex = useLoader(THREE.TextureLoader, `${import.meta.env.BASE_URL}assets/ui/cart.webp`);
  const ref = useRef<THREE.Mesh>(null);
  const DEPTH = 1;
  const fovRad = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov || 75);
  const visH = 2 * DEPTH * Math.tan(fovRad / 2); // DEPTH 거리에서 보이는 세로 높이
  const planeH = visH * 0.45;                     // 화면 세로의 45%
  const planeW = planeH * CART_ASPECT;
  const yOff = -(visH - planeH) / 2;              // 하단 정렬
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    m.position.copy(camera.position);
    m.quaternion.copy(camera.quaternion);
    m.translateZ(-DEPTH); // 카메라 정면
    m.translateY(yOff);   // 하단으로
  });
  return (
    <mesh ref={ref} renderOrder={999} frustumCulled={false}>
      <planeGeometry args={[planeW, planeH]} />
      <meshBasicMaterial map={tex} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
};

// --- finale 빈 네모 벽 갤러리 — 전략적 행성 전투 9조각 (PoemFragment는 공유 컴포넌트) ---
const GALLERY_WALL = MAZE_SIZE * CELL_SIZE; // 70 — 경계 벽 좌표
const FRAG_Y = 1.7;         // finale 벽 조각 중심 높이 (시점 ~1.8)
const WALL_INSET = 0.3;     // 벽면에서 안쪽으로 띄움
// 9조각 배치 — 시계방향(N 좌→우, E 상→하, S 우→좌, W) = 시 읽는 순서. rotY: 플레인 법선이 실내(중앙)를 향하도록.
// 좌표를 플레이어 셀 중심(cellC = col*CELL_SIZE + CELL_SIZE/2)에 정렬 → 정면 접근 가능(열 안 맞던 문제 해결).
const cellC = (i: number) => i * CELL_SIZE + CELL_SIZE / 2; // 3.5, 10.5, 17.5 … 66.5
// 4면벽 골고루(3·2·2·2) + 각 벽 길이 따라 퍼뜨림 → 다 모으려면 N→E→S→W 한 바퀴.
// 북쪽 중앙(열 5)은 시착실 부스가 붙어 있어 피함. 좌표는 플레이어 셀 중심 열에 정렬.
const POSTER_PLACEMENTS: { x: number; z: number; rotY: number }[] = [
  { x: cellC(1), z: WALL_INSET, rotY: 0 },                       // 1 — North (열 1)
  { x: cellC(4), z: WALL_INSET, rotY: 0 },                       // 2 — North (열 4)
  { x: cellC(8), z: WALL_INSET, rotY: 0 },                       // 3 — North (열 8)
  { x: GALLERY_WALL - WALL_INSET, z: cellC(3), rotY: -Math.PI / 2 }, // 4 — East (행 3)
  { x: GALLERY_WALL - WALL_INSET, z: cellC(7), rotY: -Math.PI / 2 }, // 5 — East (행 7)
  { x: cellC(8), z: GALLERY_WALL - WALL_INSET, rotY: Math.PI },  // 6 — South (열 8)
  { x: cellC(2), z: GALLERY_WALL - WALL_INSET, rotY: Math.PI },  // 7 — South (열 2)
  { x: WALL_INSET, z: cellC(6), rotY: Math.PI / 2 },             // 8 — West (행 6)
  { x: WALL_INSET, z: cellC(2), rotY: Math.PI / 2 },             // 9 — West (행 2)
];

// finale 빈네모 — 약 단계에서 미읽고 지나간 ckshp/맹점(최대 5) 회수용 추가 배치.
// battle 9개(POSTER_PLACEMENTS)와 안 겹치는 빈 벽 자리.
const NPC_PLACEMENTS: { x: number; z: number; rotY: number }[] = [
  { x: cellC(2), z: WALL_INSET, rotY: 0 },                          // N 열 2
  { x: GALLERY_WALL - WALL_INSET, z: cellC(5), rotY: -Math.PI / 2 }, // E 행 5
  { x: cellC(5), z: GALLERY_WALL - WALL_INSET, rotY: Math.PI },     // S 열 5
  { x: WALL_INSET, z: cellC(4), rotY: Math.PI / 2 },               // W 행 4
  { x: WALL_INSET, z: cellC(8), rotY: Math.PI / 2 },               // W 행 8
];

// finale 빈 네모 벽 갤러리 — 전략적 행성 전투 9조각 (id battle1..9, ch3Fragments 레지스트리 index 5~13)
const PoemGallery: React.FC = () => {
  const visitedEvents = useGameStore(s => s.visitedEvents);
  // 조각 id를 벽 위치에 랜덤 배정 (순서대로 붙이지 않음) — 마운트 1회 고정
  const shuffledIds = useMemo(() => {
    const a = [...BATTLE_FRAGMENT_IDS];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }, []);
  // 약 단계에서 미읽고 지나간 ckshp/맹점 — 빈네모 벽에 추가 회수 배치(연두). 읽으면 note_ 기록되며 사라짐.
  const unreadNpc = NPC_FRAGMENT_IDS.filter((id) => !visitedEvents.has(`note_${id}`));
  return (
    <Suspense fallback={null}>
      {POSTER_PLACEMENTS.map((p, i) => (
        <PoemFragment key={i} id={shuffledIds[i]} paperIdx={5 + i} position={[p.x, FRAG_Y, p.z]} rotationY={p.rotY} tint="#c4a5ff" />
      ))}
      {unreadNpc.map((id, i) => {
        const p = NPC_PLACEMENTS[i];
        if (!p) return null;
        return (
          <PoemFragment key={id} id={id} paperIdx={NPC_FRAGMENT_IDS.indexOf(id)} position={[p.x, FRAG_Y, p.z]} rotationY={p.rotY} tint="#c4ff2e" />
        );
      })}
    </Suspense>
  );
};

const Ch3Inner: React.FC<{
  maze: MazeData;
  onPlayerMove?: (pos: { x: number; z: number }) => void;
  onElevatorZoneChange?: (inZone: boolean) => void;
  onDrugPickup?: (index: number, pickupCount: number, playerCell?: { x: number; y: number }) => void;
  onCollectedChange?: (collected: Set<number>) => void;
  cartMuted?: boolean;
  devEmptyTrigger?: number;
}> = ({ maze, onPlayerMove, onElevatorZoneChange, onDrugPickup, onCollectedChange, cartMuted, devEmptyTrigger }) => {
  const triggerEvent = useGameStore(s => s.triggerEvent);
  const addToCart = useGameStore(s => s.addToCart);
  const setActiveEffect = useGameStore(s => s.setActiveEffect);
  const setNotification = useGameStore(s => s.setNotification);
  const noteOpen = useGameStore(s => s.activeNoteId !== null); // 시 조각 오버레이 열림 → 이동 정지
  const { play } = useSoundManager();
  const elevatorVisited = useGameStore(s => s.visitedEvents.has('ch3_elevator'));
  const [collected, setCollected] = useState<Set<number>>(new Set());
  const [posState, setPosState] = useState({ x: 0, z: 0 });

  // dev — 빈 네모로 점프: 전부 수집 처리 + 마지막 픽업 흐름(빈 미로 재생성) 트리거
  useEffect(() => {
    if (!devEmptyTrigger) return; // 초기 마운트(0) 무시
    const all = new Set([0, 1, 2, 3, 4]);
    setCollected(all);
    onCollectedChange?.(all);
    onDrugPickup?.(MEDICINES.length - 1, MEDICINES.length);
    // 유령은 ItaewonLayer가 emptySquare 신호로 직접 스폰. + 흰약 효과(라인 드로잉 스케치)도 발동 — dev 점프에서도 빈 네모 풀 연출 확인용.
    const white = MEDICINES[MEDICINES.length - 1];
    setActiveEffect(white.effect, white.duration);
  }, [devEmptyTrigger]); // eslint-disable-line react-hooks/exhaustive-deps
  // 흰약 차단 알림 스로틀 — 존 진입당 1회만 (100ms 루프 스팸 방지)
  const whiteBlockedRef = useRef(false);

  const startWorld = useMemo(() => cellToWorld(maze.start.x, maze.start.y, CELL_SIZE), [maze]);
  const mazeWorldSize = MAZE_SIZE * CELL_SIZE;

  const wallAABBs = useMemo<WallAABB[]>(() => {
    return maze.wallPositions.map(w => ({
      minX: w.x - w.scaleX / 2,
      maxX: w.x + w.scaleX / 2,
      minZ: w.z - w.scaleZ / 2,
      maxZ: w.z + w.scaleZ / 2,
    }));
  }, [maze]);

  const medPositions = useMemo(() =>
    MEDICINES.map((m, i) => {
      // i=0 (빨간약) — player start 인접 셀에 강제 배치 (player가 가장 먼저 만나는 약)
      if (i === 0) return cellToWorld(maze.start.x + 1, maze.start.y, CELL_SIZE);
      return cellToWorld(m.cell.gx, m.cell.gy, CELL_SIZE);
    }),
  [maze]);

  // 유령 스폰이 약 위치에 겹치지 않게 — 약 셀 목록 (i=0 빨간약은 start+1 셀, medPositions와 동일 규칙)
  const medCells = useMemo(() =>
    MEDICINES.map((m, i) =>
      i === 0 ? { gx: maze.start.x + 1, gy: maze.start.y } : { gx: m.cell.gx, gy: m.cell.gy },
    ),
  [maze]);

  const fitting = useMemo(() => findFittingCorner(maze, CELL_SIZE), [maze]);
  const fittingRoomWorld = fitting.pos;

  const itaewonCellWorld = useMemo(() => cellToWorld(3, 3, CELL_SIZE), []);

  useEffect(() => {
    const check = () => {
      const px = posState.x;
      const pz = posState.z;

      // Medicine pickup detection — last medicine ("다 먹음") gated until first 4 collected
      MEDICINES.forEach((med, i) => {
        if (!collected.has(i)) {
          const isLast = i === MEDICINES.length - 1;
          if (isLast && collected.size < MEDICINES.length - 1) return;
          const wp = medPositions[i];
          const dist = Math.sqrt((px - wp.x) ** 2 + (pz - wp.z) ** 2);
          // 흰약은 시착실(우주 엘리베이터)을 먼저 보지 않으면 복용 불가 — 다가가면 안내만
          if (isLast && !elevatorVisited) {
            if (dist < CELL_SIZE * 0.6) {
              if (!whiteBlockedRef.current) {
                whiteBlockedRef.current = true;
                setNotification('먼저 가운데 시착실에 들어가 봐야 한다');
                setTimeout(() => setNotification(null), 2400);
              }
            } else {
              whiteBlockedRef.current = false;
            }
            return;
          }
          if (dist < CELL_SIZE * 0.6) {
            setCollected(prev => {
              const next = new Set(prev).add(i);
              onCollectedChange?.(next);
              return next;
            });
            addToCart(med.name);
            play(med.soundSlot);
            setActiveEffect(med.effect, med.duration);
            setNotification(med.name);
            triggerEvent(`ch3_med_${i}`);
            setTimeout(() => setNotification(null), 2000);
            // 플레이어가 선 실제 셀(floor) — 재생성 맵에서 이 칸 4면을 열어 벽 마주봄 방지
            const pgx = Math.max(0, Math.min(MAZE_SIZE - 1, Math.floor(px / CELL_SIZE)));
            const pgy = Math.max(0, Math.min(MAZE_SIZE - 1, Math.floor(pz / CELL_SIZE)));
            onDrugPickup?.(i, collected.size + 1, { x: pgx, y: pgy });
          }
        }
      });

      // 시착실 = 엘리베이터 portal(중간) / 흰약 후엔 CH4 출구 — proximity-only state (E-confirm in Ch3Scene)
      const elevDist = Math.sqrt((px - fittingRoomWorld.x) ** 2 + (pz - fittingRoomWorld.z) ** 2);
      onElevatorZoneChange?.(elevDist < CELL_SIZE * 0.6);
    };

    const interval = setInterval(check, 100);
    return () => clearInterval(interval);
  }, [posState, collected, medPositions, fittingRoomWorld, elevatorVisited, addToCart, play, setActiveEffect, setNotification, triggerEvent, onDrugPickup, onCollectedChange, onElevatorZoneChange]);

  const frameCount = useRef(0);
  const handlePosition = (x: number, z: number) => {
    frameCount.current++;
    if (frameCount.current % 6 === 0) {
      setPosState({ x, z });
      onPlayerMove?.({ x, z });
    }
  };

  return (
    <>
      <FlickerLight />
      <directionalLight position={[mazeWorldSize / 2, 20, mazeWorldSize / 2]} intensity={0.7} />
      {/* STEP 8: Post-processing — Vignette + Noise */}
      <Ch3Effects />

      <MazeFloor />
      <MazeCeiling />
      <MazeWalls maze={maze} emptySquare={collected.size === MEDICINES.length} />

      {/* 카트 HUD — 카메라 고정, 메인 씬이라 약 후처리 동일 적용 */}
      <Suspense fallback={null}><CartHud /></Suspense>

      {/* Medicine pickups in maze cells — last ("다 먹음") hidden until first 4 collected */}
      {MEDICINES.map((med, i) => {
        const isLast = i === MEDICINES.length - 1;
        if (isLast && collected.size < MEDICINES.length - 1) return null;
        return (
          <MedicinePickup
            key={i}
            med={med}
            worldPos={medPositions[i]}
            collected={collected.has(i)}
          />
        );
      })}

      {/* 시착실 = 엘리베이터 portal at center */}
      <FittingRoom worldPos={fittingRoomWorld} nx={fitting.nx} nz={fitting.nz} revealed={collected.size === MEDICINES.length} />

      {/* 빈 네모 갤러리 — 흰약 복용(전부 수집) 후 텅 빈 벽에 시 「전략적 행성 전투」 9조각 (수집형) */}
      {collected.size === MEDICINES.length && (
        <PoemGallery />
      )}

      {/* STEP 5: Itaewon memorial layer at cell (3,3) */}
      <ItaewonLayer
        cellWorldPos={itaewonCellWorld}
        cellSize={CELL_SIZE}
        mazeSize={MAZE_SIZE}
        playerPos={posState}
        wallAABBs={wallAABBs}
        fittingRoom={{ x: fittingRoomWorld.x, z: fittingRoomWorld.z, halfW: FITTING_W / 2 }}
        emptySquare={collected.size === MEDICINES.length}
        avoidCells={medCells}
      />

      <PlayerController
        mode="1st"
        showCharacter
        collisionWalls={wallAABBs}
        bounds={{ minX: 0.5, maxX: mazeWorldSize - 0.5, minZ: 0.5, maxZ: mazeWorldSize - 0.5 }}
        onPosition={handlePosition}
        startPosition={[startWorld.x, 0.5, startWorld.z]}
        initialLookDir={[0, 1]}
        gridCellSize={CELL_SIZE}
        gridInputCooldown={0.4}
        cartMuted={cartMuted}
        freeze={noteOpen}
      />
    </>
  );
};

export const Ch3Scene: React.FC = () => {
  const [maze, setMaze] = useState<MazeData>(() =>
    generateMaze(MAZE_SIZE, MAZE_SIZE, { seed: Math.floor(Math.random() * 0xFFFFFFFF), forceCenterCorner: true }, CELL_SIZE),
  );
  // 흰약 순간 플래시(반짝) — isFinal 픽업 시 0.65s 흰 오버레이
  const [whiteFlash, setWhiteFlash] = useState(false);
  const handleDrugPickup = useCallback((_drugIndex: number, pickupCount: number, playerCell?: { x: number; y: number }) => {
    // 픽업 순서대로 미로가 단순화 — 마지막(흰약) 픽업이면 내벽 0 = 빈 네모(시착실만 남음).
    const removalRatio = MAZE_REMOVAL_RAMP[Math.min(pickupCount - 1, MAZE_REMOVAL_RAMP.length - 1)];
    const isFinal = pickupCount >= MEDICINES.length;
    const newSeed = Math.floor(Math.random() * 0xFFFFFFFF);
    // isFinal엔 forceCenterCorner off — 중앙 코너벽까지 빼야 진짜 벽 하나 없는 정사각형. 시착실 부스는 자체 벽이라 그대로 남음.
    // openAround: 약 먹은 직후 플레이어가 벽을 마주보지 않게 그 칸 4면 개방 (유령이 화면 안에 뜨도록)
    const buildMaze = () => setMaze(generateMaze(MAZE_SIZE, MAZE_SIZE, { seed: newSeed, forceCenterCorner: !isFinal, removalRatio, openAround: playerCell }, CELL_SIZE));
    if (isFinal) {
      // 시퀀스: 반짝(흰 플래시) → 정점(~0.25s)에 빈 네모로 교체(플래시가 가림) → 빈 맵 위 라인 드로잉(ChapterEffects whiteflash)
      setWhiteFlash(true);
      setTimeout(() => setWhiteFlash(false), 700);
      setTimeout(buildMaze, 250);
    } else {
      buildMaze();
    }
  }, []);
  const startWorld = useMemo(() => cellToWorld(maze.start.x, maze.start.y, CELL_SIZE), [maze]);
  const [playerPos, setPlayerPos] = useState({ x: startWorld.x, z: startWorld.z });
  const [cutscenePhase, setCutscenePhase] = useState<CutscenePhase>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 3000);
    return () => clearTimeout(t);
  }, []);
  const { play, loop } = useSoundManager();

  const [collectedSet, setCollectedSet] = useState<Set<number>>(new Set());
  // 마트 앰비언스 — 챕터 진입 시 loop. cutscene 중 또는 빈 네모(전부 수집) 도달 시 정지 (sfx만 남김).
  useEffect(() => {
    if (cutscenePhase) {
      loop('mart_bgm', false);
    } else {
      loop('mart_bgm', true); // 빈 네모에서도 마트 앰비언스는 유지
    }
    if (collectedSet.size === MEDICINES.length) stopChapterMusic(); // 빈 네모 — 메인 챕터 bgm(ch3-map)만 정지
    return () => loop('mart_bgm', false);
  }, [cutscenePhase, loop, collectedSet]);
  const [devEmptyTrigger, setDevEmptyTrigger] = useState(0);
  const [atFittingRoom, setAtFittingRoom] = useState(false);
  // 뷰포트 비율 — 카메라 고정 카트 HUD의 화면상 위치 계산용 (글자를 카트 바구니 안에 얹기)
  const [vp, setVp] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const on = () => setVp({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  // 시 조각 — CH.2 쪽지 시스템 재사용. 열람/닫기/언어토글/수집기록은 store + NoteReader가 담당.
  const activeNoteId = useGameStore(s => s.activeNoteId);
  const openNote = useGameStore(s => s.openNote);
  const visitedEvents = useGameStore(s => s.visitedEvents);
  const nearFragmentId = useGameStore(s => s.nearFragmentId); // 근접 조각 → 하단 [E] 읽기 프롬프트
  const cartItems = useGameStore(s => s.cartItems);
  const activeEffect = useGameStore(s => s.activeEffect);
  const removeFromCart = useGameStore(s => s.removeFromCart);
  const setNotification = useGameStore(s => s.setNotification);
  const notification = useGameStore(s => s.notification);
  const goToChapter = useGameStore(s => s.goToChapter);
  const triggerEvent = useGameStore(s => s.triggerEvent);
  const elevatorVisited = useGameStore(s => s.visitedEvents.has('ch3_elevator'));
  const devMode = useDevMode();
  const [muted, toggleMute] = useMute();
  // CART 이동 dev 슬라이더 — cartTuning 객체를 직접 mutate(useFrame이 매 프레임 읽음) + state로 패널만 리렌더
  const [cartGridStep, setCartGridStep] = useState(cartTuning.gridStep);
  const [cartPosLerp, setCartPosLerp] = useState(cartTuning.posLerp);

  // 약 5개 전부 수집 → 출구 안내 (마지막 약 알림 직후 표시)
  // Minimap markers: 시착실 — 전부 수집 후엔 초록 출구, 그 전엔 엘베(magenta, 사용 전까지) + 약 위치(수집 전, 흰약은 첫 4개 모은 뒤 노출).
  const allCollected = collectedSet.size === MEDICINES.length;
  // 빈 네모에서 전투(전략적 행성 전투) 9조각을 전부 모아야 출구 개방 + 미니맵 시착실 표시
  const allBattleCollected = allCollected && BATTLE_FRAGMENT_IDS.every(id => visitedEvents.has(`note_${id}`));
  const minimapMarkers = useMemo<MinimapMarker[]>(() => {
    const markers: MinimapMarker[] = [];
    const fr = findFittingCorner(maze, CELL_SIZE).pos;
    if (allCollected) {
      // 빈 네모 — 가운데 시착실이 CH4 출구. 단, 전투 9조각 다 모은 뒤에만 표시.
      if (allBattleCollected) markers.push({ x: fr.x, z: fr.z, color: '#0f0', radius: 4.5, glow: true });
    } else if (!elevatorVisited) {
      markers.push({ x: fr.x, z: fr.z, color: '#c040ff', radius: 3.5, glow: true });
    }
    MEDICINES.forEach((med, i) => {
      if (collectedSet.has(i)) return;
      // 흰약(마지막)은 첫 4개 모으기 전엔 숨김 — pickup/렌더 게이팅과 일치
      const isLast = i === MEDICINES.length - 1;
      if (isLast && collectedSet.size < MEDICINES.length - 1) return;
      // medPositions와 동일 logic — i=0 (빨간약)은 player start 인접 셀
      const wp = (i === 0)
        ? cellToWorld(maze.start.x + 1, maze.start.y, CELL_SIZE)
        : cellToWorld(med.cell.gx, med.cell.gy, CELL_SIZE);
      markers.push({ x: wp.x, z: wp.z, color: med.color, radius: 2 });
    });
    return markers;
  }, [collectedSet, maze, elevatorVisited, allCollected, allBattleCollected]);

  // Elevator cutscene sequencer
  const startElevatorCutscene = useCallback(() => {
    setCutscenePhase('elevator');
    suspendChapterMusic();  // 마트 BGM만 정지 — 엘베 안에선 엘베 SFX만 (우주 BGM은 아직 X)

    // Phase 1 → Phase 2 — 우주씬 진입 시 코스믹 BGM 시작 (space SFX 루프는 ElevatorCutscene가 담당)
    setTimeout(() => {
      setCutscenePhase('space');
      startElevatorMusic();
    }, ELEVATOR_DURATION);

    // Phase 2 → returning (fade out)
    setTimeout(() => {
      setCutscenePhase('returning');
      endElevatorMusic();
    }, ELEVATOR_DURATION + SPACE_DURATION);

    // Done — back to maze
    setTimeout(() => {
      setCutscenePhase(null);
    }, ELEVATOR_DURATION + SPACE_DURATION + RETURN_FADE);
  }, []);

  // E 키 — 시착실 진입 확정. 전부 복용 후엔 CH4 출구, 그 전엔 엘베 컷신(중간 detour, 1회). 시 조각 오버레이 중엔 비활성.
  // 전투 9조각 다 모으기 전엔 출구 '[E] 나가기' 자체를 숨김 → 못 나감
  const showExitPrompt = atFittingRoom && allCollected && allBattleCollected && !cutscenePhase && activeNoteId === null;
  const showElevatorPrompt = atFittingRoom && !allCollected && !elevatorVisited && !cutscenePhase && activeNoteId === null;
  useEffect(() => {
    if (!showElevatorPrompt && !showExitPrompt) return;
    const handler = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE') return;
      e.preventDefault();
      if (showExitPrompt) {
        triggerEvent('ch3_exit');
        play('elevator_door'); // 시착실 문 소리 + 공통 transition
        play('transition');
        goToChapter('CH4');
      } else if (showElevatorPrompt) {
        triggerEvent('ch3_elevator');
        play('elevator_door'); // 시착실 진입 문 소리
        startElevatorCutscene();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showElevatorPrompt, showExitPrompt, triggerEvent, goToChapter, startElevatorCutscene]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 50 }}>
      {/* 3D는 Game의 영속 Canvas로 터널링. 카메라는 PlayerController가 잡는 makeDefault.
          (엘베 cutscene 오버레이 Canvas·StarNest는 transient라 별도 유지) */}
      <r3f.In>
        <PerspectiveCamera makeDefault fov={75} position={[startWorld.x, 1.8, startWorld.z]} near={0.1} far={1000} />
        <Ch3Inner
          maze={maze}
          onPlayerMove={setPlayerPos}
          onElevatorZoneChange={setAtFittingRoom}
          onDrugPickup={handleDrugPickup}
          onCollectedChange={setCollectedSet}
          cartMuted={!!cutscenePhase}
          devEmptyTrigger={devEmptyTrigger}
        />
        <SceneExporter chapter="ch3" />
      </r3f.In>

      {/* Elevator cutscene overlay */}
      <ElevatorCutscene phase={cutscenePhase} />

      {/* 흰약 반짝 — 짧은 화이트 플래시. 이 밑에서 맵이 빈 네모로 교체됨(플래시가 가림) */}
      {whiteFlash && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 3000, background: '#fff',
          pointerEvents: 'none', animation: 'ch3WhiteFlash 0.65s ease-out forwards',
        }}>
          <style>{`@keyframes ch3WhiteFlash {
            0% { opacity: 0; } 12% { opacity: 1; } 30% { opacity: 1; } 100% { opacity: 0; }
          }`}</style>
        </div>
      )}

      {/* 시 조각 본문 오버레이 — CH.2와 동일한 NoteReader(종이·폰트·한영 Q토글). store.activeNoteId로 구동 */}
      <NoteReader />

      {/* 시 조각 수집 슬롯. NPC(ckshp/맹점) 5칸은 우측 세로 중앙(첫 수집 후, 흰약 먹어도 유지),
          전략적 행성 전투 9칸은 finale 진입 시 좌측 세로 중앙에 추가 — 좌우대칭. 수집된 것만 점등 · 클릭 재열람. */}
      {!cutscenePhase && (() => {
        const BATTLE_TINT = '#c4a5ff'; // 벽 갤러리 조각과 동일한 연보라
        const slot = (id: string, i: number, tintC: string) => {
          const got = visitedEvents.has(`note_${id}`);
          return (
            <div
              key={id}
              onClick={() => { if (got) openNote(id); }}
              style={{
                width: 26, height: 34,
                border: `1px solid ${got ? tintC : 'rgba(255,255,255,0.18)'}`,
                background: 'rgba(0,0,0,0.55)',
                boxShadow: got ? `0 0 8px ${tintC}66` : 'none',
                opacity: got ? 1 : 0.4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: got ? tintC : 'rgba(243,238,221,0.5)',
                fontFamily: '"Unifont", monospace', fontSize: 11,
                cursor: got ? 'pointer' : 'default', pointerEvents: 'auto',
              }}
            >
              {i + 1}
            </div>
          );
        };
        const npcGot = NPC_FRAGMENT_IDS.some(id => visitedEvents.has(`note_${id}`));
        const z = activeNoteId !== null ? 2100 : 1500;
        // CH.2에서 우체통에 안 넣고 들고 온 쪽지 — CH.3 좌하단에 CH.2와 동일한 봉투 룩으로 계속 표시, 클릭 재열람.
        const carriedCh2 = CH2_NOTES.filter(n => visitedEvents.has(`note_${n.id}`));
        return (
          <>
            {carriedCh2.length > 0 && (
              <div style={{
                position: 'fixed', left: 24, bottom: 24, zIndex: z,
                display: 'flex', alignItems: 'center', gap: 10,
                pointerEvents: 'none', userSelect: 'none',
                filter: 'drop-shadow(0 1px 4px rgba(0,0,0,0.8))',
              }}>
                {carriedCh2.map((n) => {
                  const noteColor = SPARKLE_COLOR[n.id] ?? DEFAULT_SPARKLE;
                  const isActive = n.id === activeNoteId;
                  return (
                    <svg
                      key={n.id}
                      viewBox="0 0 24 32"
                      width="18"
                      height="24"
                      style={{
                        cursor: 'pointer',
                        pointerEvents: 'auto',
                        transition: 'transform 0.15s ease',
                        filter: isActive ? 'drop-shadow(0 0 2px rgba(255,255,255,0.95))' : undefined,
                      }}
                      onClick={() => openNote(n.id)}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.18)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
                    >
                      <path
                        d="M3 2 L17 2 L21 6 L21 30 L3 30 Z"
                        fill={noteColor}
                        stroke={isActive ? '#ffffff' : noteColor}
                        strokeWidth={isActive ? 1.6 : 1.5}
                        strokeLinejoin="round"
                      />
                      <path d="M17 2 L17 6 L21 6" fill="none" stroke="#1a1a1a" strokeWidth="1.2" />
                    </svg>
                  );
                })}
              </div>
            )}
            {npcGot && (
              <div style={{
                position: 'fixed', right: 24, top: '50%', transform: 'translateY(-50%)', zIndex: z,
                display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none', userSelect: 'none',
              }}>
                {NPC_FRAGMENT_IDS.map((id, i) => slot(id, i, FRAG_TINT))}
                {/* Tab+↑/↓ 순차 열람 힌트 (세로 배열, ⇣ tab) */}
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, marginTop: 2, opacity: 0.5, alignSelf: 'center' }}>
                  <svg viewBox="0 0 16 22" width="11" height="15" aria-hidden>
                    <path d="M8 3 L8 15 M4 11 L8 15 L12 11 M3 19 L13 19" fill="none" stroke="#f3eedd" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ fontFamily: '"Unifont", monospace', fontSize: 10, letterSpacing: 1, color: '#f3eedd' }}>tab</span>
                </span>
              </div>
            )}
            {allCollected && (
              <div style={{
                position: 'fixed', left: 24, top: '50%', transform: 'translateY(-50%)', zIndex: z,
                display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none', userSelect: 'none',
              }}>
                {BATTLE_FRAGMENT_IDS.map((id, i) => slot(id, i, BATTLE_TINT))}
                {/* Tab+↑/↓ 순차 열람 힌트 (세로 배열, ⇣ tab) */}
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, marginTop: 2, opacity: 0.5, alignSelf: 'center' }}>
                  <svg viewBox="0 0 16 22" width="11" height="15" aria-hidden>
                    <path d="M8 3 L8 15 M4 11 L8 15 L12 11 M3 19 L13 19" fill="none" stroke="#f3eedd" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span style={{ fontFamily: '"Unifont", monospace', fontSize: 10, letterSpacing: 1, color: '#f3eedd' }}>tab</span>
                </span>
              </div>
            )}
          </>
        );
      })()}

      {/* 시 조각 근접 — 화면 하단 [E] 읽기 (조각 위에 안 가림). 도어 프롬프트와 위치 겹쳐도 동시 발생 거의 없음 */}
      {nearFragmentId && activeNoteId === null && !cutscenePhase && (
        <div style={{
          position: 'fixed', left: '50%', bottom: '14%', transform: 'translateX(-50%)',
          zIndex: 1500, fontFamily: '"Unifont", monospace', fontSize: 14, letterSpacing: 4,
          color: '#f3eedd', background: 'rgba(0,0,0,0.65)', padding: '8px 18px',
          border: '1px solid rgba(243,238,221,0.35)', textShadow: '0 0 6px rgba(0,0,0,0.8)',
          pointerEvents: 'none', userSelect: 'none',
        }}>
          [E] 읽기
        </div>
      )}

      {/* Door E-confirm prompts */}
      {(showElevatorPrompt || showExitPrompt) && (
        <div style={{
          position: 'fixed',
          left: '50%',
          bottom: '14%',
          transform: 'translateX(-50%)',
          zIndex: 1500,
          fontFamily: '"Unifont", monospace',
          fontSize: 14,
          letterSpacing: 4,
          color: '#f3eedd',
          background: 'rgba(0,0,0,0.65)',
          padding: '8px 18px',
          border: '1px solid rgba(243,238,221,0.35)',
          textShadow: '0 0 6px rgba(0,0,0,0.8)',
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          {showExitPrompt ? '[E] 나가기' : '[E] 들어가기'}
        </div>
      )}

      {/* Hide minimap & UI during cutscene */}
      {!cutscenePhase && (
        <Minimap maze={maze} playerX={playerPos.x} playerZ={playerPos.z} cellSize={CELL_SIZE} markers={minimapMarkers} showExit={false} />
      )}

      {/* Notification */}
      {notification && !cutscenePhase && (
        <div style={{
          position: 'fixed',
          top: '40%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          backgroundColor: 'rgba(0,0,0,0.8)',
          color: '#fff',
          padding: '20px 40px',
          fontFamily: '"Unifont", monospace',
          fontSize: 24,
          border: '1px solid #fff',
          zIndex: 300,
          pointerEvents: 'none',
          animation: 'fadeinout 2s forwards',
        }}>
          {notification}
        </div>
      )}

      {/* STEP 4: Cart UI — 약 글자가 카트 바구니 안에 담겨 쌓임.
          카트 HUD(카메라 고정 평면)의 화면 사각형을 역산: 높이=뷰포트 45% 하단정렬, 폭=67.1/aspect%.
          그 안에서 와이어 바스켓 내부(이미지 x 22~78%, y 13~50%) 위에 글자를 얹는다. */}
      {!cutscenePhase && cartItems.length > 0 && (() => {
        const aspect = vp.w / vp.h;
        const cartWidthPct = 67.11 / aspect;          // 카트 화면 폭(%)
        const cartLeftPct = (100 - cartWidthPct) / 2;  // 가로 중앙 정렬
        // 카트 세로: 화면 55%~100% (하단 45%). 바구니 내부는 그 13%~50% 구간.
        const basketLeft = cartLeftPct + cartWidthPct * 0.22 + 1.5; // x +방향(오른쪽) 살짝
        const basketWidth = cartWidthPct * 0.56;
        const basketTop = 55 + 45 * 0.13 - 2.5; // y 살짝 위로
        const basketHeight = 45 * (0.50 - 0.13);
        // 약 효과 중 cart 약 이름(DOM 글자)에도 효과가 보이게 — 약별 CSS 필터로 GLSL 룩 근사.
        // GLSL(MedicationEffect)은 WebGL 후처리라 DOM에 안 닿음. anxiolytic은 EffectOverlay에 케이스가
        // 없어 전혀 안 걸리던 것 + blur/darken은 너무 약하던 것을 여기서 보완.
        const CART_FX: Record<string, string> = {
          desaturate: 'grayscale(1) contrast(1.5)',           // Lithium — solarize 근사
          blur: 'blur(2.5px) brightness(0.95)',               // Aripiprazole — 글자 충분히 흐리게
          darken: 'brightness(0.35) contrast(1.2)',           // Quetiapine
          anxiolytic: 'blur(1.4px) hue-rotate(45deg) saturate(1.6)', // Alprazolam — flow 왜곡 근사
        };
        const cartFilter = activeEffect ? (CART_FX[activeEffect] ?? 'none') : 'none';
        return (
          <div style={{
            position: 'fixed',
            left: `${basketLeft}%`,
            top: `${basketTop}%`,
            width: `${basketWidth}%`,
            height: `${basketHeight}%`,
            display: 'flex',
            gap: 4,
            zIndex: 200,
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignContent: 'flex-end', // 바구니 바닥부터 쌓이듯
            filter: cartFilter,
            transition: 'filter 0.4s ease',
          }}>
            {cartItems.map((item, i) => (
              <GlitchCartButton key={`${i}-${item}`} item={item} />
            ))}
          </div>
        );
      })()}

      {/* Dev Panel — toggle with ` key */}
      {devMode && (
        <div style={{
          position: 'fixed',
          top: 12,
          right: 12,
          zIndex: 9999,
          background: 'rgba(0,0,0,0.85)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 6,
          padding: '10px 14px',
          fontFamily: '"Unifont", monospace',
          fontSize: 11,
          color: '#ccc',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          minWidth: 180,
        }}>
          <div style={{ color: '#ff0', fontSize: 10, letterSpacing: 2, marginBottom: 2 }}>DEV MODE</div>
          <div style={{ color: '#888', fontSize: 10 }}>
            pos: {playerPos.x.toFixed(1)}, {playerPos.z.toFixed(1)}
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <DevButton label="→ 빈 네모 (전부 수집)" onClick={() => setDevEmptyTrigger(n => n + 1)} />
          <DevButton label="Elevator Cutscene" onClick={() => { if (!cutscenePhase) startElevatorCutscene(); }} />
          <DevButton label="Skip → CH4" onClick={() => goToChapter('CH4')} />
          <DevButton label="Skip → CH2" onClick={() => goToChapter('CH2')} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <DevButton label={`Sound: ${muted ? 'OFF' : 'ON'}`} onClick={toggleMute} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <DevButton label="Export Scene → .glb" onClick={() => window.dispatchEvent(new Event('mh-export-glb'))} />
          <div style={{ height: 1, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ color: '#8cf', fontSize: 10, letterSpacing: 1 }}>CART 이동 튜닝</div>
          <label style={{ fontSize: 10, color: '#aaa', display: 'flex', flexDirection: 'column', gap: 2 }}>
            끊김 단위 gridStep — {cartGridStep}
            <input type="range" min={0.875} max={7} step={0.875} value={cartGridStep}
              onChange={(e) => { const v = +e.target.value; cartTuning.gridStep = v; setCartGridStep(v); }} />
          </label>
          <label style={{ fontSize: 10, color: '#aaa', display: 'flex', flexDirection: 'column', gap: 2 }}>
            슬라이드 속도 posLerp — {cartPosLerp}
            <input type="range" min={1} max={20} step={0.5} value={cartPosLerp}
              onChange={(e) => { const v = +e.target.value; cartTuning.posLerp = v; setCartPosLerp(v); }} />
          </label>
          <div style={{ color: '#555', fontSize: 9, marginTop: 2 }}>P to close · 슬라이더 만진 뒤 화면 클릭하면 이동키 복귀</div>
        </div>
      )}

      {loading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: '#000',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: '#f3eedd',
          fontFamily: '"Unifont", monospace',
          animation: 'ch3LoadingFadeOut 0.25s ease-in 2.75s forwards',
        }}>
          <div style={{ fontSize: 26, marginBottom: 14, animation: 'ch3LoadingSpin 1s linear infinite' }}>↻</div>
          <div style={{ fontSize: 15, letterSpacing: 8, marginBottom: 56 }}>l o a d i n g . . .</div>
          <div style={{ fontSize: 13, lineHeight: 1.75, textAlign: 'center' }}>
            팁: 상대방이 말할 때 고개를 천천히 끄덕이면 경청하는 것처럼 보입니다.
          </div>
          <style>{`
            @keyframes ch3LoadingSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes ch3LoadingFadeOut { to { opacity: 0; } }
          `}</style>
        </div>
      )}
    </div>
  );
};

const DevButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    onClick={(e) => { onClick(); e.currentTarget.blur(); }}
    style={{
      background: 'rgba(255,255,255,0.08)',
      border: '1px solid rgba(255,255,255,0.15)',
      borderRadius: 3,
      color: '#ddd',
      fontFamily: '"Unifont", monospace',
      fontSize: 11,
      padding: '4px 8px',
      cursor: 'pointer',
      textAlign: 'left',
    }}
    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; }}
  >
    {label}
  </button>
);
