import { useState, useCallback, useRef, useEffect } from 'react';
import { Window } from '@tauri-apps/api/window';

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
  const windowRefs = useRef<Map<string, Window>>(new Map());

  // 创建浮动窗口
  const createFloatingWindow = useCallback(
    async (sqlTabKey: string, connectionId?: string, database?: string, defaultQuery?: string) => {
      const windowId = `floating-sql-${sqlTabKey}`;

      try {
        // 创建新窗口
        const window = new Window(windowId, {
          title: `SQL 查询 - ${sqlTabKey}`,
          width: 1000,
          height: 700,
        });

        windowRefs.current.set(windowId, window);

        const newInfo: FloatingWindowInfo = {
          windowId,
          sqlTabKey,
          connectionId,
          database,
          defaultQuery,
        };

        setFloatingWindows((prev) => {
          const next = new Map(prev);
          next.set(sqlTabKey, newInfo);
          return next;
        });

        return windowId;
      } catch (error) {
        console.error('Failed to create floating window:', error);
        return null;
      }
    },
    []
  );

  // 关闭浮动窗口
  const closeFloatingWindow = useCallback(async (sqlTabKey: string) => {
    const windowId = `floating-sql-${sqlTabKey}`;
    const window = windowRefs.current.get(windowId);

    if (window) {
      try {
        await window.close();
      } catch (error) {
        console.error('Failed to close floating window:', error);
      }
      windowRefs.current.delete(windowId);
    }

    setFloatingWindows((prev) => {
      const next = new Map(prev);
      next.delete(sqlTabKey);
      return next;
    });
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
