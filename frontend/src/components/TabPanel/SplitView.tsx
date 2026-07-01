import React, { useCallback, useRef, useEffect } from 'react';

export type SplitDirection = 'horizontal' | 'vertical';

interface SplitViewProps {
  direction: SplitDirection;
  ratio: number;
  onRatioChange: (ratio: number) => void;
  primary: React.ReactNode;
  secondary: React.ReactNode;
}

const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;
const DIVIDER_SIZE = 4;

/**
 * SplitView renders two panes separated by a draggable divider.
 *
 * - `direction='horizontal'` → left / right
 * - `direction='vertical'`   → top  / bottom
 */
export function SplitView({
  direction,
  ratio,
  onRatioChange,
  primary,
  secondary,
}: SplitViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const handlersRef = useRef<{ move: ((ev: MouseEvent) => void) | null; up: (() => void) | null }>({
    move: null,
    up: null,
  });

  const isHorizontal = direction === 'horizontal';

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      draggingRef.current = true;
      document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize';
      document.body.style.userSelect = 'none';

      const handleMouseMove = (ev: MouseEvent) => {
        if (!draggingRef.current || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        let newRatio: number;
        if (isHorizontal) {
          newRatio = (ev.clientX - rect.left) / rect.width;
        } else {
          newRatio = (ev.clientY - rect.top) / rect.height;
        }
        onRatioChange(Math.max(MIN_RATIO, Math.min(MAX_RATIO, newRatio)));
      };

      const handleMouseUp = () => {
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        handlersRef.current = { move: null, up: null };
      };

      handlersRef.current = { move: handleMouseMove, up: handleMouseUp };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [isHorizontal, onRatioChange]
  );

  // Double-click divider to reset to 50/50
  const handleDoubleClick = useCallback(() => {
    onRatioChange(0.5);
  }, [onRatioChange]);

  // Cleanup document event listeners on unmount
  useEffect(() => {
    return () => {
      if (handlersRef.current.move) {
        document.removeEventListener('mousemove', handlersRef.current.move);
      }
      if (handlersRef.current.up) {
        document.removeEventListener('mouseup', handlersRef.current.up);
      }
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, []);

  const dividerStyle: React.CSSProperties = {
    flexShrink: 0,
    background: 'var(--border)',
    position: 'relative',
    ...(isHorizontal
      ? { width: DIVIDER_SIZE, cursor: 'col-resize' }
      : { height: DIVIDER_SIZE, cursor: 'row-resize' }),
  };

  const handleStyle: React.CSSProperties = {
    position: 'absolute',
    ...(isHorizontal
      ? {
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 4,
          height: 24,
        }
      : {
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          height: 4,
          width: 24,
        }),
    borderRadius: 2,
    background: 'var(--text-tertiary)',
    opacity: 0.5,
    transition: 'opacity 0.15s',
  };

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: isHorizontal ? 'row' : 'column',
        overflow: 'hidden',
        minHeight: 0,
      }}
    >
      <div
        style={{
          flex: `0 0 ${ratio * 100}%`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {primary}
      </div>

      <div
        style={dividerStyle}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
      >
        <div style={handleStyle} />
      </div>

      <div
        style={{
          flex: 1,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        {secondary}
      </div>
    </div>
  );
}

export default SplitView;
