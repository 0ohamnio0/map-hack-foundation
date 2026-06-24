import { useState } from 'react';

// WebGL 컨텍스트를 만들 수 있는 환경인지 첫 렌더에서 동기로 판정한다.
// R3F <Canvas>는 컨텍스트 생성에 실패해도 throw 없이 콘솔 에러+검은 화면만 남기므로,
// Canvas를 마운트하기 전에 미리 막아 안내 화면을 띄워야 한다.
// (GPU 블록리스트·하드웨어가속 off·샌드박스 등 — 코드로는 렌더 불가한 케이스)
// effect가 아니라 lazy initializer로 검사 → Canvas 마운트 전에 결과 확정.
// WebGL 가용성은 세션 중 바뀌지 않으므로 1회 검사로 충분.
export function useWebGLAvailable(): boolean {
  const [available] = useState(() => {
    if (typeof document === 'undefined') return true;
    try {
      const canvas = document.createElement('canvas');
      const gl =
        canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl');
      if (!gl) return false;
      // 프로브 컨텍스트는 즉시 반환 — 실제 게임 Canvas의 컨텍스트 슬롯을 점유하지 않게.
      (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
      return true;
    } catch {
      return false;
    }
  });

  return available;
}
