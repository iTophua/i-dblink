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
        // 跟随主题底色（浅色用户不再闪深色底），与主界面无缝衔接
        background: 'var(--background, #F2F1ED)',
        zIndex: 9999,
        transition: 'opacity 0.4s ease-out',
        opacity: fadeOut ? 0 : 1,
        pointerEvents: fadeOut ? 'none' : 'auto',
      }}
    >
      <div style={{ textAlign: 'center', marginBottom: 44 }}>
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: 18,
            // 纯净实心主色（去渐变/去辉光/去脉冲动画），与 app 视觉语言一致
            background: 'var(--color-primary, #4A5DD6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 22px',
          }}
        >
          <svg width="38" height="38" viewBox="0 0 24 24" fill="none">
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
            fontSize: 26,
            fontWeight: 700,
            color: 'var(--text-primary, #1C2433)',
            margin: 0,
            letterSpacing: 3,
          }}
        >
          iDBLink
        </h1>
        <p
          style={{
            fontSize: 12,
            color: 'var(--text-tertiary, #8A93A8)',
            margin: '10px 0 0',
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
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--color-primary, #4A5DD6)',
              opacity: 0.7,
              animation: `bounce 1.4s ease-in-out ${i * 0.16}s infinite both`,
            }}
          />
        ))}
      </div>

      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.35; }
          40% { transform: scale(1); opacity: 0.9; }
        }
      `}</style>
    </div>
  );
}
