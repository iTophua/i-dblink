# 主题打磨：CSS 整合与系统性精修

## 背景

继主题重构（统一深蓝风格、删除多余预设）之后，当前 CSS 存在三个文件
`style.css` / `App.css` / `theme-enhancements.css` 之间大量重复定义、
颜色引用不一致、间距/透明度/动画参数不统一的问题。

## 目标

1. 消除三文件之间的重复规则，每类样式只有一个权威来源
2. 修复所有残留的旧色值（`#1890ff` 等）以 CSS 变量引用替代
3. 统一间距为 8px 网格、颜色透明度为规范 scale、transition 参数一致
4. 补全暗色模式缺失的场景（empty、disabled、divider 等）

---

## Phase 1：CSS 整合策略

### 最终文件职责

| 文件 | 职责 | 保留内容 | 移除内容 |
|------|------|----------|----------|
| `style.css` | 基础设施 | CSS 变量、reset、排版、Wails 拖拽、主题过渡 | 重复的滚动条、焦点、selection、AG Grid 紧凑模式、Tab 布局（与 theme-enhancements 冲突） |
| `App.css` | 全局动画 + 特殊组件 | 所有 `@keyframes`、连接状态指示器、`.sql-ctx-menu`、`.shimmer`、`.hover-scale` | 所有 Ant Design 组件覆盖（card/btn/tabs/dropdown/tooltip/tag/badge），重复的 reduced-motion |
| `theme-enhancements.css` | Ant Design 组件覆盖 | 全部保留，删除末尾重复块 | `ant-btn-primary` 重复定义、`sidebar-enhanced` 重复、`.ant-tabs-tab-active::after` 重复 |

### 颜色修复清单（App.css）

- `:focus-visible` outline: `#1890ff` → `var(--color-primary)`
- `::selection` background: `rgba(24, 144, 255, 0.3)` → `var(--color-primary)`
- `.ant-btn-primary:hover` shadow: `rgba(24, 144, 255, 0.4)` → `rgba(var(--color-primary), 0.4)`
- AG Grid row hover: `rgba(24, 144, 255, 0.05)` → `var(--row-hover-bg)`

---

## Phase 2：系统性精修

### 2.1 间距标准化（8px 网格）

| 场景 | 当前（可能偏离） | 统一值 |
|------|-----------------|--------|
| 卡片 padding | 16px | 16px |
| 按钮内间距 | sm/md/lg | 8/12/16px |
| 表单项间距 | 8px | 8px |
| 列表项 padding | 8px 12px | 8px 12px |
| 工具栏 gap | 8px | 8px |
| 模态框 padding | 24px | 24px |
| 分组间距 | 24px | 24px |

### 2.2 颜色透明度 scale

| 层级 | 透明度 | 用途 |
|------|--------|------|
| hover | 0.06 | 悬浮反馈 |
| selected | 0.10 | 选中态 |
| active | 0.15 | 激活态 |
| emphasis | 0.20 | 强调背景 |
| disabled | 0.25–0.30 | 禁用态文本/背景 |

所有 `rgba(37, 99, 235, 0.08)` 类写法统一对齐。

### 2.3 过渡与动效一致

- 微交互（hover/active）：`0.15s cubic-bezier(0.4, 0, 0.2, 1)`
- 标准过渡（展开/收起）：`0.2s cubic-bezier(0.4, 0, 0.2, 1)`
- 慢速过渡（弹窗/抽屉）：`0.3s cubic-bezier(0.4, 0, 0.2, 1)`
- 弹性强调：`0.4s cubic-bezier(0.34, 1.56, 0.64, 1)`
- 暗色模式下悬浮位移统一为 `translateY(-1px)`，按下 `translateY(0) scale(0.98)`

### 2.4 !important 规范

保留 `!important` 的场景：
- Ant Design 组件的内联样式覆盖（背景色、边框色）
- 状态冲突（`:hover` vs 默认等）
- 关键布局属性（height: 100% 等）

移除不必要的 `!important`：
- `.ant-card` 常规 border/shadow（用优先级选择器替代）
- `.ant-tabs-tab` 的 color（用优先级选择器替代）

### 2.5 暗色模式补全

- Empty 状态描述文本：`#4A5C78`（已有）— 检查是否遗漏
- 禁用输入框背景：`rgba(255,255,255,0.02)` + 边框淡化
- Divider 分割线：`rgba(255,255,255,0.06)`
- 滚动条轨道：`transparent`
- `::selection` 暗色适配：`rgba(37,99,235,0.4)`

---

## 文件清单

1. `frontend/src/style.css` — 精简至 ~550 行
2. `frontend/src/App.css` — 精简至 ~250 行，移除 Antd 组件覆盖
3. `frontend/src/styles/theme-enhancements.css` — 删除重复块，约 1280 行
4. `frontend/src/styles/theme.ts` — 无需修改（已有的 token 系统已足够）
5. `frontend/src/components/DataTable/glide-theme.ts` — 无需修改

## 验证

- `pnpm lint` — 无 ESLint 错误
- `pnpm exec -- tsc --noEmit` — 无类型错误
- `pnpm test` — 前端测试全部通过
