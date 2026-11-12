import { useState, useRef, useCallback } from 'react';

const STORAGE_KEY = 'idblink:sql-editor-ratio';
const DEFAULT_RATIO = 0.5;
const MIN_RATIO = 0.15;
const MAX_RATIO = 0.85;

function clampRatio(value: number): number {
  return Math.max(MIN_RATIO, Math.min(MAX_RATIO, value));
}

function readStoredRatio(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const value = raw ? Number(raw) : NaN;
    if (Number.isFinite(value) && value >= MIN_RATIO && value <= MAX_RATIO) {
      return value;
    }
  } catch {
    // 存储不可用时使用默认比例
  }
  return DEFAULT_RATIO;
}

export function useEditorResizer() {
  // 可拖拽调整编辑器/结果面板高度；比例按窗口持久化，双击分隔条复位
  const [editorRatio, setEditorRatio] = useState(readStoredRatio);
  const isResizingRef = useRef(false);
  const latestRatioRef = useRef(editorRatio);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!isResizingRef.current || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newRatio = clampRatio((e.clientY - rect.top) / rect.height);
    latestRatioRef.current = newRatio;
    setEditorRatio(newRatio);
  }, []);

  const handleResizeEnd = useCallback(() => {
    isResizingRef.current = false;
    document.removeEventListener('mousemove', handleResizeMove);
    document.removeEventListener('mouseup', handleResizeEnd);
    try {
      localStorage.setItem(STORAGE_KEY, String(latestRatioRef.current));
    } catch {
      // 忽略存储失败，比例仍在本会话内生效
    }
  }, [handleResizeMove]);

  const handleResizeStart = useCallback(() => {
    isResizingRef.current = true;
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }, [handleResizeMove, handleResizeEnd]);

  const resetRatio = useCallback(() => {
    latestRatioRef.current = DEFAULT_RATIO;
    setEditorRatio(DEFAULT_RATIO);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // 忽略
    }
  }, []);

  return {
    editorRatio,
    containerRef,
    handleResizeStart,
    resetRatio,
  };
}
