import React, { useEffect } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';

/** 이름으로 제외할 런타임 전용 오브젝트. 타입 기반(아래 SkinnedMesh/Bone/Light/
 *  Camera)으로 못 거르는 것만 보조로 잡는다. */
const EXPORT_EXCLUDE_NAMES = new Set<string>([
  'PlayerCharacter',
  'collider',
]);

/** dev 패널 버튼이 쏘는 window 이벤트를 받아 현재 R3F 씬을 .glb로 내려받는다.
 *  스킨드 메시(char1 등)·본·라이트·카메라는 export 트리에서 통째로 들어낸다 —
 *  three GLTFExporter가 prune된 스켈레톤을 joint=null로 직렬화해 블렌더
 *  importer가 죽는 문제(2026-05-14 export 사고)를 원천 차단.
 *
 *  Canvas 안에 마운트할 것. dev 패널 버튼은
 *  `window.dispatchEvent(new Event('mh-export-glb'))`로 트리거.
 *  `chapter`는 다운로드 파일명 접두사로 쓰인다 (ch2/ch3 구분). */
export const SceneExporter: React.FC<{ chapter: string }> = ({ chapter }) => {
  const { scene } = useThree();

  useEffect(() => {
    const handler = () => {
      const root = scene.clone(true);

      const toRemove: THREE.Object3D[] = [];
      root.traverse(obj => {
        const o = obj as THREE.Object3D & {
          isSkinnedMesh?: boolean; isBone?: boolean;
          isLight?: boolean; isCamera?: boolean;
        };
        if (
          o.isSkinnedMesh || o.isBone || o.isLight || o.isCamera ||
          EXPORT_EXCLUDE_NAMES.has(obj.name)
        ) {
          toRemove.push(obj);
        }
      });
      toRemove.forEach(o => o.parent?.remove(o));

      const exporter = new GLTFExporter();
      exporter.parse(
        root,
        result => {
          const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
          a.href = url;
          a.download = `map-hack-${chapter}-${ts}.glb`;
          a.click();
          URL.revokeObjectURL(url);
          console.log('[SceneExporter] exported (skinned meshes & bones stripped)');
        },
        err => console.error('[SceneExporter] export failed', err),
        { binary: true, embedImages: true, onlyVisible: false },
      );
    };
    window.addEventListener('mh-export-glb', handler);
    return () => window.removeEventListener('mh-export-glb', handler);
  }, [scene, chapter]);

  return null;
};
