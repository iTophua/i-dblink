# 主题重构设计方案

## 概述

删除多余主题预设（neonCyber、oceanBlue、nordicFrost），只保留一个默认主题，以天蓝为主色调，强调质感、高级感和细腻感。

## 当前状态

- 4 个主题预设 × 3 种模式（亮/暗/跟随系统）= 12 种组合
- 默认预设为 `midnightDeep`（深夜深蓝）
- 主题系统位于 `frontend/src/styles/theme.ts`（~1120行）

## 目标状态

- 1 个默认主题 × 3 种模式（亮/暗/跟随系统）= 3 种组合
- 天蓝主色调，现代清新风格
- 亮色/暗色均强调精致质感和高级感
- 删除 `data-theme-preset` 属性，只保留 `data-theme`（light / dark）

## 参照艺术家（Reference）

整体气质参照以下三维坐标系的交汇点：

| 参照对象 | 取法 | 不取 |
|---------|------|------|
| **Linear** | 极简层级、0.5px 描边区分、留白呼吸感 | 不取暖色系和紫调 |
| **Supabase** | 天蓝主色 + 中性灰辅助，清爽专业 | 不取深色模式纯黑底（改深蓝底） |
| **Apple HIG** | 毛玻璃材质规范、阴影克制、字体细润 | 不取全圆角和大标题 |

**核心原则：** 克制即高级。少用色、少用阴影、少用动画，每个效果都要有明确的功能目的。

---

## 核心色板

### 主色（天蓝）

| 状态 | 亮色 | 暗色 |
|------|------|------|
| 默认 | `#3b82f6` | `#60a5fa` |
| Hover | `#60a5fa` | `#93c5fd` |
| Active | `#2563eb` | `#3b82f6` |

### 语义色

| 角色 | 亮色 | 暗色 |
|------|------|------|
| 成功 | `#10b981` | `#34d399` |
| 警告 | `#f59e0b` | `#fbbf24` |
| 错误 | `#ef4444` | `#f87171` |
| 信息 | `#3b82f6` | `#60a5fa` |

### 数据库类型颜色

| 数据库 | 色值 |
|--------|------|
| MySQL | `#1890ff` |
| PostgreSQL | `#336791` |
| SQLite | `#003b57` |
| SQL Server | `#cc2927` |
| Oracle | `#f80000` |
| MariaDB | `#c0765a` |
| 达梦 | `#b30000` |
| 人大金仓 | `#0066cc` |
| 高斯 | `#1e90ff` |
| Vastbase | `#008000` |
| 默认 | `#1890ff` |

仅在数据库树节点图标和连接状态中使用，不允许作为 UI 装饰色。

### 中性色 — 亮色模式

| Token | 色值 | 用途 |
|-------|------|------|
| background | `#ffffff` | 纯白 |
| background-card | `#ffffff` | 卡片 |
| background-toolbar | `#ffffff` | 工具栏（纯白不透明，保证可读性） |
| background-hover | `#f8fafc` | 悬停背景 |
| background-active | `#eff6ff` | 激活/选中背景 |
| window-background | `#ffffff` | 窗口背景 |
| surface-elevated | `#ffffff` | 浮层面板 |
| header-bg | `#f8fafc` | 表头/分割条 |
| row-hover-bg | `#f8fafc` | 行悬停（数据表格） |
| row-selected-bg | `#eff6ff` | 行选中（数据表格） |
| row-stripe-bg | 无 | 无斑马纹 |
| text-primary | `#0f172a` | 主文本 |
| text-secondary | `#475569` | 次文本 |
| text-tertiary | `#94a3b8` | 三级文本 |
| text-disabled | `#cbd5e1` | 禁用文本 |
| border-default | `#e2e8f0` | 默认边框 |
| border-light | `#f1f5f9` | 浅边框（表格内分割线） |
| border-dark | `#cbd5e1` | 深边框（强调分割） |
| border-subtle | `#f1f5f9` | 极淡边框（容器外层） |
| border-emphasis | `#cbd5e1` | 强调边框（输入框等） |
| border-active | `#3b82f6` | 激活边框 |
| level1 | `#f8fafc` | 底层背景（最底层） |
| level2 | `#ffffff` | 卡片层 |
| level3 | `#ffffff` | 浮层（下拉、弹出） |
| level4 | `#ffffff` | 顶层（模态框） |
| mask | `rgba(15,23,42,0.4)` | 遮罩层 |
| scrollbar-thumb | `rgba(0,0,0,0.15)` | 滚动条滑块 |
| scrollbar-track | `transparent` | 滚动条轨道 |

### 中性色 — 暗色模式

| Token | 色值 | 用途 |
|-------|------|------|
| background | `#0c1929` | 深海军蓝 |
| background-card | `#0f1f33` | 卡片 |
| background-toolbar | `rgba(12,25,41,0.85)` | 工具栏半透明毛玻璃 |
| background-hover | `rgba(96,165,250,0.06)` | 悬停背景 |
| background-active | `rgba(96,165,250,0.10)` | 激活/选中背景 |
| window-background | `#0c1929` | 窗口背景 |
| surface-elevated | `#0f1f33` | 浮层面板 |
| header-bg | `#0d1e30` | 表头 |
| row-hover-bg | `#112840` | 行悬停 |
| row-selected-bg | `#1a3a5c` | 行选中 |
| row-stripe-bg | 无 | 无斑马纹 |
| text-primary | `#f1f5f9` | 主文本 |
| text-secondary | `#94a3b8` | 次文本 |
| text-tertiary | `rgba(148,163,184,0.5)` | 三级文本 |
| text-disabled | `rgba(148,163,184,0.25)` | 禁用文本 |
| border-default | `#1e3a5f` | 默认边框 |
| border-light | `rgba(30,58,95,0.3)` | 浅边框 |
| border-dark | `#2a4a75` | 深边框 |
| border-subtle | `rgba(30,58,95,0.2)` | 极淡边框 |
| border-emphasis | `#2a4a75` | 强调边框 |
| border-active | `#60a5fa` | 激活边框 |
| level1 | `#0a1628` | 底层背景 |
| level2 | `#0f1f33` | 卡片层 |
| level3 | `#122840` | 浮层 |
| level4 | `#1a3050` | 顶层 |
| mask | `rgba(0,0,0,0.6)` | 遮罩层 |
| scrollbar-thumb | `rgba(148,163,184,0.2)` | 滚动条滑块 |
| scrollbar-track | `transparent` | 滚动条轨道 |

### 玻璃效果

| 属性 | 亮色 | 暗色 |
|------|------|------|
| 玻璃背景 | `rgba(255,255,255,0.6)` | `rgba(15,31,51,0.5)` |
| 玻璃边框 | `rgba(226,232,240,0.5)` | `rgba(30,58,95,0.3)` |
| 模糊度 | `12px` | `16px` |

**使用范围：** 玻璃效果仅用于工具栏和侧栏。卡片、表格、弹窗等不透明度区域不使用玻璃效果。

### 焦点状态（Focus Ring）

| 属性 | 亮色 | 暗色 |
|------|------|------|
| 环色 | `rgba(59,130,246,0.5)` | `rgba(96,165,250,0.6)` |
| 环宽 | `2px` | `2px` |
| 偏移 | `2px` | `2px` |
| 阴影 | `0 0 0 2px rgba(59,130,246,0.15)` | `0 0 0 2px rgba(96,165,250,0.2)` |

**规则：** Focus ring 仅通过键盘 Tab 导航时显示，鼠标点击时不应出现蓝色环。通过 `:focus-visible` 实现。

---

## 限定材质（Material System）

定义四种材质类型，每种有严格的使用边界：

### M1: 不透明 Solid
- **组件：** 卡片、侧栏背景、对话框、表格行、按钮
- **亮色：** `background-card` / `background`
- **暗色：** `background-card` / `background`
- **规则：** 层级间通过 level 色值递进区分（level1→level2→level3→level4），不依赖透明度

### M2: 半透明 Translucent
- **组件：** Activity bar、状态栏
- **亮色：** `rgba(255,255,255,0.85)`
- **暗色：** `rgba(12,25,41,0.85)`
- **规则：** 仅用于非交互装饰区域，下方内容可见但不干扰阅读

### M3: 毛玻璃 Glass
- **组件：** 工具栏、侧栏顶部
- **亮色：** `rgba(255,255,255,0.6) + backdrop-filter: blur(12px)`
- **暗色：** `rgba(15,31,51,0.5) + backdrop-filter: blur(16px)`
- **规则：** 配合底部 0.5px 边框定义边界。内容滚动时玻璃背景保持模糊，下方内容允许透过

### M4: 发光 Glow
- **组件：** 暗色模式下选中边框、激活指示器
- **亮色：** 不使用发光
- **暗色：** `box-shadow: 0 0 8px rgba(96,165,250,0.15)`
- **规则：** 仅用于激活指示器（如左侧导航选中边框），不用于大面积背景

---

## 指定光源（Light Source）

### 光源方向
- **默认：** 正上方偏前（`0deg`），即阴影投射方向为 Y 轴正向
- **亮色：** 顶部受光面不做高光边，底部投射阴影
- **暗色：** 顶部用 1px 高光边 `rgba(255,255,255,0.03)` 模拟环境顶光

### 阴影规则
- 所有阴影使用 `Y-offset ≥ X-offset`，保持光源一致性
- 内阴影仅用于输入框的 `inset` 效果，表示凹陷感
- 暗色模式不依赖投影区分层级，改用 `border` + `level` 层次色

---

## 叠加风格（Overlay / Blend）

### 模态遮罩
| 模式 | 色值 |
|------|------|
| 亮色 | `rgba(15,23,42,0.4)` |
| 暗色 | `rgba(0,0,0,0.6)` |

遮罩层不使用 blur，仅色块覆盖。

### 下拉 / 弹窗
- **背景：** 使用 level3/level4 纯色（亮色白/暗色蓝），不透明
- **边框：** 0.5px 描边（亮色 `#e2e8f0` / 暗色 `#1e3a5f`）
- **投影：** 亮色使用 shadow-level2/3，暗色使用 shadow-level2/3

### Tooltip
- **背景：** 亮色 `#1e293b` / 暗色 `#e2e8f0`
- **文本：** 亮色 `#ffffff` / 暗色 `#0f172a`
- **投影：** 亮色 `0 2px 8px rgba(0,0,0,0.15)` / 暗色 `0 2px 8px rgba(0,0,0,0.4)`

Tooltip 始终与主界面色相反转，保证高对比度。

---

## 排版与间距

### 字体

- 主字体：Inter / -apple-system（无衬线）
- 等宽字体：JetBrains Mono / Fira Code

### 字号

| Token | 字号 | 用途 |
|-------|------|------|
| xs | 11px | 辅助标签 |
| sm | 12px | 表格单元格、说明 |
| base | 13px | 正文 |
| lg | 14px | 按钮、输入框 |
| xl | 16px | 标题 |
| 2xl | 20px | 一级标题 |

### 间距系统：4px 基数

| Token | 值 |
|-------|----|
| xs | 4px |
| sm | 8px |
| md | 12px |
| lg | 16px |
| xl | 20px |
| xxl | 24px |

### 圆角

| Token | 值 | 用途 |
|-------|----|------|
| sm | 4px | 标签、徽标 |
| md | 6px | 按钮、输入框 |
| lg | 8px | 卡片、对话框 |
| xl | 12px | 大容器 |

---

## 阴影与层级

### 亮色模式

| 层级 | 阴影 |
|------|------|
| 0（默认） | 极淡 0.5px 描边 + 极浅投影 |
| 1（悬浮） | `0 2px 8px rgba(15,23,42,0.06)` |
| 2（下拉） | `0 4px 16px rgba(15,23,42,0.08)` |
| 3（模态框） | `0 8px 32px rgba(15,23,42,0.12)` |

### 暗色模式

| 层级 | 阴影 |
|------|------|
| 0（默认） | 暗蓝 1px 边框，无阴影 |
| 1（悬浮） | `0 2px 8px rgba(0,0,0,0.3)` |
| 2（下拉） | `0 4px 16px rgba(0,0,0,0.4)` |
| 3（模态框） | `0 8px 32px rgba(0,0,0,0.5)` |

**约束：** 层级只能按需递增使用，不允许跳级（如默认卡片直接使用 level3 阴影）。

---

## 组件级设计

### 工具栏

- 亮色：白底（M1）+ 底部 0.5px 边框
- 暗色：深蓝毛玻璃（M3）+ 底部发光边框
- 图标色中性灰，hover 变主色

### 左侧导航（连接树）

- 选中态用左侧 2px 彩色边框替代整块高亮
- 缩进线极淡 1px
- 行悬停极淡底色

### 数据表格

- 无斑马纹
- 0.5px 极细水平分割线（border-light）
- 选中行淡蓝底色（row-selected-bg）
- 表头灰底（header-bg）+ 底部边框

### 输入框

- 圆角 6px
- Focus 态:focus-visible 蓝色焦点环 + 极淡阴影环

### 滚动条

- 透明 track，细 6px
- Hover 时 thumb 加深

---

## 过渡动画

- 主题切换：0.3s ease（所有颜色属性）
- Button hover：0.15s ease
- 下拉展开：0.2s ease-out
- 弹窗：缩放 0.95→1 + 淡入，0.2s ease-out
- 所有动画 ≤ 200ms（主题切换除外）
- Tooltip：0.15s delay 后出现，0.1s fade

---

## 设计约束（Design Constraints）

1. **主色使用面积 ≤ 10%** 可视区域。主色用于按钮、链接、选中指示器，不用于大块背景
2. **语义色仅用于对应含义。** 成功绿不用于 UI 装饰，错误红不用于品牌色
3. **数据库颜色仅用于树节点图标。** 不延伸为 UI 色
4. **阴影层级禁止跳级。** 卡片不能使用 level3 以上的阴影，浮层不能低于 level2
5. **动画时长 ≤ 200ms**（主题切换除外）。所有动画使用 `ease` 或 `ease-out`，不使用 `linear` 或 `bounce`
6. **毛玻璃仅限工具栏和侧栏。** 模态框、下拉、提示框不使用毛玻璃
7. **亮色模式不使用发光效果（glow）。** 发光仅用于暗色模式的选中指示器
8. **深色模式下 level 色值逐层递进。** level1 到 level4 必须依次变亮（或饱和度递增），不允许平级或逆转

---

## 需要修改的文件

### 删除的内容

1. **`frontend/src/styles/theme.ts`** — 删除 neonCyber、oceanBlue、nordicFrost 三个预设，只保留新默认预设
2. **`frontend/src/style.css`** — 删除 `[data-theme-preset='neonCyber']` 相关辉光样式
3. **`frontend/src/components/SettingsDialog.tsx`** — 删除主题预设选择器 UI，只保留亮/暗/跟随系统模式切换
4. **`frontend/src/stores/settingsStore.ts`** — 移除 `themePreset` 选择逻辑，固定为单一预设

### 修改的内容

5. **`frontend/src/App.tsx`** — 删除 `data-theme-preset` 属性设置和对应的 CSS 变量注入，只保留 `data-theme`
6. **`frontend/src/components/DataTable/glide-theme.ts`** — 将 lightGlideTheme 和 darkGlideTheme 的颜色调整为与新色板匹配（accentColor 改为天蓝，背景/边框色对应调整）
7. **`frontend/src/components/SQLEditor.tsx`** — 将 custom-light / custom-dark 的 `editor.background`、`editorLineNumber.foreground` 等颜色调整为与新色板协调

### 无需修改的内容

- `frontend/src/styles/theme-enhancements.css` — 玻璃效果保留，仅调整色值
- `frontend/src/components/Toolbar/index.tsx` — 切换按钮逻辑不变
- `frontend/src/components/MainLayout.tsx` — 事件路由不变
