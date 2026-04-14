import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * 动态计算表格滚动高度的 Hook
 * 用于在 flex 布局中让表格自动填充剩余空间
 * 
 * @param dependencies - 触发重新计算的依赖项
 * @returns tableScrollHeight - 表格滚动区域的高度
 */
export function useTableScrollHeight(dependencies: any[] = []) {
  const [tableScrollHeight, setTableScrollHeight] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const statusBarRef = useRef<HTMLDivElement>(null);

  const calculateHeight = useCallback(() => {
    if (!containerRef.current) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const toolbarHeight = toolbarRef.current?.getBoundingClientRect().height || 0;
    const statusBarHeight = statusBarRef.current?.getBoundingClientRect().height || 0;
    
    // 容器总高度 - 工具栏高度 - 状态栏高度 - 边框
    const height = containerRect.height - toolbarHeight - statusBarHeight - 2;
    
    setTableScrollHeight(Math.max(300, height)); // 最小高度 300px
  }, []);

  useEffect(() => {
    calculateHeight();

    // 监听窗口大小变化
    window.addEventListener('resize', calculateHeight);
    
    // 使用 ResizeObserver 监听容器大小变化
    const observer = new ResizeObserver(calculateHeight);
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      window.removeEventListener('resize', calculateHeight);
      observer.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculateHeight]);

  return {
    tableScrollHeight,
    containerRef,
    toolbarRef,
    statusBarRef,
  };
}
