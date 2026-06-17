import { useState, useCallback } from 'react';

interface FloatingWindowInfo {
  windowId: string;
  sqlTabKey: string;
  connectionId?: string;
  database?: string;
  defaultQuery?: string;
}

export function useFloatingWindowManager() {
  const [floatingWindows, setFloatingWindows] = useState<Map<string, FloatingWindowInfo>>(
    new Map()
  );

  // 创建浮动窗口（Wails 暂不支持多窗口，保留接口供后续实现）
  const createFloatingWindow = useCallback(
    async (sqlTabKey: string, connectionId?: string, database?: string, defaultQuery?: string) => {
      console.warn('Floating windows not supported in Wails v2 yet:', sqlTabKey);
      return null;
    },
    []
  );

  // 关闭浮动窗口
  const closeFloatingWindow = useCallback(async (sqlTabKey: string) => {
    // No-op for now
  }, []);

  // 更新浮动窗口内容
  const updateFloatingWindow = useCallback(
    async (
      sqlTabKey: string,
      updates: Partial<Omit<FloatingWindowInfo, 'windowId' | 'sqlTabKey'>>
    ) => {
      const info = floatingWindows.get(sqlTabKey);
      if (!info) return;

      setFloatingWindows((prev) => {
        const next = new Map(prev);
        const updated = { ...next.get(sqlTabKey)!, ...updates };
        next.set(sqlTabKey, updated);
        return next;
      });
    },
    [floatingWindows]
  );

  // 检查是否是浮动窗口标签
  const isFloatingTab = useCallback(
    (tabKey: string): boolean => {
      return floatingWindows.has(tabKey);
    },
    [floatingWindows]
  );

  // 获取浮动窗口信息
  const getFloatingTabInfo = useCallback(
    (tabKey: string): FloatingWindowInfo | undefined => {
      return floatingWindows.get(tabKey);
    },
    [floatingWindows]
  );

  // 清理：当标签关闭时清理浮动窗口
  const cleanupFloatingTab = useCallback(
    (tabKey: string) => {
      if (floatingWindows.has(tabKey)) {
        closeFloatingWindow(tabKey);
      }
    },
    [floatingWindows, closeFloatingWindow]
  );

  return {
    floatingWindows,
    createFloatingWindow,
    closeFloatingWindow,
    updateFloatingWindow,
    isFloatingTab,
    getFloatingTabInfo,
    cleanupFloatingTab,
  };
}
