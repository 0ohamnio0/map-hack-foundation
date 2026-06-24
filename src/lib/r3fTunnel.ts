import tunnel from 'tunnel-rat';

// 단일 영속 WebGL 컨텍스트 공유용 터널.
// CH1~3 씬은 각자 <Canvas>를 띄우는 대신 3D 내용을 <r3f.In>으로 감싼다.
// Game.tsx의 영속 <Canvas> 안 <r3f.Out/>이 그 내용을 받아 렌더 → 챕터 전환 시
// 컨텍스트 재생성 없이 씬 콘텐츠만 mount/unmount. (씬 컴포넌트 구조·HUD 브리지는 그대로 유지)
export const r3f = tunnel();
