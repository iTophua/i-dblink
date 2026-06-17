import { useHotkeys, Options as HotkeysOptions } from 'react-hotkeys-hook';
import { useCallback, useRef } from 'react';
import { MENU_SHORTCUTS, isMacOS } from '../constants/menuShortcuts';
import { useSettingsStore } from '../stores/settingsStore';

export interface MenuActions {
  onNewConnection?: () => void;
  onSave?: () => void;
  onSaveAs?: () => void;
  onImport?: () => void;
  onExport?: () => void;
  onQuit?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onCut?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onDelete?: () => void;
  onSelectAll?: () => void;
  onFind?: () => void;
  onRefresh?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onFullscreen?: () => void;
  onConnectSelected?: () => void;
  onDisconnect?: () => void;
  onNewQuery?: () => void;
  onExecuteQuery?: () => void;
  onOptions?: () => void;
  onSearch?: () => void;
  onNewTab?: () => void;
  onCloseTab?: () => void;
  onNextTab?: () => void;
  onPrevTab?: () => void;
  onDocumentation?: () => void;
}

const defaultOptions: HotkeysOptions = {
  enableOnFormTags: true,
  preventDefault: true,
  enabled: true,
};

// 获取快捷键配置（优先用户自定义，其次 macOS 特定，最后默认）
// 返回空字符串表示该快捷键已被用户禁用
function getShortcutKeys(shortcutId: string, isMac: boolean): string {
  const { settings } = useSettingsStore.getState();

  // 1. 优先使用用户自定义的快捷键（兼容旧数据，shortcuts 可能不存在）
  if (settings.shortcuts && shortcutId in settings.shortcuts) {
    return settings.shortcuts[shortcutId];
  }

  // 2. 查找默认配置
  const shortcut = MENU_SHORTCUTS.find((s) => s.id === shortcutId);
  if (!shortcut) return '';

  // 3. macOS 优先使用 macKeys
  if (isMac && shortcut.macKeys) {
    return shortcut.macKeys;
  }

  // 4. 返回默认 keys
  return shortcut.keys;
}

export function useMenuShortcuts(actions?: MenuActions) {
  const isMac = isMacOS();
  const safeActions = actions ?? {};

  // 通用的 registerShortcut 函数，使用原生事件监听（避免 Hook 规则问题）
  const activeShortcutsRef = useRef<Set<string>>(new Set());
  
  const registerShortcut = useCallback(
    (id: string, callback: () => void, options: HotkeysOptions = defaultOptions) => {
      const keys = getShortcutKeys(id, isMac);
      if (!keys) return () => {}; // 返回空清理函数
      
      const isFormElement = (el: EventTarget | null): boolean => {
        if (!el || !(el instanceof Element)) return false;
        const tag = el.tagName.toLowerCase();
        return tag === 'input' || tag === 'textarea' || tag === 'select' ||
          el.getAttribute('contenteditable') === 'true' ||
          el.closest('.monaco-editor') !== null;
      };

      const handler = (e: KeyboardEvent) => {
        // 跳过表单元素中的快捷键拦截，让浏览器原生处理
        if (!options.enableOnFormTags && isFormElement(e.target)) return;

        // 解析快捷键字符串（简化版，支持 mod+key 格式）
        const parts = keys.toLowerCase().split('+');
        const key = parts[parts.length - 1];
        const needsMod = parts.includes('mod');
        const needsShift = parts.includes('shift');
        const needsAlt = parts.includes('alt');
        
        const isMod = isMac ? e.metaKey : e.ctrlKey;
        
        if (
          e.key.toLowerCase() === key &&
          (!needsMod || isMod) &&
          (!needsShift || e.shiftKey) &&
          (!needsAlt || e.altKey)
        ) {
          if (options.preventDefault !== false) {
            e.preventDefault();
          }
          callback();
        }
      };
      
      document.addEventListener('keydown', handler);
      activeShortcutsRef.current.add(id);
      
      // 返回清理函数
      return () => {
        document.removeEventListener('keydown', handler);
        activeShortcutsRef.current.delete(id);
      };
    },
    [isMac]
  );

  // 编辑操作的快捷键由浏览器原生处理（input/textarea 中的 Ctrl+C/V），
  // 不注册 useHotkeys 以避免干扰原生剪贴板行为
  const editIds = new Set(['undo', 'redo', 'cut', 'copy', 'paste', 'delete', 'select-all', 'find']);

  // 辅助函数：注册标准菜单快捷键
  const register = (
    id: string,
    callback: () => void,
    options: HotkeysOptions = defaultOptions,
    deps: unknown[] = []
  ) => {
    // 编辑操作跳过 useHotkeys 注册，交给浏览器原生处理
    if (editIds.has(id)) return;
    const keys = getShortcutKeys(id, isMac);
    useHotkeys(
      keys || 'void',
      callback,
      { ...options, enabled: !!keys && options.enabled !== false },
      deps
    );
  };

  // 文件操作
  register('new-connection', () => safeActions.onNewConnection?.(), defaultOptions, [
    safeActions.onNewConnection,
  ]);
  register('save', () => safeActions.onSave?.(), defaultOptions, [safeActions.onSave]);
  register('save-as', () => safeActions.onSaveAs?.(), defaultOptions, [safeActions.onSaveAs]);
  register('import', () => safeActions.onImport?.(), defaultOptions, [safeActions.onImport]);
  register('export', () => safeActions.onExport?.(), defaultOptions, [safeActions.onExport]);
  register('exit', () => safeActions.onQuit?.(), defaultOptions, [safeActions.onQuit]);

  // 编辑操作（剪切/复制/粘贴等）由浏览器原生处理，不注册 useHotkeys
  // 以避免干扰 input/textarea 中的 Ctrl+C/V 等原生快捷操作

  // 查看操作
  register('refresh', () => safeActions.onRefresh?.(), defaultOptions, [safeActions.onRefresh]);
  register('zoom-in', () => safeActions.onZoomIn?.(), defaultOptions, [safeActions.onZoomIn]);
  register('zoom-out', () => safeActions.onZoomOut?.(), defaultOptions, [safeActions.onZoomOut]);
  register('zoom-reset', () => safeActions.onZoomReset?.(), defaultOptions, [safeActions.onZoomReset]);
  register('fullscreen', () => safeActions.onFullscreen?.(), defaultOptions, [safeActions.onFullscreen]);

  // 连接操作
  register('connect-selected', () => safeActions.onConnectSelected?.(), defaultOptions, [
    safeActions.onConnectSelected,
  ]);
  register('disconnect', () => safeActions.onDisconnect?.(), defaultOptions, [safeActions.onDisconnect]);
  register('new-query', () => safeActions.onNewQuery?.(), defaultOptions, [safeActions.onNewQuery]);
  register('execute-query', () => safeActions.onExecuteQuery?.(), defaultOptions, [
    safeActions.onExecuteQuery,
  ]);
  register('close-all', () => {}, defaultOptions, []);

  // 工具操作
  register('options', () => safeActions.onOptions?.(), defaultOptions, [safeActions.onOptions]);
  register('search', () => safeActions.onSearch?.(), defaultOptions, [safeActions.onSearch]);

  // 窗口操作
  register('new-tab', () => safeActions.onNewTab?.(), defaultOptions, [safeActions.onNewTab]);
  register('close-tab', () => safeActions.onCloseTab?.(), defaultOptions, [safeActions.onCloseTab]);
  register('next-tab', () => safeActions.onNextTab?.(), defaultOptions, [safeActions.onNextTab]);
  register('prev-tab', () => safeActions.onPrevTab?.(), defaultOptions, [safeActions.onPrevTab]);

  // 帮助操作
  register('documentation', () => safeActions.onDocumentation?.(), defaultOptions, [
    safeActions.onDocumentation,
  ]);

  // 开发者工具由 Go 菜单处理（F12 / Cmd+Shift+F12），不在前端注册 useHotkeys
  // 避免与系统菜单快捷键冲突

  // macOS 特定快捷键
  if (isMac) {
    useHotkeys(
      'mod+h',
      () => {
        import('../../wailsjs/runtime/runtime').then(({ Hide }) => Hide());
      },
      defaultOptions,
      []
    );

    useHotkeys(
      'mod+alt+h',
      () => {
        console.log('Hide other applications');
      },
      defaultOptions,
      []
    );

    useHotkeys(
      'mod+m',
      () => {
        import('../../wailsjs/runtime/runtime').then(({ WindowMinimise }) => WindowMinimise());
      },
      defaultOptions,
      []
    );
  }

  return { registerShortcut };
}
