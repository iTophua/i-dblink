import { useHotkeys, Options as HotkeysOptions } from 'react-hotkeys-hook';
import { MENU_SHORTCUTS, MACOS_SHORTCUTS, isMacOS } from '../constants/menuShortcuts';
import { useSettingsStore } from '../stores/settingsStore';

export interface MenuActions {
  onNewConnection?: () => void;
  onOpenConnection?: () => void;
  onSaveConnection?: () => void;
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
  onFindReplace?: () => void;
  onRefresh?: () => void;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
  onToggleFullscreen?: () => void;
  onConnectSelected?: () => void;
  onDisconnect?: () => void;
  onNewQuery?: () => void;
  onExecuteQuery?: () => void;
  onSettings?: () => void;
  onNewTab?: () => void;
  onCloseTab?: () => void;
  onNextTab?: () => void;
  onPreviousTab?: () => void;
  onHelp?: () => void;
}

const defaultOptions: HotkeysOptions = {
  enableOnFormTags: true,
  preventDefault: true,
  enabled: true,
};

// 获取快捷键配置（优先用户自定义，其次 macOS 特定，最后默认）
function getShortcutKeys(shortcutId: string, isMac: boolean): string {
  const { settings } = useSettingsStore.getState();
  
  // 1. 优先使用用户自定义的快捷键（兼容旧数据，shortcuts 可能不存在）
  if (settings.shortcuts && settings.shortcuts[shortcutId]) {
    return settings.shortcuts[shortcutId];
  }
  
  // 2. 查找默认配置
  const shortcut = MENU_SHORTCUTS.find(s => s.id === shortcutId);
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

  // 文件操作
  useHotkeys(getShortcutKeys('new-connection', isMac), () => actions.onNewConnection?.(), defaultOptions, [actions.onNewConnection]);
  useHotkeys(getShortcutKeys('open-connection', isMac), () => actions.onOpenConnection?.(), defaultOptions, [actions.onOpenConnection]);
  useHotkeys(getShortcutKeys('save-connection', isMac), () => actions.onSaveConnection?.(), defaultOptions, [actions.onSaveConnection]);
  useHotkeys(getShortcutKeys('save-as', isMac), () => actions.onSaveAs?.(), defaultOptions, [actions.onSaveAs]);
  useHotkeys(getShortcutKeys('import', isMac), () => actions.onImport?.(), defaultOptions, [actions.onImport]);
  useHotkeys(getShortcutKeys('export', isMac), () => actions.onExport?.(), defaultOptions, [actions.onExport]);
  
  // 编辑操作 - 这些由浏览器/输入框默认处理，不拦截默认行为
  // 只在非表单元素上触发自定义回调，表单元素上让浏览器原生处理
  const editOptions: HotkeysOptions = {
    enableOnFormTags: false,
    preventDefault: false,
    enabled: true,
  };
  useHotkeys(getShortcutKeys('undo', isMac), () => actions.onUndo?.(), editOptions, [actions.onUndo]);
  useHotkeys(getShortcutKeys('redo', isMac), () => actions.onRedo?.(), editOptions, [actions.onRedo]);
  useHotkeys(getShortcutKeys('cut', isMac), () => actions.onCut?.(), editOptions, [actions.onCut]);
  useHotkeys(getShortcutKeys('copy', isMac), () => actions.onCopy?.(), editOptions, [actions.onCopy]);
  useHotkeys(getShortcutKeys('paste', isMac), () => actions.onPaste?.(), editOptions, [actions.onPaste]);
  useHotkeys(getShortcutKeys('delete', isMac), () => actions.onDelete?.(), editOptions, [actions.onDelete]);
  useHotkeys(getShortcutKeys('select-all', isMac), () => actions.onSelectAll?.(), editOptions, [actions.onSelectAll]);
  useHotkeys(getShortcutKeys('find-replace', isMac), () => actions.onFindReplace?.(), editOptions, [actions.onFindReplace]);
  
  // 查看操作
  useHotkeys(getShortcutKeys('refresh', isMac), () => actions.onRefresh?.(), defaultOptions, [actions.onRefresh]);
  useHotkeys(getShortcutKeys('zoom-in', isMac), () => actions.onZoomIn?.(), defaultOptions, [actions.onZoomIn]);
  useHotkeys(getShortcutKeys('zoom-out', isMac), () => actions.onZoomOut?.(), defaultOptions, [actions.onZoomOut]);
  useHotkeys(getShortcutKeys('zoom-reset', isMac), () => actions.onZoomReset?.(), defaultOptions, [actions.onZoomReset]);
  useHotkeys(getShortcutKeys('toggle-fullscreen', isMac), () => actions.onToggleFullscreen?.(), defaultOptions, [actions.onToggleFullscreen]);
  
  // 连接操作
  useHotkeys(getShortcutKeys('connect-selected', isMac), () => actions.onConnectSelected?.(), defaultOptions, [actions.onConnectSelected]);
  useHotkeys(getShortcutKeys('disconnect', isMac), () => actions.onDisconnect?.(), defaultOptions, [actions.onDisconnect]);
  useHotkeys(getShortcutKeys('new-query', isMac), () => actions.onNewQuery?.(), defaultOptions, [actions.onNewQuery]);
  useHotkeys(getShortcutKeys('execute-query', isMac), () => actions.onExecuteQuery?.(), defaultOptions, [actions.onExecuteQuery]);
  
  // 工具操作
  useHotkeys(getShortcutKeys('settings', isMac), () => actions.onSettings?.(), defaultOptions, [actions.onSettings]);
  
  // 窗口操作
  useHotkeys(getShortcutKeys('new-tab', isMac), () => actions.onNewTab?.(), defaultOptions, [actions.onNewTab]);
  useHotkeys(getShortcutKeys('close-tab', isMac), () => actions.onCloseTab?.(), defaultOptions, [actions.onCloseTab]);
  useHotkeys(getShortcutKeys('next-tab', isMac), () => actions.onNextTab?.(), defaultOptions, [actions.onNextTab]);
  useHotkeys(getShortcutKeys('previous-tab', isMac), () => actions.onPreviousTab?.(), defaultOptions, [actions.onPreviousTab]);
  
  // 帮助操作
  useHotkeys(getShortcutKeys('contents', isMac), () => actions.onHelp?.(), defaultOptions, [actions.onHelp]);

  // macOS 特定快捷键
  if (isMac) {
    useHotkeys('mod+h', () => {
      import('@tauri-apps/api/app').then(({ hide }) => hide());
    }, defaultOptions, []);
    
    useHotkeys('mod+alt+h', () => {
      // hideOthers API may not be available in all Tauri versions
      console.log('Hide other applications');
    }, defaultOptions, []);
    
    useHotkeys('mod+m', () => {
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().minimize();
      });
    }, defaultOptions, []);
  }
}

// 获取快捷键显示文本（用于 UI 提示）
export function getShortcutDisplayText(shortcutId: string): string {
  const isMac = isMacOS();
  const keys = getShortcutKeys(shortcutId, isMac);
  
  if (!keys) return '';
  
  return keys
    .replace('mod+', isMac ? '⌘' : 'Ctrl+')
    .replace('shift+', '⇧')
    .replace('alt+', isMac ? '⌥' : 'Alt+')
    .replace('enter', '↵')
    .toUpperCase();
}