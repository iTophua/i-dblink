import { useEffect, useState } from 'react';

interface SplashScreenProps {
  onFinish: () => void;
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setFadeOut(true), 800);
    const finishTimer = setTimeout(() => onFinish(), 1200);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(finishTimer);
    };
  }, [onFinish]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0a0f1c 0%, #1a1f3a 50%, #0d1226 100%)',
        zIndex: 9999,
        transition: 'opacity 0.4s ease-out',
        opacity: fadeOut ? 0 : 1,
        pointerEvents: fadeOut ? 'none' : 'auto',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: 20,
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            boxShadow: '0 0 60px rgba(99, 102, 241, 0.4), 0 0 120px rgba(139, 92, 246, 0.2)',
            animation: 'pulse-glow 2s ease-in-out infinite',
          }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L2 7L12 12L22 7L12 2Z"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
            <path
              d="M2 17L12 22L22 17"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.7"
            />
            <path
              d="M2 12L12 17L22 12"
              stroke="white"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.5"
            />
          </svg>
        </div>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: '#ffffff',
            margin: 0,
            letterSpacing: 4,
            textShadow: '0 0 30px rgba(99, 102, 241, 0.5)',
          }}
        >
          iDBLink
        </h1>
        <p
          style={{
            fontSize: 13,
            color: 'rgba(255, 255, 255, 0.4)',
            margin: '12px 0 0',
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          Database Management
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'rgba(139, 92, 246, 0.8)',
              animation: `bounce 1.4s ease-in-out ${i * 0.16}s infinite both`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 40px rgba(99, 102, 241, 0.3), 0 0 80px rgba(139, 92, 246, 0.15); }
          50% { box-shadow: 0 0 60px rgba(99, 102, 241, 0.5), 0 0 120px rgba(139, 92, 246, 0.25); }
        }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
