import { useHotkeys, Options as HotkeysOptions } from 'react-hotkeys-hook';
import { MENU_SHORTCUTS, MACOS_SHORTCUTS, isMacOS } from '../constants/menuShortcuts';

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

export function useMenuShortcuts(actions: MenuActions) {
  const isMac = isMacOS();

  // 文件操作
  useHotkeys('mod+n', () => actions.onNewConnection?.(), defaultOptions, [actions.onNewConnection]);
  useHotkeys('mod+o', () => actions.onOpenConnection?.(), defaultOptions, [actions.onOpenConnection]);
  useHotkeys('mod+s', () => actions.onSaveConnection?.(), defaultOptions, [actions.onSaveConnection]);
  useHotkeys('mod+shift+s', () => actions.onSaveAs?.(), defaultOptions, [actions.onSaveAs]);
  useHotkeys('mod+i', () => actions.onImport?.(), defaultOptions, [actions.onImport]);
  useHotkeys('mod+e', () => actions.onExport?.(), defaultOptions, [actions.onExport]);
  
  // 编辑操作 - 这些通常由浏览器/输入框默认处理，可选
  useHotkeys('mod+z', () => actions.onUndo?.(), defaultOptions, [actions.onUndo]);
  useHotkeys('mod+shift+z', () => actions.onRedo?.(), defaultOptions, [actions.onRedo]);
  useHotkeys('mod+x', () => actions.onCut?.(), defaultOptions, [actions.onCut]);
  useHotkeys('mod+c', () => actions.onCopy?.(), defaultOptions, [actions.onCopy]);
  useHotkeys('mod+v', () => actions.onPaste?.(), defaultOptions, [actions.onPaste]);
  useHotkeys('delete', () => actions.onDelete?.(), defaultOptions, [actions.onDelete]);
  useHotkeys('mod+a', () => actions.onSelectAll?.(), defaultOptions, [actions.onSelectAll]);
  useHotkeys('mod+f', () => actions.onFindReplace?.(), defaultOptions, [actions.onFindReplace]);
  
  // 查看操作
  useHotkeys('f5', () => actions.onRefresh?.(), defaultOptions, [actions.onRefresh]);
  useHotkeys('mod+=', () => actions.onZoomIn?.(), defaultOptions, [actions.onZoomIn]);
  useHotkeys('mod+-', () => actions.onZoomOut?.(), defaultOptions, [actions.onZoomOut]);
  useHotkeys('mod+0', () => actions.onZoomReset?.(), defaultOptions, [actions.onZoomReset]);
  useHotkeys('f11', () => actions.onToggleFullscreen?.(), defaultOptions, [actions.onToggleFullscreen]);
  
  // 连接操作
  useHotkeys('mod+shift+c', () => actions.onConnectSelected?.(), defaultOptions, [actions.onConnectSelected]);
  useHotkeys('mod+shift+d', () => actions.onDisconnect?.(), defaultOptions, [actions.onDisconnect]);
  useHotkeys('mod+q', () => actions.onNewQuery?.(), defaultOptions, [actions.onNewQuery]);
  useHotkeys('mod+enter', () => actions.onExecuteQuery?.(), defaultOptions, [actions.onExecuteQuery]);
  
  // 工具操作
  useHotkeys('mod+,', () => actions.onSettings?.(), defaultOptions, [actions.onSettings]);
  
  // 窗口操作
  useHotkeys('mod+t', () => actions.onNewTab?.(), defaultOptions, [actions.onNewTab]);
  useHotkeys('mod+w', () => actions.onCloseTab?.(), defaultOptions, [actions.onCloseTab]);
  useHotkeys('mod+tab', () => actions.onNextTab?.(), defaultOptions, [actions.onNextTab]);
  useHotkeys('mod+shift+tab', () => actions.onPreviousTab?.(), defaultOptions, [actions.onPreviousTab]);
  
  // 帮助操作
  useHotkeys('f1', () => actions.onHelp?.(), defaultOptions, [actions.onHelp]);

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
