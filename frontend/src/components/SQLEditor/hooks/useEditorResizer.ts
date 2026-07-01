import { useState, useRef, useCallback } from 'react';

export function useEditorResizer() {
  // 可拖拽调整编辑器/结果面板高度
  const [editorRatio, setEditorRatio] = useState(0.5); // 默认编辑器和结果面板各占 50%
  const isResizingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newRatio = (e.clientY - rect.top) / rect.height;
    setEditorRatio(Math.max(0.15, Math.min(0.85, newRatio)));
  }, []);

  const handleResizeEnd = useCallback(() => {
    isResizingRef.current = false;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove]);

  const handleResizeStart = useCallback(() => {
    isResizingRef.current = true;
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove, handleResizeEnd]);

  return {
    editorRatio,
    containerRef,
    handleResizeStart,
  };
}
