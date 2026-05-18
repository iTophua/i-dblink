import { useHotkeys, Options as HotkeysOptions } from 'react-hotkeys-hook';
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

export function useMenuShortcuts(actions: MenuActions) {
  const isMac = isMacOS();

  // 辅助函数：注册快捷键，空字符串时禁用
  const register = (
    id: string,
    callback: () => void,
    options: HotkeysOptions = defaultOptions,
    deps: unknown[] = []
  ) => {
    const keys = getShortcutKeys(id, isMac);
    useHotkeys(
      keys || 'void',
      callback,
      { ...options, enabled: !!keys && options.enabled !== false },
      deps
    );
  };

  // 文件操作
  register('new-connection', () => actions.onNewConnection?.(), defaultOptions, [
    actions.onNewConnection,
  ]);
  register('save', () => actions.onSave?.(), defaultOptions, [actions.onSave]);
  register('save-as', () => actions.onSaveAs?.(), defaultOptions, [actions.onSaveAs]);
  register('import', () => actions.onImport?.(), defaultOptions, [actions.onImport]);
  register('export', () => actions.onExport?.(), defaultOptions, [actions.onExport]);
  register('exit', () => actions.onQuit?.(), defaultOptions, [actions.onQuit]);

  // 编辑操作 - 这些由浏览器/输入框默认处理，不拦截默认行为
  // 只在非表单元素上触发自定义回调，表单元素上让浏览器原生处理
  const editOptions: HotkeysOptions = {
    enableOnFormTags: false,
    preventDefault: false,
    enabled: true,
  };
  register('undo', () => actions.onUndo?.(), editOptions, [actions.onUndo]);
  register('redo', () => actions.onRedo?.(), editOptions, [actions.onRedo]);
  register('cut', () => actions.onCut?.(), editOptions, [actions.onCut]);
  register('copy', () => actions.onCopy?.(), editOptions, [actions.onCopy]);
  register('paste', () => actions.onPaste?.(), editOptions, [actions.onPaste]);
  register('delete', () => actions.onDelete?.(), editOptions, [actions.onDelete]);
  register('select-all', () => actions.onSelectAll?.(), editOptions, [actions.onSelectAll]);
  register('find', () => actions.onFind?.(), editOptions, [actions.onFind]);

  // 查看操作
  register('refresh', () => actions.onRefresh?.(), defaultOptions, [actions.onRefresh]);
  register('zoom-in', () => actions.onZoomIn?.(), defaultOptions, [actions.onZoomIn]);
  register('zoom-out', () => actions.onZoomOut?.(), defaultOptions, [actions.onZoomOut]);
  register('zoom-reset', () => actions.onZoomReset?.(), defaultOptions, [actions.onZoomReset]);
  register('fullscreen', () => actions.onFullscreen?.(), defaultOptions, [actions.onFullscreen]);

  // 连接操作
  register('connect-selected', () => actions.onConnectSelected?.(), defaultOptions, [
    actions.onConnectSelected,
  ]);
  register('disconnect', () => actions.onDisconnect?.(), defaultOptions, [actions.onDisconnect]);
  register('new-query', () => actions.onNewQuery?.(), defaultOptions, [actions.onNewQuery]);
  register('execute-query', () => actions.onExecuteQuery?.(), defaultOptions, [
    actions.onExecuteQuery,
  ]);
  register('close-all', () => {}, defaultOptions, []);

  // 工具操作
  register('options', () => actions.onOptions?.(), defaultOptions, [actions.onOptions]);
  register('search', () => actions.onSearch?.(), defaultOptions, [actions.onSearch]);

  // 窗口操作
  register('new-tab', () => actions.onNewTab?.(), defaultOptions, [actions.onNewTab]);
  register('close-tab', () => actions.onCloseTab?.(), defaultOptions, [actions.onCloseTab]);
  register('next-tab', () => actions.onNextTab?.(), defaultOptions, [actions.onNextTab]);
  register('prev-tab', () => actions.onPrevTab?.(), defaultOptions, [actions.onPrevTab]);

  // 帮助操作
  register('documentation', () => actions.onDocumentation?.(), defaultOptions, [
    actions.onDocumentation,
  ]);

  // macOS 特定快捷键
  if (isMac) {
    useHotkeys(
      'mod+h',
      () => {
        import('@tauri-apps/api/app').then(({ hide }) => hide());
      },
      defaultOptions,
      []
    );

    useHotkeys(
      'mod+alt+h',
      () => {
        // hideOthers API may not be available in all Tauri versions
        console.log('Hide other applications');
      },
      defaultOptions,
      []
    );

    useHotkeys(
      'mod+m',
      () => {
        import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
          getCurrentWindow().minimize();
        });
      },
      defaultOptions,
      []
    );
  }
}
