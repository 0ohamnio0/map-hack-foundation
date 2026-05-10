import KeyboardHints from '@/components/game/KeyboardHints';

export default function KeyboardPreview() {
  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0a0a',
      color: '#ffffff',
      fontFamily: '"Unifont", monospace',
      padding: '4rem 2rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '3rem',
    }}>
      <h1 style={{ fontSize: '0.95rem', letterSpacing: 5, opacity: 0.7, margin: 0 }}>
        KEYBOARD · INDUSTRIAL ANNOTATION
      </h1>
      <KeyboardHints />
    </div>
  );
}
