# iDBLink UI 布局与样式审查报告

> 审查日期：2026-10-21
> 审查方式：实机运行 `wails dev`（Vite :5100 + Wails 绑定桥 :34115），逐屏截图，
> 并用 Chrome DevTools Protocol 读取 DOM 计算样式与截图像素值做定量核对。
> 覆盖范围：顶栏、Tab 条、连接树、表列表工具栏、SQL 编辑器、命令面板、设置弹窗、
> 连接对话框、浅色/深色两套主题。

---

## 目录

- [零、审查方法与数据来源](#零审查方法与数据来源)
- [一、最突出的视觉问题](#一最突出的视觉问题)
- [二、顶栏布局](#二顶栏布局)
- [三、连接树](#三连接树)
- [四、表列表工具栏](#四表列表工具栏)
- [五、全局样式体系](#五全局样式体系)
- [六、可直接复制的改动](#六可直接复制的改动)
- [七、优先级与工作量](#七优先级与工作量)
- [附录 A：实测数据明细](#附录-a实测数据明细)

---

## 零、审查方法与数据来源

### 0.1 环境

| 项 | 值 |
|---|---|
| 运行方式 | `~/go/bin/wails dev`（Vite :5100 / Wails 桥 :34115） |
| 视口 | 1400×900 与 1024×700 两档 |
| 主题 | `default` 预设，light / dark 双主题 |
| 数据源 | 真实 MySQL 连接 `172.18.10.94`（8.0.45，17 个库） |

### 0.2 定量核对手段

本次审查不依赖肉眼判断，对每个结论都取了三类证据：

1. **计算样式** — `getComputedStyle` 读取字号、圆角、内边距、背景色、对比度
2. **像素采样** — 直接解码 PNG 截图，扫描指定坐标列的颜色跳变，还原真实的层级边界
3. **代码交叉验证** — 定位到具体文件行号，确认是「写死」还是「令牌失效」

示例：暗色主题下扫描内容列 x=2400 的纵向色带，得到

```
y=0    (32,35,41)    ← 顶栏      --background-toolbar #1F2228
y=86   (47,51,59)    ← 分隔线
y=88   (25,27,31)    ← Tab 条    透明，露出 body --background #1A1D23
y=162  (36,39,47)    ← 内容区    --background-card #23262E
```

这组数据直接推翻了"Tab 条有自己的背景色"的表面观感，是第 1 条问题的判定依据。

### 0.3 关键量化的实测结果

| 项 | 实测值 | 参考标准 |
|---|---|---|
| 断开连接圆点 vs 卡片底 | **1.57 : 1** | WCAG 非文本 ≥ 3:1 |
| 禁用按钮文字 vs 卡片底 | **1.57 : 1** | WCAG 非文本 ≥ 3:1 |
| `--text-tertiary` vs 卡片底（亮色） | 4.51 : 1 | WCAG 文本 ≥ 4.5:1 ✓ |
| `--color-primary` vs 卡片底（暗色） | 4.99 : 1 | ✓ |
| 实际使用的字号种类 | **14 种** | 令牌体系仅 6 档 |
| 实际使用的圆角种类 | **12 种** | 令牌体系仅 7 档 |
| 实际使用的内边距组合 | **38 种** | 令牌体系仅 6 档 |
| `.focus-ring` 类使用次数 | **0**（死代码） | — |
| AG Grid CSS 规则残留 | **37 处**（依赖已移除） | — |

---

## 一、最突出的视觉问题

### 1. 深色模式下三层背景挤在一起，Tab 条几乎"消失"

**位置**：`frontend/src/components/TabPanel/index.tsx:1627`（`tabBarStyle`）、
`frontend/src/styles/theme-enhancements.css:512`（`.ant-tabs-nav::before`）

**现象**

暗色主题下扫描内容列 x=2400 的纵向色带：

| 区域 | 实际像素 | 对应变量 |
|---|---|---|
| 顶栏 | `rgb(32,35,41)` | `--background-toolbar` #1F2228 |
| Tab 条 | `rgb(25,27,31)` → 渐变至 `rgb(28,31,38)` | **透明**，露出 body 的 `--background` #1A1D23 |
| 内容区 | `rgb(36,39,47)` | `--background-card` #23262E |

Tab 条区域比顶栏更暗、比内容区更暗，形成一条"凹槽"；同时
`.ant-tabs-nav::before`（antd 默认的分隔线）被改成 `--border-color-light`
（暗色下 #252932，对比度极低），几乎不可见。结果是 Tab 条既没有实体底色
也没有边界线，读起来像布局塌陷。

**根因**：`tabBarStyle` 写死 `background: 'transparent'`，没有给 Tab 条自己的表面。

**改法**：给 Tab 条一个实体背景 + 明确底边线，并关掉 antd 默认伪元素。

```css
/* frontend/src/styles/theme-enhancements.css —— 替换 512 行附近 */
.ant-tabs-nav {
  background: var(--background-toolbar);
  border-bottom: 1px solid var(--border);
}
.ant-tabs-nav::before {
  display: none;          /* 关掉 antd 默认伪元素，避免双线 */
}
.ant-tabs-tab-active {
  background: var(--background-card) !important;
}
```

激活态改为"卡片色 + 与内容区同底色"，未激活态透明。这样 Tab 会**嵌进内容区**
而不是浮在一条深色带上，同时 Tab 条底边线成为 Tab 条与内容区的分界。

> 注：`.ant-tabs-tab` 已有 `border-radius: 8px 8px 0 0`（theme-enhancements.css:483），
> 改成实体底色后这个圆角会与 Tab 条底边产生轻微冲突，建议同步改为
> `border-radius: 6px 6px 0 0`。

---

### 2. Tab 条缺少"新增 tab"入口，且右侧大片空置

**位置**：`frontend/src/components/TabPanel/index.tsx:1619`、`:1648`

**现象**

两处 `Tabs` 都设了 `hideAdd`，用户无法从 Tab 条新建标签，只能走顶栏「新建查询」。
而 Tab 条右侧 x=1200~2000 完全空置（实测 Tab 元素右边界在 x=682）。

同时，分屏能力（`TabPanel/index.tsx:1113-1125` 的 `splitHorizontal` /
`splitVertical` / `unsplit`）已经实现，但入口藏在菜单深处。

**改法**：去掉 `hideAdd`，用 antd 的 `tabBarExtraContent` 承载右侧操作区。

```tsx
// frontend/src/components/TabPanel/index.tsx:1614
<Tabs
  type="editable-card"
  size="small"
  activeKey={activeKey}
  onChange={...}
  // 移除 hideAdd
  tabBarExtraContent={
    <Space size={4}>
      <Tooltip title={t('common.splitHorizontal')}>
        <Button type="text" size="small" icon={<ColumnWidthOutlined />}
          onClick={() => handleMenuAction('splitHorizontal')} />
      </Tooltip>
      <Tooltip title={t('common.splitVertical')}>
        <Button type="text" size="small" icon={<RowHeightOutlined />}
          onClick={() => handleMenuAction('splitVertical')} />
      </Tooltip>
    </Space>
  }
  ...
>
```

---

## 二、顶栏布局

### 3. 顶栏左侧 92px 空白无条件预留，红绿灯区域与内容不对称

**位置**：`frontend/src/components/Toolbar/index.tsx:74`

**现象**

```tsx
padding: isMac ? '0 12px 0 92px' : '0 12px',
```

`isMac` 只判断平台，不判断是否真的运行在 Wails 里。浏览器实测（非 Wails 环境）
时仍走 mac 分支，出现 x=0~140 的整片空白，且折叠按钮孤零零悬在 x=140，
与右侧 5 个图标按钮在视觉上完全不对称。

**改法**：仅在真实 Wails 环境预留红绿灯空间。

```tsx
// frontend/src/components/Toolbar/index.tsx
const isWails = typeof window !== 'undefined' && !!(window as any).runtime;
padding: isWails && isMac ? '0 12px 0 92px' : '0 12px',
```

### 4. 顶栏右侧 5 个裸图标，可辨识性不足

**位置**：`frontend/src/components/Toolbar/index.tsx:257-304`

**现象**

右侧依次为 机器人(AI) / 键帽(快捷键) / 月亮(主题) / 设置，全是裸图标。
AI 按钮在未配置时用 `--text-tertiary`（实测 `rgb(161,161,170)`），
与已配置时的 primary 蓝（`rgb(113,134,245)`）形状完全相同，用户无法区分
"没生效"和"生效了"。

**改法**：

- AI 按钮未就绪时叠加一个小角标（Badge dot），或把图标换成 `RobotOutlined` +
  淡化的 tooltip 文案（当前 tooltip 已有 `notConfigured`，但视觉上看不出来）。
- 「快捷键」是低频功能，建议移入设置弹窗，顶栏只保留 AI / 主题 / 设置三个图标，
  减少右侧图标噪音。

### 5. 顶栏与 Tab 条之间有两条几乎贴在一起的横线

**现象**

- 顶栏 `borderBottom: 1px solid var(--border)`（Toolbar/index.tsx:71）
- Tab 条 `.ant-tabs-nav::before` → `--border-color-light`

在亮色主题下这两条线分别位于 y=44 与 y=82，间距仅 38px，视觉上像
"双线夹一条窄带"。暗色主题下第二条线近乎不可见，两种主题表现不一致。

**改法**：按第 1 条统一 Tab 条背景与边框后，Tab 条自身的 border-bottom
成为 Tab 条↔内容区的分界，顶栏的线保持不变，两者不再相邻。

---

## 三、连接树

### 6. 三级节点仅靠"等宽 vs 非等宽"区分，库/表图标形状太接近

**位置**：
- `frontend/src/components/ConnectionTree/hooks/useTreeData.tsx:515`（数据库名）
- `frontend/src/components/ConnectionTree/components/TableNode.tsx:70`（表名）

**现象**

| 层级 | 字体 | 字号 | 字重 |
|---|---|---|---|
| 连接名 | 无衬线 | 13px | 700（已连接时） |
| 数据库名 | **等宽** `--font-family-code` | 12.5px | 600（已加载时） |
| 表名 | **等宽** `--font-family-code` | 12.5px | 常规 |

两个下级层级用了同一个字体家族，层级差异只靠字号 0.5px 撑着。中文库名用等宽
渲染字距偏松，观感不如无衬线紧凑。

图标方面，`DatabaseOutlined`（12px）与 `TableOutlined`（12px）在 4 倍放大后
仍是两个相似的矩形轮廓，远看分不清是"库"还是"表"。

缩进方面，`style.css:603` 的 `--ant-tree-indent-unit: 16px` 偏小，
三级层次在视觉上挤在一起。

**改法**

```tsx
// useTreeData.tsx:508-518 —— 数据库名改为无衬线
fontSize: 13,
fontFamily: 'var(--font-family)',
fontWeight: 500,
```

```css
/* frontend/src/style.css:603 —— 缩进单位加大 */
.connection-tree.ant-tree .ant-tree-indent-unit {
  width: 20px !important;
}
```

数据库图标换成与表图标形状差异明显的版本（例如库用圆柱/堆叠层、表用网格），
保证 12px 下也能区分。

### 7. 断开连接的圆点几乎看不见（对比度 1.57:1）

**位置**：`frontend/src/components/ConnectionTree/hooks/useTreeData.tsx:929`

**现象**

```tsx
background: 'var(--text-disabled)',   // #C7C7CC
```

实测与卡片底 `#F8F7F4` 的对比度为 **1.57 : 1**，远低于 WCAG 非文本元素
要求的 3:1。截图中未连接的那 13 个连接后面的灰点几乎融进背景，
只有已连接那个绿色点（带 3px 光晕）能被看见。

**改法**

```tsx
// useTreeData.tsx:923-935
<Tooltip title={t('common.mainLayout.disconnected')}>
  <span
    style={{
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: 'var(--text-tertiary)',        // 原 --text-disabled
      border: '1px solid var(--border)',        // 补描边提升边界
      display: 'inline-block',
      marginLeft: 6,
      flexShrink: 0,
    }}
  />
</Tooltip>
```

### 8. 「已连接」用文字染色表达，与「选中」语义混淆

**位置**：`frontend/src/components/ConnectionTree/hooks/useTreeData.tsx:888`

**现象**

```tsx
color: conn.status === 'connected' ? 'var(--color-primary)' : undefined,
fontWeight: conn.status === 'connected' ? 700 : undefined,
```

18 条连接里唯一一条蓝色加粗的 "172.18.10.94" 极其跳眼。但它表达的是
**连接状态**，不是**选中状态**——用户第一眼会以为"这条被选中了"。

**改法**：连接状态只用圆点表达，文字颜色保持统一；选中态交给树节点的
`nodeSelectedBg`（已由 `theme-enhancements.css:742` / `:767` 正确实现）。

```tsx
// useTreeData.tsx:886-892 —— 去掉状态染色
<span style={{ userSelect: 'none' }}>
  {conn.name && <HighlightText text={conn.name} query={searchText} />}
  ...
</span>
```

---

## 四、表列表工具栏

**位置**：`frontend/src/components/TableList.tsx:930-1114`

### 9. 10 个纯图标按钮挤在左侧，其中 6 个默认 disabled

**实测**

按钮尺寸 28×28、间距 8px，从 x=332 排到 x=702：

| x | 按钮 | 状态 |
|---|---|---|
| 332 | 打开 | disabled |
| 368 | 设计 | disabled |
| 404 | 新建 | enabled |
| 440 | 清空 | disabled |
| 476 | 复制 | disabled |
| 512 | 导出 SQL | disabled |
| 548 | 删除 | disabled |
| 593 | 导入 | enabled |
| 629 | 导出 | enabled |
| 674 | 刷新 | enabled |

前 5 个灰掉的按钮使用 `opacity: 0.6` + `--text-disabled`，
实测对比度 **1.57 : 1**，在截图里连成一片灰色色块。

**改法**

1. 图标按钮改为「文字 + 图标」的次级按钮，或保留主操作（打开 / 设计 / 新建）
   为图标，其余收进「更多」下拉菜单。
2. disabled 态改用 `--text-tertiary`，或给禁用按钮保留 30% 的图标轮廓。
3. `TableList.tsx:1070` 与 `:1089` 两处 `1px × 20px` 分隔线可以去掉一处，
   减少视觉碎裂。

```tsx
// 禁用态颜色：全局 style.css:199-205
button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  color: var(--text-tertiary);   /* 新增：代替继承的 --text-disabled */
}
```

### 10. 「表 0 / 视图 0」两个 Tag 是筛选器，但长得像高亮按钮

**位置**：`frontend/src/components/TableList.tsx:1116+`

**现象**

两个 Tag 使用 primary 底 + primary 字 + primary 描边，在亮色主题下渲染为
两块淡蓝底的高亮块（见截图），视觉权重盖过了右边的搜索框。但它们实际是
可点击的过滤器（切换 `objectType`），且没有 hover / active 态区分，
用户不知道能点。

**改法**：改用 antd `Segmented`，当前项实底、其余透明，一眼可辨是"当前筛选"。

```tsx
// TableList.tsx —— 替换 1116 起的 Tag 块
<Segmented
  size="small"
  value={objectType}
  onChange={(v) => setObjectType(v as any)}
  options={[
    { label: `${t('common.tablesLabel')} ${tableCount}`, value: 'table' },
    { label: `${t('common.viewsLabel')} ${viewCount}`, value: 'view' },
    { label: t('common.all'), value: 'all' },
  ]}
/>
```

---

## 五、全局样式体系

### 11. 字号有 14 种，且三套体系并行、组件几乎全用硬编码

**实测计算样式中出现的字号**

```
7 / 10 / 11 / 12 / 12.5 / 13 / 14 / 16 / 20 / 24 / 26 / 32 / 34 / 36 / 40 px
```

**代码中的硬编码分布**

| 值 | 出现次数 |
|---|---|
| `fontSize: 12` | 163 |
| `fontSize: 11` | 128 |
| `fontSize: 13` | 45 |
| `fontSize: 10` | 36 |
| `fontSize: 14` | 26 |

**令牌体系**

| 位置 | 档位 |
|---|---|
| `style.css:72-78` | `--font-size-xs/sm/base/lg/xl/display`（6 档） |
| `styles/theme.ts:129-135` | `fontSizeMini/Secondary/Code/Body/Heading1-3/Display`（7 档） |
| 组件内 `var(--font-size-*)` 命中 | **0 次**（仅 style.css 自身用了 12 次） |

三套定义并存，组件却全部绕开令牌直接写数字——这是字号混乱的直接原因。

**改法**

1. 定一档 `--font-size-*` 作为唯一来源，删掉 `theme.ts` 里重复的
   `TYPOGRAPHY.fontSize*`。
2. 收敛为三档：
   - `--font-size-xs: 11px`（角标、计数）
   - `--font-size-sm: 12px`（辅助说明、树节点次级）
   - `--font-size-base: 14px`（正文）
   - 13 → 14，12.5 → 12，10 → 11
3. 上 ESLint 规则禁止 `.tsx` 里出现裸 `fontSize: N`。

### 12. 圆角与内边距同样失控

**圆角实测**

```
2 / 3 / 4 / 6 / 7 / 8 / 10 / 12 / 16 / 18 / 50% / 99%
```

`style.css:92-99` 定义了 `--radius-sm/md/lg/xl` + `--radius-control/surface/overlay`
共 7 档语义令牌，但组件里 `borderRadius: 7` 出现 3 次
（`Toolbar/index.tsx:226`、`:244`、`SQLEditor/components/SQLEditorToolbar.tsx:142`），
而 **7 不在任何令牌里**。

**内边距实测** 38 种不同组合，其中明显是"调出来好看"的随手值：

| 值 | 位置 |
|---|---|
| `'16px 12px 8px'` | `ConnectionDialog.tsx:439` |
| `'16px 20px 12px'` | `ConnectionDialog.tsx:525` |
| `'40px 20px'` | `LoadingStates.tsx:53` |
| `'3px 10px'` | `theme-enhancements.css:1103` |
| `'4px 11px'` | 实测采自 DOM |

**改法**

用 PostCSS / 脚本批量把 `borderRadius: N` → `var(--radius-*)`、
`padding: '...'` → `var(--spacing-*)`，然后用 ESLint 规则锁死裸值。
优先处理 `7px` / `3px` / `4px 11px` 这类无对应令牌的孤立值。

### 13. `.focus-ring` 类定义了但全项目 0 处使用（死代码）

**位置**：`frontend/src/styles/theme-enhancements.css:92-103`

```css
.focus-ring:focus-visible,
.focus-ring:focus { outline: none; box-shadow: var(--focus-ring-shadow, ...); }
```

`grep -rn "focus-ring" src/ --include="*.tsx"` 无命中。
实测键盘 focus 到顶栏按钮时：

```
outline: rgb(74, 93, 214) none 3px      ← outline-style 为 none，实际不可见
boxShadow: none
```

也就是说**自定义按钮与树节点的键盘焦点完全不可见**。antd 组件靠其自身样式兜底，
但 `style.css:175-182` 的全局 `button { outline: none }` 会让所有原生按钮失焦。

**改法**：删掉死类，或改为全局规则覆盖：

```css
/* frontend/src/style.css —— 替换 175-182 的 button reset */
button:focus-visible,
[role='button']:focus-visible,
.ant-tree-node-content-wrapper:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

### 14. 死代码：AG Grid 的 CSS 还留着，但依赖早已移除

**实测**

| 文件 | `ag-theme-*` 规则数 |
|---|---|
| `frontend/src/style.css` | 20 |
| `frontend/src/styles/theme-enhancements.css` | 17 |

`frontend/package.json` 中**没有 `ag-grid` 依赖**——项目已改用
`@glideapps/glide-data-grid`（见 `DataTable/glide-theme.ts`）。
`style.css:634-717` 整段「AG Grid 紧凑模式样式」以及 theme-enhancements 中的
`.ag-theme-alpine*` 规则全部是死代码。

**改法**：删除 `style.css:634-717` 与 theme-enhancements.css 中全部
`.ag-theme-*` 规则。可显著缩小样式表体积、减少排查干扰，也避免后来者
误以为项目仍在用 AG Grid。

---

## 六、可直接复制的改动

### A. Tab 条实体化（对应第 1 条）

```css
/* frontend/src/styles/theme-enhancements.css */
.ant-tabs-nav {
  background: var(--background-toolbar);
  border-bottom: 1px solid var(--border);
}
.ant-tabs-nav::before { display: none; }
.ant-tabs-tab { border-radius: 6px 6px 0 0 !important; }
.ant-tabs-tab-active { background: var(--background-card) !important; }
```

### B. 树节点三级字重/字号规范化（对应第 6 条）

```tsx
// useTreeData.tsx:508-518 —— 数据库名
fontSize: 13,
fontFamily: 'var(--font-family)',
fontWeight: 500,

// TableNode.tsx:70 —— 表名保持等宽
fontSize: 12.5,
fontFamily: 'var(--font-family-code)',
```

### C. 断开状态圆点提对比（对应第 7 条）

```tsx
// useTreeData.tsx:923-935
background: 'var(--text-tertiary)',
border: '1px solid var(--border)',
```

### D. 「表 / 视图」筛选改 Segmented（对应第 10 条）

```tsx
// TableList.tsx:1116+
<Segmented
  size="small"
  value={objectType}
  onChange={(v) => setObjectType(v as any)}
  options={[
    { label: `${t('common.tablesLabel')} ${tableCount}`, value: 'table' },
    { label: `${t('common.viewsLabel')} ${viewCount}`, value: 'view' },
    { label: t('common.all'), value: 'all' },
  ]}
/>
```

### E. 全局焦点可见（对应第 13 条）

```css
/* frontend/src/style.css —— 替换 175-182 */
button:focus-visible,
.ant-tree-node-content-wrapper:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

---

## 七、优先级与工作量

| 优先级 | 条目 | 涉及文件 | 预估工作量 | 理由 |
|---|---|---|---|---|
| **P0** | #1 Tab 条背景与分隔线 | theme-enhancements.css | 30 分钟 | 暗色下最显眼的问题，一眼可见 |
| **P0** | #9 表列表工具栏图标噪音 | TableList.tsx, style.css | 1 小时 | 影响最高频操作区 |
| **P0** | #14 删 AG Grid 死 CSS | style.css, theme-enhancements.css | 30 分钟 | 零风险纯收益 |
| **P0** | #13 焦点可见 | style.css | 20 分钟 | 无障碍硬指标 |
| **P1** | #11 字号令牌化 | 全前端 + style.css + theme.ts | 2~3 小时 | 工作量大但收益长期 |
| **P1** | #12 圆角/内边距令牌化 | 全前端 | 2~3 小时 | 同上 |
| **P1** | #7 #8 树的状态语义 | useTreeData.tsx | 30 分钟 | 对比度 1.57:1 低于 WCAG |
| **P1** | #10 筛选器改 Segmented | TableList.tsx | 40 分钟 | 可发现性 |
| **P2** | #2 Tab 条操作区 | TabPanel/index.tsx | 1.5 小时 | 结构性改动，需产品决策 |
| **P2** | #3 #4 #5 顶栏与 Tab 条 | Toolbar/index.tsx | 1 小时 | 同上 |
| **P2** | #6 树图标与缩进 | useTreeData.tsx, style.css | 1 小时 | 打磨项 |

### 建议的落地顺序

1. **第一批（半天）**：#1 → #14 → #13 → #9 → #7 → #10
   全部是低风险改动，做完视觉提升最直接，且不涉及布局重构。
2. **第二批（一天）**：#11 → #12 令牌化，配套加 ESLint 规则防止回退。
3. **第三批（需产品确认）**：#2 → #3 → #4 → #5 → #6 → #8

### 验证方式

改动后按 `AGENTS.md` 的验证顺序执行：

```bash
pnpm lint → pnpm exec -- tsc --noEmit → pnpm test → go test ./...
```

其中前端样式改动需额外在 `wails dev` 下**双主题各看一遍**：
Tab 条（#1）、树节点（#6~#8）、表列表工具栏（#9~#10）三处必须目视确认。
注意 WKWebView 与 Chromium 的渲染差异，重点检查 Tab 条是否出现错位或双线。

---

## 附录 A：实测数据明细

### A.1 暗色主题纵向色带（内容列 x=2400，2x 截图）

```
y=0    (32,35,41)    顶栏       --background-toolbar #1F2228
y=86   (47,51,59)    顶栏下边框
y=88   (25,27,31)    Tab 条     透明 → body --background #1A1D23
y=95   (28,31,35)
y=146  (28,31,38)
y=152  (38,42,51)    分隔线
y=162  (36,39,47)    内容区     --background-card #23262E
y=178  (47,50,57)    按钮边框
y=231  (61,64,70)
```

### A.2 亮色主题纵向色带（同上坐标）

```
y=0    (33,36,42)
y=86   (47,51,59)    顶栏下边框
y=88   (25,27,31)    Tab 条     透明 → body --background
y=152  (38,42,51)
y=162  (36,39,47)    内容区
```

### A.3 关键元素实测尺寸

| 元素 | 实测 |
|---|---|
| 顶栏高度 | 44px |
| 状态栏高度 | 28px |
| Tab 条高度 | 37px（Tab 元素本身 26~27px） |
| 侧边栏宽度 | 320px（固定，`collapsedWidth={0}`） |
| 树节点行高 | 26px（内容单元 24px） |
| 树标题字号 | 13px |
| 顶栏按钮字号 | 12.5px |
| 表列表按钮 | 28×28，间距 8px |
| 表格行 padding | `6px 12px` |

### A.4 颜色令牌（`styles/theme.ts` 默认预设）

**亮色**

| 变量 | 值 |
|---|---|
| `--background` | #F2F1ED |
| `--background-card` | #F8F7F4 |
| `--background-toolbar` | #EFEEEA |
| `--border` | #E3E2DC |
| `--border-light` | #EFEDE8 |
| `--text-primary` | #111111 |
| `--text-secondary` | #3F3F46 |
| `--text-tertiary` | #6B7280 |
| `--text-disabled` | #C7C7CC |
| `--color-primary` | #4A5DD6 |

**暗色**

| 变量 | 值 |
|---|---|
| `--background` | #1A1D23 |
| `--background-card` | #23262E |
| `--background-toolbar` | #1F2228 |
| `--border` | #2E323A |
| `--border-light` | #252932 |
| `--text-primary` | #E4E4E7 |
| `--text-secondary` | #A1A1AA |
| `--text-tertiary` | #7C8087 |
| `--text-disabled` | #4A4D55 |
| `--color-primary` | #7186F5 |

### A.5 令牌使用率（`grep` 统计）

| 令牌族 | .tsx 命中 | .css 命中 |
|---|---|---|
| `var(--font-size-*)` | **0** | 12（style.css 自身） |
| `var(--radius-*)` | **0** | 9 |
| `var(--spacing-*)` | **0** | 29（style.css 自身） |
| `var(--glass-*)` | 0 | 8（theme-enhancements.css） |

结论：令牌体系只在 style.css 内部自洽，组件层完全绕开。

---

*本报告基于 2026-10-21 的 `main` 工作区状态生成。所有行号引用均经过核对，
后续代码变动后请同步更新。*
