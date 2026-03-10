import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSoundManager } from '@/hooks/useSoundManager';

const TARGET = 'mahn_mal';

export const Ch5Screen: React.FC = () => {
  const { play, loop } = useSoundManager();
  const [text, setText] = useState('');
  const [count, setCount] = useState(0);
  const [showMessage, setShowMessage] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endingOpacity, setEndingOpacity] = useState(0);
  const textareaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    play('boot_sound');
    loop('pc_fan', true);
    return () => loop('pc_fan', false);
  }, [play, loop]);

  useEffect(() => {
    if (count >= 5 && !showMessage) {
      setShowMessage(true);
      setTimeout(() => setShowLink(true), 4000);
    }
  }, [count, showMessage]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (ending) return;

    setText(prev => {
      const next = prev + TARGET;
      const newCount = (next.match(/mahn_mal/g) || []).length;
      setCount(newCount);
      return next;
    });
  }, [ending]);

  const handleEndClick = () => {
    setEnding(true);
    setTimeout(() => setEndingOpacity(1), 100);
  };

  if (ending) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: '#000',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        opacity: endingOpacity,
        transition: 'opacity 2s ease',
      }}>
        <h1 style={{ fontFamily: 'monospace', color: '#fff', fontSize: '2rem', marginBottom: '1rem' }}>
          Map Hack
        </h1>
        <p style={{ fontFamily: 'monospace', color: '#aaa', fontSize: '1rem', marginBottom: '2rem' }}>
          by 송해민
        </p>
        <a
          href="#"
          style={{
            fontFamily: 'monospace',
            color: '#6af',
            fontSize: '0.9rem',
            textDecoration: 'underline',
          }}
        >
          화이트리버프레스
        </a>
      </div>
    );
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#fff',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 100,
      fontFamily: "'Malgun Gothic', 'AppleGothic', sans-serif",
    }}>
      {/* Top bar */}
      <div style={{
        height: 40,
        backgroundColor: '#f0f0f0',
        borderBottom: '1px solid #ddd',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 16,
      }}>
        <span style={{ fontWeight: 'bold', color: '#0068c8', fontSize: 16 }}>Blog</span>
        <div style={{
          flex: 1,
          maxWidth: 400,
          height: 24,
          backgroundColor: '#fff',
          border: '1px solid #ccc',
          borderRadius: 2,
          display: 'flex',
          alignItems: 'center',
          padding: '0 8px',
          fontSize: 12,
          color: '#666',
        }}>
          mahn_mal.xyz
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1 }}>
        {/* Sidebar */}
        <div style={{
          width: 160,
          backgroundColor: '#f8f8f8',
          borderRight: '1px solid #eee',
          padding: 16,
        }}>
          {['글 목록', '작가노트', '지나간 것들', 'about'].map(cat => (
            <div key={cat} style={{
              padding: '6px 0',
              fontSize: 13,
              color: '#333',
              cursor: 'pointer',
            }}>
              {cat}
            </div>
          ))}
        </div>

        {/* Main content */}
        <div style={{ flex: 1, padding: 24, outline: 'none' }}>
          <div
            ref={textareaRef}
            tabIndex={0}
            onKeyDown={handleKeyDown}
            style={{
              minHeight: 200,
              padding: 12,
              border: '1px solid #ddd',
              fontFamily: 'monospace',
              fontSize: 14,
              color: '#333',
              lineHeight: 1.6,
              outline: 'none',
              cursor: 'text',
              wordBreak: 'break-all',
            }}
          >
            {text || <span style={{ opacity: 0.4, animation: 'blink 1s step-end infinite' }}>|</span>}
          </div>

          {showMessage && (
            <p style={{
              marginTop: 24,
              fontFamily: 'monospace',
              fontSize: 14,
              color: '#666',
              fontStyle: 'italic',
            }}>
              I still have ten thousand words left to say...
            </p>
          )}

          {showLink && (
            <p
              onClick={handleEndClick}
              style={{
                marginTop: 16,
                fontFamily: 'monospace',
                fontSize: 14,
                color: '#0068c8',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              → 작가노트
            </p>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        height: 30,
        borderTop: '1px solid #eee',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        color: '#aaa',
      }}>
        powered by naver
      </div>
    </div>
  );
};
