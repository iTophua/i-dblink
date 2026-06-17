# 主题重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除多余主题预设，只保留一个默认天蓝主题，亮色/暗色均强调质感

**Architecture:** 主题系统从 4 预设 × 3 模式 → 1 预设 × 3 模式。核心在 `theme.ts` 中删除 3 个预设的配色常量，修改 `ThemePreset` 类型为单值，然后串行更新所有引用方（store、组件、CSS）

**Tech Stack:** TypeScript, Zustand, Ant Design, Glide Data Grid, Monaco Editor

---

### Task 1: 重构 theme.ts — 核心色板和类型

**Files:**
- Modify: `frontend/src/styles/theme.ts`

- [ ] **Step 1: 修改 ThemePreset 类型为单值**

将第 8 行：
```ts
export type ThemePreset = 'neonCyber' | 'midnightDeep' | 'oceanBlue' | 'nordicFrost';
```
改为：
```ts
export type ThemePreset = 'default';
```

- [ ] **Step 2: 更新主色和语义色常量**

找到 `MIDNIGHT_DEEP_LIGHT` 定义（约第 800 行附近），改为：
```ts
const DEFAULT_LIGHT: ThemeColorScheme = {
  primary: '#3b82f6',
  primaryHover: '#60a5fa',
  primaryActive: '#2563eb',
  primaryGradient: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
  success: '#10b981',
  successHover: '#34d399',
  successActive: '#059669',
  successGradient: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
  warning: '#f59e0b',
  warningHover: '#fbbf24',
  warningActive: '#d97706',
  warningGradient: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
  error: '#ef4444',
  errorHover: '#f87171',
  errorActive: '#dc2626',
  errorGradient: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)',
  info: '#3b82f6',
  infoHover: '#60a5fa',
  infoActive: '#2563eb',
  infoGradient: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)',
};
```

找到 `MIDNIGHT_DEEP_DARK`，改为：
```ts
const DEFAULT_DARK: ThemeColorScheme = {
  primary: '#60a5fa',
  primaryHover: '#93c5fd',
  primaryActive: '#3b82f6',
  primaryGradient: 'linear-gradient(135deg, #60a5fa 0%, #93c5fd 100%)',
  success: '#34d399',
  successHover: '#6ee7b7',
  successActive: '#10b981',
  successGradient: 'linear-gradient(135deg, #34d399 0%, #6ee7b7 100%)',
  warning: '#fbbf24',
  warningHover: '#fde68a',
  warningActive: '#f59e0b',
  warningGradient: 'linear-gradient(135deg, #fbbf24 0%, #fde68a 100%)',
  error: '#f87171',
  errorHover: '#fca5a5',
  errorActive: '#ef4444',
  errorGradient: 'linear-gradient(135deg, #f87171 0%, #fca5a5 100%)',
  info: '#60a5fa',
  infoHover: '#93c5fd',
  infoActive: '#3b82f6',
  infoGradient: 'linear-gradient(135deg, #60a5fa 0%, #93c5fd 100%)',
};
```

- [ ] **Step 3: 更新亮色中性色常量**

将 `MIDNIGHT_DEEP_LIGHT_NEUTRAL` 改为：
```ts
const DEFAULT_LIGHT_NEUTRAL: NeutralColors = {
  textPrimary: '#0f172a',
  textSecondary: '#475569',
  textTertiary: '#94a3b8',
  textDisabled: '#cbd5e1',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  borderDark: '#cbd5e1',
  background: '#ffffff',
  backgroundCard: '#ffffff',
  backgroundToolbar: '#ffffff',
  backgroundHover: '#f8fafc',
  backgroundActive: '#eff6ff',
  mask: 'rgba(15,23,42,0.4)',
  windowBackground: '#ffffff',
  rowHoverBg: '#f8fafc',
  rowSelectedBg: '#eff6ff',
  rowStripeBg: 'transparent',
  headerBg: '#f8fafc',
  surfaceElevated: '#ffffff',
  scrollbarThumb: 'rgba(0,0,0,0.15)',
  scrollbarTrack: 'transparent',
  level1: '#f8fafc',
  level2: '#ffffff',
  level3: '#ffffff',
  level4: '#ffffff',
  borderSubtle: '#f1f5f9',
  borderEmphasis: '#cbd5e1',
  borderActive: '#3b82f6',
};
```

- [ ] **Step 4: 更新暗色中性色常量**

将 `MIDNIGHT_DEEP_DARK_NEUTRAL` 改为：
```ts
const DEFAULT_DARK_NEUTRAL: NeutralColors = {
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textTertiary: 'rgba(148,163,184,0.5)',
  textDisabled: 'rgba(148,163,184,0.25)',
  border: '#1e3a5f',
  borderLight: 'rgba(30,58,95,0.3)',
  borderDark: '#2a4a75',
  background: '#0c1929',
  backgroundCard: '#0f1f33',
  backgroundToolbar: '#0d1e30',
  backgroundHover: 'rgba(96,165,250,0.06)',
  backgroundActive: 'rgba(96,165,250,0.10)',
  mask: 'rgba(0,0,0,0.6)',
  windowBackground: '#0c1929',
  rowHoverBg: '#112840',
  rowSelectedBg: '#1a3a5c',
  rowStripeBg: 'transparent',
  headerBg: '#0d1e30',
  surfaceElevated: '#0f1f33',
  scrollbarThumb: 'rgba(148,163,184,0.2)',
  scrollbarTrack: 'transparent',
  level1: '#0a1628',
  level2: '#0f1f33',
  level3: '#122840',
  level4: '#1a3050',
  borderSubtle: 'rgba(30,58,95,0.2)',
  borderEmphasis: '#2a4a75',
  borderActive: '#60a5fa',
};
```

- [ ] **Step 5: 更新 DB_TYPE_COLORS**

找到 `DB_TYPE_COLORS` 定义，改为：
```ts
export const DB_TYPE_COLORS = {
  mysql: '#1890ff',
  postgresql: '#336791',
  sqlite: '#003b57',
  sqlserver: '#cc2927',
  oracle: '#f80000',
  mariadb: '#c0765a',
  dameng: '#b30000',
  kingbase: '#0066cc',
  highgo: '#1e90ff',
  vastbase: '#008000',
  default: '#1890ff',
};
```

- [ ] **Step 6: 更新 FOCUS_STYLES**

找到 `FOCUS_STYLES`，改为：
```ts
export const FOCUS_STYLES = {
  light: {
    focusRingColor: 'rgba(59, 130, 246, 0.5)',
    focusRingWidth: 2,
    focusRingOffset: 2,
    focusRingShadow: '0 0 0 2px rgba(59, 130, 246, 0.15)',
  },
  dark: {
    focusRingColor: 'rgba(96, 165, 250, 0.6)',
    focusRingWidth: 2,
    focusRingOffset: 2,
    focusRingShadow: '0 0 0 2px rgba(96, 165, 250, 0.2)',
  },
};
```

- [ ] **Step 7: 简化 THEMES 记录**

找到 `THEMES` 定义（约第 1030 行），删除 neonCyber、oceanBlue、nordicFrost 三个入口，只保留 default：
```ts
export const THEMES = {
  default: {
    light: createThemeConfig('Default', '默认主题', 'light', DEFAULT_LIGHT, DEFAULT_LIGHT_NEUTRAL),
    dark: createThemeConfig('Default', '默认主题', 'dark', DEFAULT_DARK, DEFAULT_DARK_NEUTRAL),
  },
} as const;
```

- [ ] **Step 8: 删除多余的颜色常量定义**

删除文件中以下整段常量定义：
- `NEON_CYBER_LIGHT` / `NEON_CYBER_DARK`
- `NEON_CYBER_LIGHT_NEUTRAL` / `NEON_CYBER_DARK_NEUTRAL`
- `OCEAN_BLUE_LIGHT` / `OCEAN_BLUE_DARK`
- `OCEAN_BLUE_LIGHT_NEUTRAL` / `OCEAN_BLUE_DARK_NEUTRAL`
- `NORDIC_FROST_LIGHT` / `NORDIC_FROST_DARK`
- `NORDIC_FROST_LIGHT_NEUTRAL` / `NORDIC_FROST_DARK_NEUTRAL`

保留 `MIDNIGHT_DEEP_*` 相关常量并重命名为 `DEFAULT_*`（以上步骤中已覆盖）。

- [ ] **Step 9: 简化 getThemeConfig**

```ts
export function getThemeConfig(mode: ThemeMode): ThemeConfig {
  const effectiveMode = mode === 'system' ? getSystemMode() : mode;
  return THEMES.default[effectiveMode];
}
```

- [ ] **Step 10: 更新导出列表**

将 `THEME_PRESETS_LIST` 简化为单条：
```ts
export const THEME_PRESETS_LIST = [
  { value: 'default' as ThemePreset, label: '默认主题', description: '天蓝清新风格' },
];
```

也可以直接删除 `THEME_PRESETS_LIST`（因为 SettingsDialog 将不再使用它）。检查 `SettingsDialog.tsx` 中是否有其他引用。如果决定保留，确保 SettingsDialog 中不再迭代它。

- [ ] **Step 11: 运行 lint 和 typecheck 验证**

```bash
cd frontend && pnpm exec -- tsc --noEmit
```
预期：仅 theme.ts 内部无错误，所有外部引用会报错（将在后续任务修复）


### Task 2: 更新 settingsStore.ts

**Files:**
- Modify: `frontend/src/stores/settingsStore.ts`

- [ ] **Step 1: 移除 themePreset 字段**

```ts
// 删除第 3 行 import
// import { ThemePreset } from '../styles/theme';

export interface AppSettings {
  pageSize: number;
  maxResultRows: number;
  // 删除: themePreset: ThemePreset;
  themeMode: ThemeMode;
  language: 'zh-CN' | 'en-US';
  settingsActiveTab?: 'general' | 'appearance' | 'language' | 'shortcuts';
  shortcuts: Record<string, string>;
}

const defaultSettings: AppSettings = {
  pageSize: 1000,
  maxResultRows: 10000,
  // 删除: themePreset: 'midnightDeep',
  themeMode: 'system',
  language: 'zh-CN',
  shortcuts: {},
};
```

- [ ] **Step 2: 简化 migrate 函数**

删除 migrate 函数中与 `themePreset` 相关的旧迁移逻辑（第 50-68 行整段），只保留 `themeSyncSystem` 迁移：
```ts
function migrate(state: unknown, version: number | undefined): Partial<SettingsState> {
  if (version === undefined) {
    return { settings: defaultSettings };
  }

  const s = state as Record<string, unknown>;
  const stateSettings = s.settings as Record<string, unknown> | undefined;

  // 迁移：从 themeSyncSystem 字段迁移到 themeMode: 'system'
  if (stateSettings && 'themeSyncSystem' in stateSettings) {
    const syncSystem = stateSettings.themeSyncSystem as boolean;
    const currentMode = (stateSettings.themeMode as ThemeMode) || 'dark';
    const newMode: ThemeMode = syncSystem ? 'system' : currentMode;
    const { themeSyncSystem, ...restSettings } = stateSettings as Record<string, unknown>;
    return {
      settings: {
        ...defaultSettings,
        ...(restSettings as unknown as Partial<AppSettings>),
        themeMode: newMode,
      },
    };
  }

  return {
    settings: { ...defaultSettings, ...stateSettings },
  };
}
```

- [ ] **Step 3: 运行 typecheck**

```bash
cd frontend && pnpm exec -- tsc --noEmit
```


### Task 3: 更新 mock settingsStore.ts

**Files:**
- Modify: `frontend/src/__tests__/mocks/settingsStore.ts`

- [ ] **Step 1: 移除 themePreset**

与 Task 2 同样操作：
- 删除 `import { ThemePreset } from '../../styles/theme'`
- 从 `AppSettings` 接口中删除 `themePreset`
- 从 `defaultSettings` 中删除 `themePreset: 'midnightDeep'`
- 简化 `migrate` 函数（删除 theme 到 themePreset 的旧迁移）

- [ ] **Step 2: 运行 typecheck**

```bash
cd frontend && pnpm exec -- tsc --noEmit
```


### Task 4: 更新 useThemeColors.ts

**Files:**
- Modify: `frontend/src/hooks/useThemeColors.ts`

- [ ] **Step 1: 移除 themePreset 引用**

```ts
export function useThemeColors(): ThemeColors {
  const { settings } = useSettingsStore();
  const { themeMode } = settings;  // 删除 themePreset

  const effectiveMode: ThemeMode = themeMode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : themeMode;

  const config = getThemeConfig(effectiveMode);  // 不再传 preset
  // ... rest unchanged
}
```

- [ ] **Step 2: 运行 typecheck**


### Task 5: 更新 App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: 移除 themePreset 相关逻辑**

```tsx
// 第 42 行：删除
// const themePreset = settings.themePreset;
const themeMode = settings.themeMode;

// 第 51 行：getThemeConfig 不再传 preset
const themeConfig = useMemo(
  () => getThemeConfig(effectiveMode),
  [effectiveMode]  // 移除 themePreset
);

// 第 142-143 行：删除 data-theme-preset
root.setAttribute('data-theme', effectiveMode);
// 删除: root.setAttribute('data-theme-preset', themePreset);

// 第 149 行：更新依赖数组
}, [effectiveMode, isHydrated]);  // 移除 themePreset
```

- [ ] **Step 2: 运行 typecheck**


### Task 6: 更新 SettingsDialog.tsx

**Files:**
- Modify: `frontend/src/components/SettingsDialog.tsx`

- [ ] **Step 1: 删除主题预设选择器 UI**

删除以下内容：
```tsx
// 删除第 18 行 import 中的 THEME_PRESETS_LIST
import { ThemePreset, THEME_PRESETS_LIST } from '../styles/theme';
// 改为:
import { ThemePreset } from '../styles/theme';

// 删除第 34-39 行 THEME_PREVIEW_COLORS 常量
// const THEME_PREVIEW_COLORS: Record<ThemePreset, ...> = { ... };

// 删除第 83 行 form 重置中的 themePreset: 'midnightDeep'
// 改为:
form.setFieldsValue({
  pageSize: 1000,
  maxResultRows: 10000,
  themeMode: 'system',
  language: 'zh-CN',
});

// 删除第 89-91 行 handlePresetChange 函数
// 删除第 97 行 themePreset 的 Form.useWatch

// 删除第 209-259 行 整个 theme preset 选择区域（从 <Form.Item label={t('common.theme')}> 到 </Form.Item> 的 Select）
// 只保留第 261-267 行的 themeMode 选择
```

保留后的 appearance 区域应该只有：
```tsx
{activeTab === 'appearance' && (
  <div>
    <Form.Item label={t('common.themeMode')} name="themeMode">
      <Select onChange={handleModeChange}>
        <Select.Option value="light">{t('common.light')}</Select.Option>
        <Select.Option value="dark">{t('common.dark')}</Select.Option>
        <Select.Option value="system">{t('common.followSystem')}</Select.Option>
      </Select>
    </Form.Item>
  </div>
)}
```

- [ ] **Step 2: 清理未使用的 imports**

检查 `SettingsDialog.tsx` 顶部 imports，删除不再使用的 `ThemePreset`、`THEME_PRESETS_LIST`、`Tooltip`、`Tag`、`Space` 等。

- [ ] **Step 3: 运行 typecheck**


### Task 7: 清理 style.css

**Files:**
- Modify: `frontend/src/style.css`

- [ ] **Step 1: 删除 neonCyber glow 样式**

删除第 779-802 行 `[data-theme-preset='neonCyber']` 所有相关块（包括 glow CSS 变量和按钮/标签页/树的辉光效果）。

- [ ] **Step 2: 更新主题过渡选择器**

将第 829-835 行：
```css
[data-theme],
[data-theme-preset] {
  transition:
    background-color 0.3s ease,
    color 0.3s ease,
    border-color 0.3s ease;
}
```
改为：
```css
[data-theme] {
  transition:
    background-color 0.3s ease,
    color 0.3s ease,
    border-color 0.3s ease;
}
```


### Task 8: 清理 theme-enhancements.css

**Files:**
- Modify: `frontend/src/styles/theme-enhancements.css`

- [ ] **Step 1: 删除其他预设的专属样式**

删除以下所有块：
- `[data-theme-preset='neonCyber']`（第 976-1037 行）
- `[data-theme-preset='oceanBlue']`（第 1043-1084 行）
- `[data-theme-preset='nordicFrost']`（第 1090-1124 行）

- [ ] **Step 2: 转换 midnightDeep 样式为无 preset 版本**

找到 `[data-theme-preset='midnightDeep']`（第 1132-1162 行）：
```css
/* 改为无 data-theme-preset 限制 */
[data-theme='dark'] .sidebar-enhanced {
  background: rgba(12, 25, 41, 0.85);
  backdrop-filter: blur(16px);
  border-right: 1px solid rgba(30, 58, 95, 0.3);
}

[data-theme='dark'] .ant-tabs-tab-active::after {
  background: #60a5fa;
  box-shadow: 0 0 8px rgba(96, 165, 250, 0.15);
}

[data-theme='dark'] .ant-btn-primary {
  box-shadow: 0 2px 8px rgba(96, 165, 250, 0.2);
}
```

同时将 midnightDeep 专用的 `.ant-modal-mask` 和 `.ant-modal-content` 样式改为全局（去掉 `[data-theme-preset='midnightDeep']` 限制），保留原有的暗色遮罩和弹窗样式。

- [ ] **Step 3: 检查 `[data-theme]` 和 `[data-theme-preset]` 相关过渡**

确保文件头部的 `[data-theme]` 和 `[data-theme-preset]` 过渡只保留 `[data-theme]`。


### Task 9: 更新 glide-theme.ts

**Files:**
- Modify: `frontend/src/components/DataTable/glide-theme.ts`

- [ ] **Step 1: 更新 lightGlideTheme**

```ts
export const lightGlideTheme: Partial<Theme> = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  baseFontStyle: '12px',
  headerFontStyle: '600 12px',
  editorFontSize: '12px',
  cellHorizontalPadding: 8,
  cellVerticalPadding: 2,
  borderColor: '#e2e8f0',
  drilldownBorder: '#e2e8f0',
  accentColor: '#3b82f6',
  accentLight: 'rgba(59, 130, 246, 0.08)',
  accentFg: '#ffffff',
  textDark: '#0f172a',
  textMedium: '#475569',
  textLight: '#94a3b8',
  textBubble: '#ffffff',
  textHeader: '#0f172a',
  textHeaderSelected: '#3b82f6',
  bgIconHeader: '#f8fafc',
  fgIconHeader: '#475569',
  bgHeader: '#f8fafc',
  bgHeaderHasFocus: '#eff6ff',
  bgHeaderHovered: '#f1f5f9',
  bgBubble: '#f1f5f9',
  bgBubbleSelected: '#eff6ff',
  bgSearchResult: '#fef3c7',
  bgCell: '#ffffff',
  bgCellMedium: '#f8fafc',
  linkColor: '#3b82f6',
  headerIconSize: 16,
  markerFontStyle: '11px',
  lineHeight: 20,
};
```

- [ ] **Step 2: 更新 darkGlideTheme**

```ts
export const darkGlideTheme: Partial<Theme> = {
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  baseFontStyle: '12px',
  headerFontStyle: '600 12px',
  editorFontSize: '12px',
  cellHorizontalPadding: 8,
  cellVerticalPadding: 2,
  borderColor: '#1e3a5f',
  drilldownBorder: '#1e3a5f',
  accentColor: '#60a5fa',
  accentLight: 'rgba(96, 165, 250, 0.15)',
  accentFg: '#ffffff',
  textDark: '#f1f5f9',
  textMedium: '#94a3b8',
  textLight: 'rgba(148,163,184,0.5)',
  textBubble: '#0c1929',
  textHeader: '#f1f5f9',
  textHeaderSelected: '#60a5fa',
  bgIconHeader: '#0d1e30',
  fgIconHeader: '#94a3b8',
  bgHeader: '#0d1e30',
  bgHeaderHasFocus: '#112840',
  bgHeaderHovered: '#0f1f33',
  bgBubble: '#1e3a5f',
  bgBubbleSelected: '#112840',
  bgSearchResult: '#2a2510',
  bgCell: '#0c1929',
  bgCellMedium: '#0f1f33',
  borderColor: '#1e3a5f',
  drilldownBorder: '#1e3a5f',
  linkColor: '#60a5fa',
  headerIconSize: 16,
  markerFontStyle: '11px',
  lineHeight: 20,
};
```


### Task 10: 更新 SQLEditor.tsx — Monaco 主题

**Files:**
- Modify: `frontend/src/components/SQLEditor.tsx`

- [ ] **Step 1: 更新 custom-light 主题色**

在 `defineTheme('custom-light', ...)` 中将 `editor.background` 改为 `'#FFFFFF'`。
可选调整（适配新风格）：
- `editor.lineHighlightBackground`: `'#F8FAFC'`
- `editor.selectionBackground`: `'#DBEAFE'`
- `editorLineNumber.foreground`: `'#94A3B8'`
- `editorLineNumber.activeForeground`: `'#3B82F6'`

- [ ] **Step 2: 更新 custom-dark 主题色**

在 `defineTheme('custom-dark', ...)` 中将：
- `editor.background`: `'#0C1929'`
- `editor.lineHighlightBackground`: `'#112840'`
- `editor.selectionBackground`: `'#1A3A5C'`
- `editorLineNumber.foreground`: `'#4A6A8A'`
- `editorLineNumber.activeForeground`: `'#60A5FA'`
- `editorHoverWidget.background`: `'#122840'`
- `editorSuggestWidget.background`: `'#122840'`
- `editorWidget.background`: `'#122840'`
- `editorGroupHeader.tabsBackground`: `'#0F1F33'`


### Task 11: 运行测试确认

**Files:**
- Verify: 所有修改的文件

- [ ] **Step 1: 运行 lint**

```bash
cd frontend && pnpm lint
```
修复任何 lint 错误。

- [ ] **Step 2: 运行 typecheck**

```bash
cd frontend && pnpm exec -- tsc --noEmit
```
修复任何类型错误。

- [ ] **Step 3: 运行测试**

```bash
cd frontend && pnpm test
```
确认所有测试通过。如果 `useThemeColors.test.ts` 中的 mock 值与新色板不匹配，更新 mock 值以匹配新色板。

- [ ] **Step 4: 运行 Go 测试**

```bash
go test ./...
```
确认后端测试不受影响（预期不变）。
