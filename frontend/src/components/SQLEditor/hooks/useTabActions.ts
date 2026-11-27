import { useEffect, useRef } from 'react';

/** 菜单 / 快捷键入口派发到 window 的 tab-action 事件 detail */
export interface TabActionDetail {
  action?: string;
  /** 明确指定目标标签页时只由它响应；不带则由当前显示的标签页响应 */
  tabKey?: string;
}

/**
 * 事件是否该由这个标签页响应
 */
export function tabActionTargets(
  detail: TabActionDetail | undefined,
  target: { tabKey?: string; isActive: boolean }
): boolean {
  if (!detail?.action) return false;
  if (detail.tabKey) return detail.tabKey === target.tabKey;
  return target.isActive;
}

export interface TabActionHandlers {
  executeQuery: () => void;
  save: () => void;
  saveAs: () => void;
}

/**
 * 响应来自菜单 / 快捷键的 tab-action（执行查询、保存、另存为）。
 * 事件冒泡到 window，所有已挂载的 SQL 标签页都收得到，只有当前标签页响应——
 * 此前每个编辑器都照做，按一次 ⌘R 会把后台标签页里的 SQL 也跑一遍。
 */
export function useTabActions(options: {
  tabKey?: string;
  isActive: boolean;
  handlers: TabActionHandlers;
}): void {
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TabActionDetail>).detail;
      const current = latest.current;
      if (!tabActionTargets(detail, current)) return;
      if (detail.action === 'execute-query') current.handlers.executeQuery();
      else if (detail.action === 'save') current.handlers.save();
      else if (detail.action === 'save-as') current.handlers.saveAs();
    };
    window.addEventListener('tab-action', handler);
    return () => window.removeEventListener('tab-action', handler);
  }, []);
}
