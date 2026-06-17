import { useState, useCallback, useEffect, useRef } from 'react';

export interface EditEntry {
  id: string;
  cells: Array<{ rowId: string; colId: string; oldValue: unknown; newValue: unknown }>;
}

export interface UseEditHistoryOptions {
  onRestore: (cells: Array<{ rowId: string; colId: string; value: unknown }>) => void;
  enabled?: boolean;
}

export function useEditHistory({ onRestore, enabled = true }: UseEditHistoryOptions) {
  const [history, setHistory] = useState<EditEntry[]>([]);
  const onRestoreRef = useRef(onRestore);
  useEffect(() => {
    onRestoreRef.current = onRestore;
  }, [onRestore]);

  const record = useCallback((cells: EditEntry['cells']) => {
    if (cells.length === 0) return;
    setHistory((h) => [...h, { id: `${Date.now()}-${Math.random()}`, cells }]);
  }, []);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      onRestoreRef.current(last.cells.map((c) => ({ rowId: c.rowId, colId: c.colId, value: c.oldValue })));
      return prev.slice(0, -1);
    });
  }, []);

  const clear = useCallback(() => {
    setHistory([]);
  }, []);

  // 精确移除与指定 rowId 相关的历史条目：
  // - 跨多行的 batch 条目只剔除该 rowId 的 cell，保留其他行
  // - 过滤后为空的条目整体删除
  // 不会触发 onRestore（调用方应已自行恢复行状态）
  const removeByRowId = useCallback((rowId: string) => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      let changed = false;
      const next = prev
        .map((entry) => {
          const filtered = entry.cells.filter((c) => c.rowId !== rowId);
          if (filtered.length === entry.cells.length) return entry;
          changed = true;
          if (filtered.length === 0) return null;
          return { ...entry, cells: filtered };
        })
        .filter((e): e is EditEntry => e !== null);
      return changed ? next : prev;
    });
  }, []);

  const hasHistory = history.length > 0;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, enabled]);

  return { record, undo, clear, removeByRowId, hasHistory };
}
