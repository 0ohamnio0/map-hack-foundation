/**
 * CH.4 — Pretext Typography Exhibit (auto-start)
 *
 * Wraps PretextDemo in game mode: auto-exhibit on mount,
 * no editor UI. Typing → glitch → ink bleed → CH.5 overlay.
 */
import React, { useEffect, useState } from 'react';
import PretextDemo from '@/pages/PretextDemo';

export const Ch4Screen: React.FC = () => {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 2100);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <PretextDemo autoExhibit />

      {loading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: '#000',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: '#f3eedd',
          fontFamily: '"Unifont", monospace',
          animation: 'ch4LoadingFadeOut 0.175s ease-in 1.925s forwards',
        }}>
          <div style={{ fontSize: 26, marginBottom: 14, animation: 'ch4LoadingSpin 1s linear infinite' }}>↻</div>
          <div style={{ fontSize: 15, letterSpacing: 8, marginBottom: 56 }}>l o a d i n g . . .</div>
          <div style={{ fontSize: 13, lineHeight: 1.75, textAlign: 'center' }}>
            팁: 모르는 번호로 전화가 오면 받기 전에 우선 "여보세요?"라고 물어보세요.
          </div>
          <style>{`
            @keyframes ch4LoadingSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            @keyframes ch4LoadingFadeOut { to { opacity: 0; } }
          `}</style>
        </div>
      )}
    </>
  );
};
