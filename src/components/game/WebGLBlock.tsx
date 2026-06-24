import React from 'react';

/**
 * 그래픽(WebGL)을 쓸 수 없을 때 게임 대신 띄우는 안내 화면.
 * - reason="unavailable": 컨텍스트 생성 자체가 불가(GPU 블록리스트·하드웨어가속 off·샌드박스).
 *   useWebGLAvailable로 Canvas 마운트 전에 막아, 검은 화면 대신 "왜 안 되는지"를 안내한다.
 * - reason="lost": 생성 후 컨텍스트 손실(드라이버 크래시·탭 백그라운드 등).
 */
export const WebGLBlock: React.FC<{ reason?: 'unavailable' | 'lost' }> = ({
  reason = 'unavailable',
}) => {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99999, background: '#000',
      color: '#f3eedd', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 18,
      fontFamily: '"Unifont", monospace', textAlign: 'center', padding: 24,
    }}>
      <div style={{ fontSize: 15, letterSpacing: 2, lineHeight: 1.9 }}>
        {reason === 'lost' ? (
          <>
            그래픽(WebGL) 컨텍스트가 손실되었습니다.<br />
            브라우저 하드웨어 가속을 켠 뒤 새로고침해 주세요.<br />
          </>
        ) : (
          <>
            이 게임은 그래픽 가속(WebGL)이 필요합니다.<br />
            지금 브라우저에서 WebGL이 꺼져 있어 화면이 표시되지 않습니다.<br />
            브라우저 하드웨어 가속을 켠 뒤 새로고침해 주세요.<br />
            <span style={{ opacity: 0.75, fontSize: 13 }}>
              This game needs WebGL. It's disabled in your browser — enable hardware acceleration and reload.
            </span>
            <br />
          </>
        )}
        <span style={{ opacity: 0.6, fontSize: 12 }}>
          Chrome 설정 → 시스템 → "사용 가능한 경우 하드웨어 가속 사용" ON → 재시작
        </span>
      </div>
      <button
        onClick={() => window.location.reload()}
        style={{
          fontFamily: '"Unifont", monospace', fontSize: 13, letterSpacing: 2,
          color: '#f3eedd', background: 'transparent',
          border: '1px solid rgba(243,238,221,0.5)', borderRadius: 2,
          padding: '8px 20px', cursor: 'pointer',
        }}
      >
        새로고침 / Reload
      </button>
    </div>
  );
};
