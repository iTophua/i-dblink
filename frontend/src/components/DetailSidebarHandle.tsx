import React, { useCallback, useRef } from 'react';

interface DetailSidebarHandleProps {
  width: number;
  onWidthChange: (width: number) => void;
}

/**
 * 对象页右侧详情侧栏的调宽手柄：按住左右拖动改宽度（200–600）。
 * 表详情、过程 / 函数 / 触发器 / 序列详情共用
 */
export function DetailSidebarHandle({ width, onWidthChange }: DetailSidebarHandleProps) {
  const isDraggingRef = useRef(false);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      const startX = e.clientX;
      const startWidth = width;
      const onMouseMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const newWidth = Math.max(200, Math.min(600, startWidth + startX - ev.clientX));
        onWidthChange(newWidth);
      };
      const onMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [width, onWidthChange]
  );

  return (
    <div
      onMouseDown={handleDragStart}
      style={{
        width: 4,
        cursor: 'col-resize',
        background: 'var(--border)',
        transition: 'background 0.2s',
        flexShrink: 0,
        alignSelf: 'stretch',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'var(--color-primary)';
      }}
      onMouseLeave={(e) => {
        if (!isDraggingRef.current) {
          (e.currentTarget as HTMLDivElement).style.background = 'var(--border)';
        }
      }}
    />
  );
}
