import React, { useEffect, useMemo, useState } from 'react';
import { useGlitchText } from '@/hooks/useGlitchText';

/**
 * 모바일/태블릿 접속 시 게임 대신 표시하는 차단 화면.
 * StartScreen notice phase의 룩(검정 배경·Unifont·베이지·한·영 글리치)을 그대로 차용한다.
 */
export const MobileBlock: React.FC = () => {
  const noticeTexts = useMemo(
    () => ['이 게임은 PC 환경에서만 플레이하실 수 있습니다.', 'This game is playable on PC only.'],
    []
  );
  const notice = useGlitchText(noticeTexts, { interval: 3200, scrambleMs: 700 });

  // StartScreen과 동일하게 디자인 기준 footprint 대비 뷰포트 비율로 zoom 산출.
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    const DESIGN_W = 560;
    const compute = () => setZoom(Math.min(1, window.innerWidth / DESIGN_W));
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#0a0a0a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        zIndex: 100,
        padding: '0 24px',
      }}
    >
      <div
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: 'center center',
          fontFamily: '"Unifont", monospace',
          color: '#f3eedd',
          textAlign: 'center',
          width: 520,
          fontSize: '1.05rem',
          letterSpacing: 3,
          lineHeight: 1.6,
        }}
      >
        {notice}
      </div>
    </div>
  );
};
