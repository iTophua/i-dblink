/**
 * 跨平台快捷键映射表
 * mod 会自动适配 Cmd (macOS) 或 Ctrl (Windows/Linux)
 */
export interface ShortcutMapping {
  id: string;
  keys: string;
  macKeys?: string; // macOS 专用快捷键
  description: string;
  category: 'file' | 'edit' | 'view' | 'connection' | 'tools' | 'window' | 'help';
}

export const MENU_SHORTCUTS: ShortcutMapping[] = [
  // 文件操作
  { id: 'new-connection', keys: 'mod+n', description: '新建连接', category: 'file' },
  { id: 'open-connection', keys: 'mod+o', description: '打开连接', category: 'file' },
  { id: 'save-connection', keys: 'mod+s', description: '保存连接', category: 'file' },
  { id: 'save-as', keys: 'mod+shift+s', description: '另存为', category: 'file' },
  { id: 'import', keys: 'mod+i', description: '导入', category: 'file' },
  { id: 'export', keys: 'mod+e', description: '导出', category: 'file' },

  // 编辑操作
  { id: 'undo', keys: 'mod+z', description: '撤销', category: 'edit' },
  { id: 'redo', keys: 'mod+shift+z', description: '重做', category: 'edit' },
  { id: 'cut', keys: 'mod+x', description: '剪切', category: 'edit' },
  { id: 'copy', keys: 'mod+c', description: '复制', category: 'edit' },
  { id: 'paste', keys: 'mod+v', description: '粘贴', category: 'edit' },
  { id: 'delete', keys: 'delete', description: '删除', category: 'edit' },
  { id: 'select-all', keys: 'mod+a', description: '全选', category: 'edit' },
  { id: 'find-replace', keys: 'mod+f', description: '查找替换', category: 'edit' },

  // 查看操作
  { id: 'refresh', keys: 'f5', description: '刷新', category: 'view' },
  { id: 'zoom-in', keys: 'mod+=', description: '放大', category: 'view' },
  { id: 'zoom-out', keys: 'mod+-', description: '缩小', category: 'view' },
  { id: 'zoom-reset', keys: 'mod+0', description: '实际大小', category: 'view' },
  { id: 'toggle-fullscreen', keys: 'f11', description: '全屏切换', category: 'view' },

  // 连接操作
  { id: 'connect-selected', keys: 'mod+shift+c', description: '连接所选', category: 'connection' },
  { id: 'disconnect', keys: 'mod+shift+d', description: '断开连接', category: 'connection' },
  { id: 'new-query', keys: 'mod+q', description: '新建查询', category: 'connection' },
  // macOS 默认 Cmd+R，其他平台 Ctrl+Enter
  {
    id: 'execute-query',
    keys: 'mod+enter',
    macKeys: 'mod+r',
    description: '执行查询',
    category: 'connection',
  },

  // 工具操作
  { id: 'settings', keys: 'mod+,', description: '设置', category: 'tools' },

  // 窗口操作
  { id: 'new-tab', keys: 'mod+t', description: '新建标签页', category: 'window' },
  { id: 'close-tab', keys: 'mod+w', description: '关闭标签页', category: 'window' },
  { id: 'next-tab', keys: 'mod+tab', description: '下一个标签页', category: 'window' },
  { id: 'previous-tab', keys: 'mod+shift+tab', description: '上一个标签页', category: 'window' },

  // 帮助操作
  { id: 'contents', keys: 'f1', description: '帮助目录', category: 'help' },
];

/**
 * macOS 特定快捷键
 */
export const MACOS_SHORTCUTS: ShortcutMapping[] = [
  { id: 'hide-app', keys: 'mod+h', description: '隐藏应用', category: 'window' },
  { id: 'hide-others', keys: 'mod+alt+h', description: '隐藏其他', category: 'window' },
  { id: 'minimize', keys: 'mod+m', description: '最小化', category: 'window' },
];

/**
 * 按分类获取快捷键
 */
export function getShortcutsByCategory(category: ShortcutMapping['category']): ShortcutMapping[] {
  return MENU_SHORTCUTS.filter((s) => s.category === category);
}

/**
 * 检查是否为 macOS 平台
 */
export function isMacOS(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac');
}
