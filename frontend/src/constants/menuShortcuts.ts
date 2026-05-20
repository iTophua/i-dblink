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
  { id: 'save', keys: 'mod+s', description: '保存', category: 'file' },
  { id: 'save-as', keys: 'mod+shift+s', description: '另存为', category: 'file' },
  { id: 'import', keys: 'mod+i', description: '导入', category: 'file' },
  { id: 'export', keys: 'mod+e', description: '导出', category: 'file' },
  { id: 'exit', keys: 'mod+shift+x', description: '退出', category: 'file' },

  // 编辑操作
  { id: 'undo', keys: 'mod+z', description: '撤销', category: 'edit' },
  { id: 'redo', keys: 'mod+shift+z', description: '重做', category: 'edit' },
  { id: 'cut', keys: 'mod+x', description: '剪切', category: 'edit' },
  { id: 'copy', keys: 'mod+c', description: '复制', category: 'edit' },
  { id: 'paste', keys: 'mod+v', description: '粘贴', category: 'edit' },
  { id: 'delete', keys: 'delete', description: '删除', category: 'edit' },
  { id: 'select-all', keys: 'mod+a', description: '全选', category: 'edit' },
  { id: 'find', keys: 'mod+f', description: '查找替换', category: 'edit' },

  // 查看操作
  { id: 'refresh', keys: 'f5', description: '刷新', category: 'view' },
  { id: 'zoom-in', keys: 'mod+=', description: '放大', category: 'view' },
  { id: 'zoom-out', keys: 'mod+-', description: '缩小', category: 'view' },
  { id: 'zoom-reset', keys: 'mod+0', description: '实际大小', category: 'view' },
  { id: 'fullscreen', keys: 'f11', description: '全屏切换', category: 'view' },

  // 连接操作
  { id: 'connect-selected', keys: 'mod+shift+c', description: '连接所选', category: 'connection' },
  { id: 'disconnect', keys: 'mod+shift+d', description: '断开连接', category: 'connection' },
  { id: 'new-query', keys: 'mod+shift+q', description: '新建查询', category: 'connection' },
  // macOS 默认 Cmd+R，其他平台 Ctrl+Enter
  {
    id: 'execute-query',
    keys: 'mod+enter',
    macKeys: 'mod+r',
    description: '执行查询',
    category: 'connection',
  },
  { id: 'close-all', keys: 'mod+shift+l', description: '关闭所有连接', category: 'connection' },

  // 工具操作
  { id: 'options', keys: 'mod+,', description: '设置', category: 'tools' },
  { id: 'search', keys: 'mod+shift+f', description: '全局搜索', category: 'tools' },

  // 窗口操作
  { id: 'new-tab', keys: 'mod+t', description: '新建标签页', category: 'window' },
  { id: 'close-tab', keys: 'mod+w', description: '关闭标签页', category: 'window' },
  { id: 'next-tab', keys: 'mod+tab', description: '下一个标签页', category: 'window' },
  { id: 'prev-tab', keys: 'mod+shift+tab', description: '上一个标签页', category: 'window' },

  // 帮助操作
  { id: 'documentation', keys: 'f1', description: '帮助目录', category: 'help' },
  { id: 'check-update', keys: 'mod+shift+u', description: '检查更新', category: 'help' },
  { id: 'about', keys: 'mod+shift+a', description: '关于', category: 'help' },
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

/**
 * 获取生效的快捷键（优先用户自定义，其次 macOS 特定，最后默认）
 * @returns 快捷键字符串，空字符串表示已禁用
 */
export function getEffectiveShortcut(
  shortcutId: string,
  shortcuts: Record<string, string> = {},
  isMac: boolean = isMacOS()
): string {
  // 1. 优先使用用户自定义的快捷键
  if (shortcutId in shortcuts) {
    return shortcuts[shortcutId];
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

/**
 * 将快捷键格式化为 UI 显示文本
 * @example "mod+n" -> "⌘N" (macOS) / "Ctrl+N" (Win/Linux)
 */
export function formatShortcutForDisplay(keys: string, isMac: boolean = isMacOS()): string {
  if (!keys) return '';

  return keys
    .replace('mod+', isMac ? '⌘' : 'Ctrl+')
    .replace('shift+', '⇧')
    .replace('alt+', isMac ? '⌥' : 'Alt+')
    .replace('enter', '↵')
    .toUpperCase();
}

/**
 * 获取菜单项的快捷键显示标签（如 "(N)"）
 * @returns 格式化后的快捷键，空字符串表示已禁用
 */
export function getShortcutMenuLabel(
  shortcutId: string,
  shortcuts: Record<string, string> = {},
  isMac: boolean = isMacOS()
): string {
  const keys = getEffectiveShortcut(shortcutId, shortcuts, isMac);
  if (!keys) return '';

  const display = formatShortcutForDisplay(keys, isMac);
  return ` (${display})`;
}
