# 数据库客户端 - UI 设计文档

## 设计概述

### 设计理念
- **布局风格**：采用优化的双栏布局（连接树 + 对象树合并），提升操作效率，降低老用户学习成本
- **配色方案**：蓝色系主题（专业感、科技感），支持深色/浅色主题切换
- **交互习惯**：保持传统桌面应用的操作习惯，符合 Navicat 用户使用习惯
- **图标系统**：使用 Ant Design Icons 图标库，保持风格统一
- **设计原则**：专业性、易用性、美观性、一致性、可访问性

### 核心界面

本文档包含 5 个核心界面的高保真原型设计：

1. [主界面](#1-主界面-navicat-风格布局)
2. [自定义分组功能](#2-自定义分组功能)
3. [SQL 查询编辑器](#3-sql-查询编辑器已实现)
4. [连接配置对话框](#4-连接配置对话框)
5. [ER 图设计器](#5-er-图设计器)

---

## 图标系统设计

### 图标库选择

#### Ant Design (React)
```typescript
import { 
  Database, 
  Table, 
  Search, 
  Setting, 
  Plus, 
  Edit, 
  Delete,
  Download,
  Upload,
  Refresh,
  Save,
  Copy,
  Scissor,
  Undo,
  Redo,
  Folder,
  FileText,
  Code,
  Thunderbolt,
  Link,
  Star,
  Heart,
  CheckCircle,
  CloseCircle,
  InfoCircle,
  Warning,
} from '@ant-design/icons';
```

**安装**:
```bash
npm install @ant-design/icons
```

#### Element Plus (Vue3)
```vue
<script setup>
import {
  Database,
  Grid,
  Search,
  Setting,
  Plus,
  Edit,
  Delete,
  Download,
  Upload,
  Refresh,
  Save,
  CopyDocument,
  Scissor,
  RefreshLeft,
  RefreshRight,
  Folder,
  Document,
  Notebook,
  Lightning,
  Connection,
  Star,
  Checked,
  CircleCheck,
  CircleClose,
  InfoFilled,
  Warning,
} from '@element-plus/icons-vue'
</script>
```

**安装**:
```bash
npm install @element-plus/icons-vue
```

### 图标映射表

| 用途 | Ant Design Icon | Element Plus Icon | Unicode 备选 |
|------|----------------|-------------------|--------------|
| **数据库类型** |
| MySQL | `Database` | `Database` | 🐬 |
| PostgreSQL | `Api` | `Connection` | 🐘 |
| SQLite | `FileText` | `Document` | ▢ |
| SQL Server | `CloudServer` | `Monitor` | ◫ |
| Oracle | `Sun` | `Sunny` | ☀ |
| MariaDB | `Cluster` | `Grid` | 🦭 |
| 达梦 | `Block` | `Square` | ◈ |
| **对象类型** |
| 表 | `Table` | `Grid` | ▢ |
| 视图 | `Eye` | `View` | ◫ |
| 函数 | `Function` | `Notebook` | ƒ |
| 存储过程 | `Thunderbolt` | `Lightning` | ⚡ |
| 索引 | `SortAscending` | `Sort` | 📊 |
| 触发器 | `Trigger` | `Switcher` | 🔔 |
| **操作按钮** |
| 新建 | `Plus` | `Plus` | ⊕ |
| 打开 | `FolderOpen` | `FolderOpened` | 📂 |
| 保存 | `Save` | `Save` | 💾 |
| 编辑 | `Edit` | `Edit` | ✎ |
| 删除 | `Delete` | `Delete` | 🗑 |
| 刷新 | `Reload` | `Refresh` | ⟳ |
| 搜索 | `Search` | `Search` | 🔍 |
| 设置 | `Setting` | `Setting` | ⚙ |
| 导出 | `Export` | `Download` | ⤓ |
| 导入 | `Import` | `Upload` | ⤒ |
| 复制 | `Copy` | `CopyDocument` | 📄 |
| 剪切 | `Scissor` | `Scissor` | ✂ |
| 粘贴 | `Pushpin` | `Paperclip` | 📋 |
| 撤销 | `Undo` | `RefreshLeft` | ↶ |
| 重做 | `Redo` | `RefreshRight` | ↷ |
| 执行 | `PlaySquare` | `VideoPlay` | ▶ |
| 停止 | `Stop` | `VideoPause` | ⏹ |
| **状态图标** |
| 已连接 | `CheckCircle` | `CircleCheck` | ✓ |
| 未连接 | `CloseCircle` | `CircleClose` | × |
| 加载中 | `Loading` | `Loading` | ⟳ |
| 成功 | `CheckCircle` | `CircleCheck` | ✓ |
| 错误 | `CloseCircle` | `CircleClose` | ✗ |
| 警告 | `Warning` | `Warning` | ⚠ |
| 信息 | `InfoCircle` | `InfoFilled` | ℹ |
| **导航和布局** |
| 文件夹/分组 | `Folder` | `Folder` | 📁 |
| 收藏 | `Star` | `Star` | ⭐ |
| 历史 | `History` | `Time` | 🕐 |
| 展开 | `Down` | `ArrowDown` | ▼ |
| 折叠 | `Right` | `ArrowRight` | ▶ |
| 更多 | `Ellipsis` | `More` | ⋯ |
| 关闭 | `Close` | `Close` | × |
| **其他** |
| 链接/外键 | `Link` | `Connection` | 🔗 |
| 主键 | `Key` | `Key` | 🔑 |
| 代码 | `Code` | `Notebook` | </> |
| 图表 | `AreaChart` | `TrendCharts` | 📊 |
| 模型 | `Appstore` | `Menu` | ◈ |

### 使用示例

#### React + Ant Design
```tsx
import { Button, Space, Menu } from 'antd';
import { 
  Database, 
  Plus, 
  Save, 
  Search,
  Table,
  Thunderbolt 
} from '@ant-design/icons';

// 工具栏按钮
<Space>
  <Button icon={<Plus />} type="primary">新建连接</Button>
  <Button icon={<Save />}>保存</Button>
  <Button icon={<Search />}>搜索</Button>
</Space>

// 树形节点图标
<Menu.Item 
  key="mysql" 
  icon={<Database />}
>
  本地 MySQL
</Menu.Item>

<Menu.Item 
  key="users" 
  icon={<Table />}
>
  users
</Menu.Item>

<Menu.Item 
  key="functions" 
  icon={<Thunderbolt />}
>
  存储过程
</Menu.Item>
```

#### Vue3 + Element Plus
```vue
<template>
  <el-space>
    <el-button type="primary" :icon="Plus">新建连接</el-button>
    <el-button :icon="Save">保存</el-button>
    <el-button :icon="Search">搜索</el-button>
  </el-space>

  <!-- 树形节点图标 -->
  <el-tree-node :icon="Database">
    <template #title>
      <span>本地 MySQL</span>
    </template>
  </el-tree-node>

  <el-tree-node :icon="Grid">
    <template #title>
      <span>users</span>
    </template>
  </el-tree-node>
</template>

<script setup>
import { Plus, Save, Search, Database, Grid } from '@element-plus/icons-vue'
</script>
```

### 图标尺寸规范

| 位置 | 尺寸 | CSS Class |
|------|------|-----------|
| 工具栏按钮 | 16px | `icon-sm` |
| 菜单项 | 16px | `icon-sm` |
| 树形节点 | 16px | `icon-sm` |
| 列表项 | 18px | `icon-md` |
| 空状态插图 | 64px+ | `icon-lg` |

```css
.icon-sm { font-size: 16px; }
.icon-md { font-size: 18px; }
.icon-lg { font-size: 24px; }
```

### 图标颜色规范

```css
/* 使用 CSS 变量，适配主题 */
.icon-primary { color: var(--color-accent); }
.icon-success { color: var(--color-success); }
.icon-warning { color: var(--color-warning); }
.icon-danger { color: var(--color-danger); }
.icon-info { color: var(--color-info); }
.icon-muted { color: var(--color-text-muted); }
```

### 自定义图标组合

对于特殊场景，可以组合多个图标：

```tsx
// 数据库连接状态
const DatabaseStatusIcon = ({ status }) => {
  const icons = {
    connected: <CheckCircle className="text-success" />,
    disconnected: <CloseCircle className="text-muted" />,
    loading: <Loading className="text-info" />,
  };
  return icons[status] || null;
};

// 表类型标识
const TableTypeIcon = ({ type }) => {
  if (type === 'view') return <Eye />;
  if (type === 'temporary') return <ClockCircle />;
  return <Table />;
};
```

---

## 1. 主界面（Navicat 风格布局）

### 布局结构

#### 优化后的双栏布局（已实现）

根据用户反馈，我们优化了布局结构，将连接树和对象列表合并为一个面板，提升操作效率：

```
┌─────────────────────────────────────────────────────────┐
│  i-dblink                                                │  ← 标题栏
├─────────────────────────────────────────────────────────┤
│  文件 (F) | 编辑 (E) | 查看 (V) | 连接 (C) | ...        │  ← 菜单栏
├─────────────────────────────────────────────────────────┤
│  工具栏 (Toolbar)                                        │
│  [⊕新建] [📂打开] [💾保存] | [🌙主题] [⚙设置]          │
├───────────────┬─────────────────────────────────────────┤
│               │                                         │
│  连接树       │         主工作区                         │
│  + 对象树     │      (多标签页)                          │
│  (320px)      │                                         │
│               │  ┌─────────────────────────────────┐   │
│  📁 默认分组  │  │ [查询1.sql] [数据表] [+]        │   │
│   🗄 MySQL    │  ├─────────────────────────────────┤   │
│    📋 表 (5)  │  │                                 │   │
│     users     │  │   SQL 编辑器 / 数据网格          │   │
│     orders    │  │                                 │   │
│    👁 视图 (2)│  │                                 │   │
│    ⚡ 过程 (3)│  └─────────────────────────────────┘   │
│   🗄 PostgreSQL│                                         │
│    📋 表 (8)  │                                         │
│               │                                         │
├───────────────┴─────────────────────────────────────────┤
│  日志面板 (180px, 可折叠)                                │
│  [查询历史] [错误日志] [系统日志]                         │
├─────────────────────────────────────────────────────────┤
│  状态栏 (28px)                                           │
│  ✓ 已连接：本地 MySQL | test_db | 4 行 | 23ms | UTF-8   │
└─────────────────────────────────────────────────────────┘
```

#### 关键尺寸规范

- **菜单栏高度**：32px
- **工具栏高度**：40px
- **侧边栏宽度**：320px（可折叠至 80px）
- **日志面板高度**：180px（可折叠）
- **状态栏高度**：28px
- **标签页高度**：36px

#### Windows/Linux 版本
```
┌─────────────────────────────────────────────────────────┐
│  i-dblink                                                │  ← 标题栏
├─────────────────────────────────────────────────────────┤
│  文件 (F) | 编辑 (E) | 查看 (V) | 连接 (C) | ...        │  ← 菜单栏
├─────────────────────────────────────────────────────────┤
│  工具栏 (Toolbar)                                        │
│  [⊕新建] [📂打开] [💾保存] | [✂剪切] [📄复制]...       │
├───────────────┬─────────────────────────────────────────┤
│               │                                         │
│  连接树       │         主工作区                         │
│  + 对象树     │      (多标签页)                          │
│  (320px)      │                                         │
├───────────────┴─────────────────────────────────────────┤
│  日志面板 (180px, 可折叠)                                │
├─────────────────────────────────────────────────────────┤
│  状态栏 (28px)                                           │
│  ✓ 已连接：本地 MySQL | test_db | 4 行 | 23ms            │
└─────────────────────────────────────────────────────────┘
```

#### macOS 版本（系统级菜单栏）
```
  i-dblink   文件   编辑   查看   连接   工具   窗口   帮助  │  ← 系统菜单栏
                                                                        
┌─────────────────────────────────────────────────────────┐
│  [⊕] [📂] [💾] | [✂] [📄] [📋] | [🌙] [⚙] | [▶]        │  ← 应用工具栏
├───────────────┬─────────────────────────────────────────┤
│               │                                         │
│  连接树       │         主工作区                         │
│  + 对象树     │      (多标签页)                          │
│  (320px)      │                                         │
├───────────────┴─────────────────────────────────────────┤
│  日志面板 (180px, 可折叠)                                │
├─────────────────────────────────────────────────────────┤
│  状态栏 (28px)                                           │
│  ✓ 已连接：本地 MySQL | test_db | 4 行 | 23ms            │
└─────────────────────────────────────────────────────────┘
```

### 菜单栏跨平台适配

#### Windows/Linux 菜单结构
```
文件 (F)
├── 新建连接 (N)           Ctrl+N
├── 打开连接 (O)           Ctrl+O
├── ─────────────
├── 保存连接 (S)           Ctrl+S
├── 另存为... (A)
├── ─────────────
├── 导入 (I)               Ctrl+I
├── 导出 (E)               Ctrl+E
├── ─────────────
├── 退出 (X)               Alt+F4

编辑 (E)
├── 撤销 (U)               Ctrl+Z
├── 重做 (R)               Ctrl+Y
├── ─────────────
├── 剪切 (T)               Ctrl+X
├── 复制 (C)               Ctrl+C
├── 粘贴 (P)               Ctrl+V
├── 删除 (D)               Delete
├── ─────────────
├── 全选 (A)               Ctrl+A
├── 查找/替换... (F)       Ctrl+F

查看 (V)
├── 刷新 (R)               F5
├── ─────────────
├── 放大 (I)               Ctrl++
├── 缩小 (O)               Ctrl+-
├── 实际大小 (Z)           Ctrl+0
├── ─────────────
├── 全屏切换 (B)           F11

连接 (C)
├── 连接所选 (C)           Ctrl+Shift+C
├── 断开连接 (D)
├── ─────────────
├── 新建查询 (Q)           Ctrl+Q
├── 执行查询 (E)           Ctrl+Enter
├── ─────────────
├── 关闭所有连接 (L)

工具 (T)
├── 选项/设置... (O)       Ctrl+,
├── ─────────────
├── 数据同步... (S)
├── 备份数据库... (B)
├── 恢复数据库... (R)
├── ─────────────
├── 模型设计器... (M)

窗口 (W)
├── 新建标签页 (N)         Ctrl+T
├── 关闭标签页 (C)         Ctrl+W
├── ─────────────
├── 切换到下一个标签页     Ctrl+Tab
├── 切换到上一个标签页     Ctrl+Shift+Tab
├── ─────────────
├── 层叠窗口
├── 水平平铺
├── 垂直平铺

帮助 (H)
├── 目录 (C)               F1
├── 搜索... (S)
├── ─────────────
├── 检查更新... (U)
├── ─────────────
├── 关于 DB Master (A)
```

#### macOS 菜单结构（系统菜单栏）
```
 DB Master Premium（应用菜单）
├── 关于 DB Master Premium
├── ─────────────
├── 偏好设置... (,)        Cmd+,
├── ─────────────
├── 服务
├── ─────────────
├── 隐藏 DB Master         Cmd+H
├── 隐藏其他               Cmd+Option+H
├── 显示全部
├── ─────────────
├── 退出 DB Master         Cmd+Q

文件
├── 新建连接 (N)           Cmd+N
├── 打开连接 (O)           Cmd+O
├── ─────────────
├── 保存连接 (S)           Cmd+S
├── 另存为... (A)          Cmd+Shift+S
├── ─────────────
├── 导入 (I)               Cmd+I
├── 导出 (E)               Cmd+E
├── ─────────────
├── 页面设置...
├── 打印...                Cmd+P

编辑
├── 撤销 (U)               Cmd+Z
├── 重做 (R)               Cmd+Shift+Z
├── ─────────────
├── 剪切 (T)               Cmd+X
├── 复制 (C)               Cmd+C
├── 粘贴 (P)               Cmd+V
├── 删除 (D)               Cmd+Delete
├── ─────────────
├── 全选 (A)               Cmd+A
├── 查找/替换... (F)       Cmd+F

查看
├── 刷新 (R)               Cmd+R
├── 放大 (I)               Cmd++
├── 缩小 (O)               Cmd+-
├── 实际大小 (Z)           Cmd+0
├── ─────────────
├── 进入全屏               Ctrl+Cmd+F

连接
├── 连接所选 (C)           Cmd+Shift+C
├── 断开连接 (D)
├── ─────────────
├── 新建查询 (Q)           Cmd+Q
├── 执行查询 (E)           Cmd+Return
├── ─────────────
├── 关闭所有连接 (L)

工具
├── 数据同步... (S)
├── 备份数据库... (B)
├── 恢复数据库... (R)
├── ─────────────
├── 模型设计器... (M)

窗口
├── 最小化                 Cmd+M
├── 缩放                   Cmd+Shift+M
├── ─────────────
├── 新建标签页 (N)         Cmd+T
├── 关闭标签页 (C)         Cmd+W
├── ─────────────
├── 移到右侧的新标签页中
├── ─────────────
├── 前置窗口
├── 显示所有窗口

帮助
├── DB Master Premium 帮助 (?)
├── ─────────────
├── 检查更新...
```

### 界面特点

**菜单栏（跨平台适配）**

| 特性 | Windows/Linux | macOS |
|------|---------------|-------|
| 菜单位置 | 应用窗口顶部 | 系统顶部菜单栏 |
| 应用菜单 | 无 |  应用菜单（关于、偏好设置、退出） |
| 快捷键修饰符 | Ctrl / Alt | Cmd / Option / Ctrl |
| 退出快捷键 | Alt+F4 | Cmd+Q |
| 设置入口 | 工具 → 选项 | 偏好设置... (Cmd+,) |
| 全屏 | F11 | Ctrl+Cmd+F |
| 打印 | 文件 → 打印 (Ctrl+P) | 文件 → 打印 (Cmd+P) |

**通用菜单项**（所有平台）：
- 文件：新建、打开、保存、导入、导出
- 编辑：撤销、重做、剪切、复制、粘贴、删除、查找
- 查看：刷新、缩放、全屏
- 连接：连接、断开、新建查询、执行
- 工具：数据同步、备份、恢复、模型设计器
- 窗口：标签页管理、窗口布局
- 帮助：文档、检查更新、关于

**工具栏**
- 常用操作快捷按钮
- 分组分隔线
- 图标 + 文字提示
- 主题切换按钮（深色/浅色）
- macOS 下更紧凑的布局

**左侧面板（连接树 + 对象树）** - 已实现
- ✅ 支持自定义分组（默认分组 + 自定义分组）
- ✅ 树形展开/折叠，展开连接后直接显示数据库对象
- ✅ 连接状态实时显示（已连接显示绿色徽章）
- ✅ 对象类型图标区分（表、视图、存储过程）
- ✅ 对象数量显示在标签旁
- ✅ 右键上下文菜单（连接、断开、编辑、删除等）
- ✅ 搜索过滤功能
- ✅ 深色/浅色主题适配

**主工作区（右侧）**
- 多标签页支持
- SQL 编辑器（Monaco Editor）
- 数据网格视图（AG Grid）
- 底部可折叠日志面板

**日志面板（底部）**
- 查询历史记录
- 错误日志
- 系统日志
- 可折叠设计

**状态栏**
- 连接状态
- 当前数据库/表信息
- 执行统计（行数、耗时）
- 编码格式（UTF-8）

---

## 2. 自定义分组功能

### 功能特性

#### 2.1 创建分组
- 工具栏"新建分组"按钮
- 右键菜单"新建分组"
- 快捷键支持

#### 2.2 分组配置
```
┌─────────────────────────────┐
│     新建分组                │
├─────────────────────────────┤
│ 分组名称                    │
│ [开发环境__________]        │
│                             │
│ 分组图标                    │
│ [🗂] [📁] [🌐] [💻] ...    │
│                             │
│ 分组颜色                    │
│ [🔵] [🟢] [🟠] [🔴] ...    │
│                             │
│      [取消]  [创建分组]     │
└─────────────────────────────┘
```

#### 2.3 分组操作
- **重命名**：F2 快捷键 / 右键菜单
- **删除**：右键菜单（需确认）
- **更改图标**：12 种预设图标
- **更改颜色**：8 种主题色
- **拖拽移动**：连接在不同分组间拖拽
- **展开/折叠**：状态自动保存
- **导入导出**：分组配置备份

#### 2.4 右键菜单
```
┌─────────────────────┐
│ ➕ 新建分组         │
│ 📁 新建连接         │
├─────────────────────┤
│ ✎ 重命名分组   (F2) │
│ 🎨 更改图标         │
│ 🎨 更改颜色         │
├─────────────────────┤
│ 📤 导出分组         │
├─────────────────────┤
│ 🗑 删除分组          │
└─────────────────────┘
```

---

## 3. SQL 查询编辑器（已实现）

### 界面布局

```
┌─────────────────────────────────────────────────────────┐
│  [查询] [模型] [导入导出]                                │
├──────────┬──────────────────────────────────────────────┤
│  数据库  │  [新建查询] [用户统计.sql] [+]               │
│  对象    ├──────────────────────────────────────────────┤
│          │  [▶执行] [⏹停止] | [格式化] [保存] | ...     │
│  🗄db    │                                              │
│  ──────  │  ┌────────────────────────────────────┐     │
│  📋表    │  │ 1  -- 查询活跃用户                  │     │
│   users  │  │ 2  SELECT u.id, u.username,         │     │
│   orders │  │ 3         COUNT(o.id) AS order_cnt │     │
│   ─────  │  │ 4  FROM users u                     │     │
│  👁视图  │  │ 5  LEFT JOIN orders o ON ...        │     │
│  ƒ函数  │  │ 6  WHERE u.status = 'active'        │     │
│  ⚡过程  │  │ 7  GROUP BY u.id                    │     │
│          │  │ 8  ORDER BY order_cnt DESC;         │     │
│          │  └────────────────────────────────────┘     │
│          ├──────────────────────────────────────────────┤
│          │ [结果 (10)] [消息] [执行计划]                 │
│          ├──────────────────────────────────────────────┤
│          │ user_id | username | order_count | total     │
│          │ ───────────────────────────────────────────  │
│          │ 1       | zhangsan | 23        | 15680.50   │
│          │ ...                                          │
│          └──────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────┘
```

### 编辑器功能（已实现）

**语法高亮** - ✅ 已实现
- 关键字：蓝色加粗
- 字符串：橙色
- 数字：绿色
- 注释：灰色斜体
- 标识符：浅蓝色
- 使用 Monaco Editor 提供专业的语法高亮

**智能补全** - ✅ 已实现
- 表名、列名提示
- SQL 关键字建议
- 函数参数提示
- Monaco Editor 内置智能补全

**代码操作** - ✅ 已实现
- 格式化/美化
- 多标签页
- 查找替换
- 撤销/重做
- 代码折叠

**查询执行** - ✅ 已实现
- 执行当前语句（Ctrl/Cmd + Enter）
- 执行选中语句
- 执行全部
- 停止执行
- 执行计划（EXPLAIN）

**结果面板** - ✅ 已实现
- 数据网格展示（AG Grid）
- 多结果集支持
- 消息日志
- 执行计划可视化
- 查询历史记录

**工具栏增强** - ✅ 已实现
- 执行按钮（带阴影效果）
- 格式化按钮
- 保存按钮
- 执行计划按钮
- 查询历史按钮
- 深色/浅色主题适配

**视觉设计** - ✅ 已实现
- 工具栏分组设计（用分割线区分功能组）
- 执行按钮使用主色调 + 阴影效果
- 结果区域使用标签页（查询结果、消息、执行计划）
- 空状态使用图标 + 文字提示
- 深色/浅色主题完美适配

---

## 4. 连接配置对话框

### 界面布局

```
┌───────────────────────────────────────────────────┐
│          新建数据库连接                       ×   │
├───────────────────────────────────────────────────┤
│                                                   │
│  [🐬MySQL] [🐘PG] [◈达梦] [☀Oracle] ...          │
│                                                   │
│  [常规] [SSL] [SSH 隧道] [高级]                   │
│  ─────────────────────────────────────────────    │
│                                                   │
│  连接名称                                         │
│  [新 MySQL 连接___________________]                │
│                                                   │
│  主机地址                                         │
│  [Host] [localhost_______________]                │
│                                                   │
│  端口             用户名                          │
│  [Port] [3306]    [root_________]                │
│                                                   │
│  密码                                             │
│  [******_______] [显示] [复制]                    │
│                                                   │
│  初始数据库                                       │
│  [________________________] (可选)               │
│                                                   │
│  ☑ 保存密码（加密存储）                           │
│                                                   │
│  ⚙ 连接选项                                       │
│  ☐ 使用 SSH 隧道                                  │
│  ☐ 使用 SSL/TLS 加密连接                          │
│                                                   │
│  ┌─────────────────────────┐                      │
│  │ ○ 点击测试连接验证配置  │ [✓ 测试连接]        │
│  └─────────────────────────┘                      │
│                                                   │
│      [删除] [复制]        [取消] [保存连接]       │
└───────────────────────────────────────────────────┘
```

### 配置选项

#### 常规设置
- 连接名称
- 主机地址
- 端口号
- 用户名
- 密码
- 初始数据库

#### SSL 设置
- 启用 SSL
- 证书路径
- 密钥路径
- CA 证书

#### SSH 隧道
- 启用 SSH 隧道
- SSH 主机
- SSH 端口
- SSH 用户名
- 认证方式（密码/密钥）

#### 高级设置
- 连接超时
- 字符集
- 时区设置
- 自定义连接参数

---

## 5. ER 图设计器

### 界面布局

```
┌─────────────────────────────────────────────────────────┐
│  [ER 图设计器]                                     [×]  │
├─────────────────────────────────────────────────────────┤
│  [⊕新建表] [🔗关联] [💾保存] | [🔍缩放] [📐布局]      │
├──────────────┬──────────────────────────────────────────┤
│  表列表      │                                          │
│  (200px)     │        ER 图画布                          │
│              │                                          │
│  📋 users    │    ┌──────────┐       ┌──────────┐      │
│  📋 orders   │    │  users   │───────│ orders   │      │
│  📋 products │    │──────────│ 1   n │──────────│      │
│  📋 categories│    │ id (PK)  │       │ id (PK)  │      │
│              │    │ username │       │ user_id  │      │
│              │    │ email    │       │ total    │      │
│              │    └──────────┘       └──────────┘      │
│              │                                          │
│              │                                          │
├──────────────┴──────────────────────────────────────────┤
│  属性面板                                                │
│  表名: [users_____]  引擎: [InnoDB]                     │
│  ┌──────────────────────────────────────────────┐      │
│  │ 字段名    │ 类型     │ 长度  │ 约束  │ 备注  │      │
│  │ id       │ INT     │ 11   │ PK   │      │      │
│  │ username │ VARCHAR │ 50   │ NOT NULL │    │      │
│  └──────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────┘
```

### ER 图功能

**表设计**
- 可视化建表
- 字段编辑
- 索引管理
- 外键关联

**关系设计**
- 一对一关系
- 一对多关系
- 多对多关系
- 连线样式区分

**布局功能**
- 自动布局
- 对齐网格
- 缩放平移
- 导出图片

**同步功能**
- 同步到数据库
- 生成 SQL
- 导入现有表
- 版本对比

---

## 设计规范

### 颜色系统（已实现）

#### 主题色

| 颜色名称 | 色值 | 用途 |
|---------|------|------|
| Primary | `#1890ff` | 主要操作、强调元素 |
| Success | `#52c41a` | 成功状态、确认操作 |
| Warning | `#faad14` | 警告状态、注意事项 |
| Error | `#ff4d4f` | 错误状态、危险操作 |
| Info | `#1890ff` | 信息提示 |

#### 数据库类型配色

为不同数据库类型分配独特的品牌色，便于快速识别：

| 数据库类型 | 颜色 | 色值 | 图标 |
|-----------|------|------|------|
| MySQL | 蓝色 | `#1890ff` | DatabaseOutlined |
| PostgreSQL | 绿色 | `#52c41a` | ApiOutlined |
| SQLite | 橙色 | `#faad14` | FileTextOutlined |
| SQL Server | 粉色 | `#eb2f96` | CloudServerOutlined |
| Oracle | 橙红色 | `#fa8c16` | SunOutlined |
| MariaDB | 青色 | `#13c2c2` | ClusterOutlined |
| 达梦 DM | 紫色 | `#722ed1` | BlockOutlined |

#### 中性色

**浅色模式**

| 颜色名称 | 色值 | 用途 |
|---------|------|------|
| 主要文字 | `#0f0f0f` | 标题、重要文本 |
| 次要文字 | `#595959` | 正文、常规文本 |
| 辅助文字 | `#8c8c8c` | 说明、提示文本 |
| 禁用文字 | `#bfbfbf` | 禁用状态文本 |
| 边框色 | `#d9d9d9` | 边框、分割线 |
| 背景色 | `#f6f6f6` | 页面背景 |
| 卡片背景 | `#ffffff` | 卡片、面板背景 |
| 工具栏背景 | `#fafafa` | 工具栏、表头背景 |

**深色模式**

| 颜色名称 | 色值 | 用途 |
|---------|------|------|
| 主要文字 | `#f6f6f6` | 标题、重要文本 |
| 次要文字 | `#bfbfbf` | 正文、常规文本 |
| 辅助文字 | `#595959` | 说明、提示文本 |
| 禁用文字 | `#434343` | 禁用状态文本 |
| 边框色 | `#434343` | 边框、分割线 |
| 背景色 | `#2f2f2f` | 页面背景 |
| 卡片背景 | `#1f1f1f` | 卡片、面板背景 |
| 工具栏背景 | `#141414` | 工具栏、表头背景 |

### 字体规范（已实现）

#### 字体家族

```css
--font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
--font-family-code: 'JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', monospace;
```

#### 字体大小

| 名称 | 大小 | 行高 | 用途 |
|------|------|------|------|
| 基础 | 14px | 1.57 | 正文、常规文本 |
| 小号 | 12px | 1.5 | 辅助文本、标签 |
| 大号 | 16px | 1.5 | 小标题 |
| 超大 | 20px | 1.4 | 大标题 |

#### 字重

| 名称 | 值 | 用途 |
|------|-----|------|
| Normal | 400 | 常规文本 |
| Medium | 500 | 强调文本 |
| Semibold | 600 | 小标题 |
| Bold | 700 | 大标题 |

### 间距规范（已实现）

采用 4px 基础单位的间距系统：

| 名称 | 值 | 用途 |
|------|-----|------|
| xs | 4px | 极小间距 |
| sm | 8px | 小间距 |
| md | 12px | 中等间距 |
| lg | 16px | 大间距 |
| xl | 24px | 超大间距 |
| xxl | 32px | 特大间距 |

### 圆角规范（已实现）

| 名称 | 值 | 用途 |
|------|-----|------|
| sm | 4px | 小元素（标签、徽章） |
| md | 6px | 中等元素（按钮、输入框） |
| lg | 8px | 大元素（卡片、面板） |
| xl | 12px | 特大元素（对话框） |

### 阴影系统（已实现）

#### 浅色模式

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
--shadow-md: 0 2px 8px rgba(0, 0, 0, 0.1);
--shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.15);
```

#### 深色模式

```css
--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3);
--shadow-md: 0 2px 8px rgba(0, 0, 0, 0.4);
--shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.5);
```

### 交互反馈（已实现）

#### 过渡动画

```css
--transition-fast: 0.1s;
--transition-normal: 0.2s;
--transition-slow: 0.3s;
--transition-ease: cubic-bezier(0.645, 0.045, 0.355, 1);
```

#### 悬停效果

- 按钮：背景色加深，添加阴影
- 表格行：背景色变化
- 树节点：背景色变化
- 卡片：阴影增强

#### 焦点状态

```css
:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
```

#### 加载状态

- 按钮加载：显示加载图标 + 文字
- 页面加载：显示 Spin 组件
- 数据加载：显示骨架屏或加载提示

#### 状态反馈

**悬停（Hover）**
- 背景色变化
- 边框高亮
- 光标变化

**选中（Selected）**
- 蓝色背景高亮
- 文字颜色对比

**禁用（Disabled）**
- 透明度 50%
- 不可点击

**加载（Loading）**
- 旋转图标
- 进度条
- 骨架屏

---

## 响应式布局

### 断点系统

| 名称 | 宽度 | 用途 |
|------|------|------|
| xs | < 576px | 移动设备 |
| sm | ≥ 576px | 小屏设备 |
| md | ≥ 768px | 平板设备 |
| lg | ≥ 992px | 桌面设备 |
| xl | ≥ 1200px | 大屏设备 |
| xxl | ≥ 1600px | 超大屏设备 |

### 最小尺寸
- 窗口最小宽度：800px
- 窗口最小高度：600px

### 面板调整
- 左面板：可折叠（80px - 500px）
- 底面板：可调节高度（0px 折叠 - 400px）

### 自适应规则
- 窗口宽度 < 1000px：自动折叠左面板至图标模式
- 窗口宽度 < 800px：隐藏左侧面板
- 窗口高度 < 600px：自动折叠底面板

### 适配策略
- 侧边栏可折叠
- 面板可拖拽调整大小
- 工具栏按钮自动换行
- 标签页自动滚动

---

## 无障碍设计

### 颜色对比度
- 文本与背景对比度 ≥ 4.5:1
- 大文本与背景对比度 ≥ 3:1

### 键盘导航
- 所有交互元素可通过键盘访问
- Tab 键顺序合理
- 快捷键提示清晰

### 屏幕阅读器
- 使用语义化 HTML
- 添加 ARIA 标签
- 提供替代文本

---

## 快捷键设计

### 跨平台快捷键对照表

#### 修饰符映射

| 功能 | Windows/Linux | macOS |
|------|---------------|-------|
| 主修饰符 | Ctrl | Command (⌘) |
| 辅助修饰符 | Alt | Option (⌥) |
| 窗口管理键 | Alt | Control (⌃) |
| 菜单激活键 | Alt+F4 | Cmd+Q |

#### 全局快捷键
| 功能 | Windows/Linux | macOS |
|------|---------------|-------|
| 新建连接 | Ctrl+N | Cmd+N |
| 打开连接 | Ctrl+O | Cmd+O |
| 保存连接 | Ctrl+S | Cmd+S |
| 另存为 | Ctrl+Shift+S | Cmd+Shift+S |
| 导入 | Ctrl+I | Cmd+I |
| 导出 | Ctrl+E | Cmd+E |
| 打印 | Ctrl+P | Cmd+P |
| 偏好设置/选项 | Ctrl+, | Cmd+, |
| 撤销 | Ctrl+Z | Cmd+Z |
| 重做 | Ctrl+Y | Cmd+Shift+Z |
| 剪切 | Ctrl+X | Cmd+X |
| 复制 | Ctrl+C | Cmd+C |
| 粘贴 | Ctrl+V | Cmd+V |
| 删除 | Delete | Cmd+Delete |
| 全选 | Ctrl+A | Cmd+A |
| 查找 | Ctrl+F | Cmd+F |
| 刷新 | F5 | Cmd+R |
| 帮助 | F1 | Cmd+? |
| 退出 | Alt+F4 | Cmd+Q |

#### 编辑器快捷键
| 功能 | Windows/Linux | macOS |
|------|---------------|-------|
| 执行查询 | Ctrl+Enter | Cmd+Return |
| 新建查询 | Ctrl+Q | Cmd+Q |
| 连接所选 | Ctrl+Shift+C | Cmd+Shift+C |
| 替换 | Ctrl+H | Cmd+Option+F |
| 重命名 | F2 | Return |

#### 窗口和标签页
| 功能 | Windows/Linux | macOS |
|------|---------------|-------|
| 新建标签页 | Ctrl+T | Cmd+T |
| 关闭标签页 | Ctrl+W | Cmd+W |
| 下一标签页 | Ctrl+Tab | Ctrl+Tab |
| 上一标签页 | Ctrl+Shift+Tab | Ctrl+Shift+Tab |
| 切换到标签页 N | Ctrl+1-5 | Cmd+1-5 |
| 全屏切换 | F11 | Ctrl+Cmd+F |
| 放大 | Ctrl++ | Cmd++ |
| 缩小 | Ctrl+- | Cmd+- |
| 实际大小 | Ctrl+0 | Cmd+0 |

#### 窗口管理（Windows/Linux）
| 功能 | 快捷键 |
|------|--------|
| 最小化窗口 | Win+Down |
| 最大化窗口 | Win+Up |
| 左半屏 | Win+Left |
| 右半屏 | Win+Right |
| 关闭窗口 | Alt+F4 |

#### 窗口管理（macOS）
| 功能 | 快捷键 |
|------|--------|
| 最小化窗口 | Cmd+M |
| 隐藏窗口 | Cmd+H |
| 关闭窗口 | Cmd+W |
| 退出应用 | Cmd+Q |
| 左半屏 | Ctrl+Cmd+Left |
| 右半屏 | Ctrl+Cmd+Right |

### 快捷键实现建议

#### React (Tauri)
```typescript
import { register, unregisterAll } from '@tauri-apps/api/globalShortcut';

// 注册快捷键
async function registerShortcuts() {
  // 跨平台快捷键
  await register('CommandOrControl+N', () => {
    // 新建连接
    createNewConnection();
  });

  await register('CommandOrControl+S', () => {
    // 保存
    saveCurrentFile();
  });

  await register('CommandOrControl+Enter', () => {
    // 执行查询
    executeQuery();
  });
}

// 清理快捷键
async function cleanup() {
  await unregisterAll();
}
```

#### Vue3 (Electron)
```typescript
import { ipcRenderer } from 'electron';

// 注册快捷键
ipcRenderer.send('register-shortcut', 'CommandOrControl+N');
ipcRenderer.on('shortcut-pressed', (event, shortcut) => {
  if (shortcut === 'CommandOrControl+N') {
    createNewConnection();
  }
});
```

---

## 主题支持（已实现）

### 浅色主题（默认）

**配色方案**：
- 背景：`#f6f6f6`（浅灰色系）
- 文字：`#0f0f0f`（深灰色）
- 强调色：`#1890ff`（蓝色）
- 卡片背景：`#ffffff`（白色）
- 边框：`#d9d9d9`（浅灰边框）

**适用场景**：
- 白天使用
- 明亮环境
- 长时间阅读

### 深色主题（已实现）

**配色方案**：
- 背景：`#2f2f2f`（深灰色系）
- 文字：`#f6f6f6`（浅灰色）
- 强调色：`#1890ff`（亮蓝色）
- 卡片背景：`#1f1f1f`（深灰卡片）
- 边框：`#434343`（深灰边框）

**适用场景**：
- 夜间使用
- 暗光环境
- 减少眼睛疲劳

### 主题切换方式（已实现）

1. **工具栏切换**：点击工具栏的主题切换按钮（🌙/☀️）
2. **设置切换**：在设置页面选择主题
3. **快捷键切换**：支持快捷键快速切换
4. **跟随系统**：自动跟随系统主题设置

### 实现方式

使用 CSS 变量 + data-theme 属性：

```html
<html data-theme="light">
  <!-- 浅色主题 -->
</html>

<html data-theme="dark">
  <!-- 深色主题 -->
</html>
```

### 切换逻辑

1. 用户点击主题切换按钮
2. 触发 `toggle-theme` 事件
3. 更新 `data-theme` 属性
4. CSS 变量自动应用新主题
5. 保存用户偏好到本地存储

---

## 已实现组件清单

### 核心组件

| 组件名称 | 文件路径 | 状态 | 说明 |
|---------|---------|------|------|
| 主布局 | [MainLayout.tsx](file:///Users/itophua/AI/AiProjects/i-dblink/src/components/MainLayout.tsx) | ✅ 已实现 | 双栏布局、连接树、对象树 |
| SQL 编辑器 | [SQLEditor.tsx](file:///Users/itophua/AI/AiProjects/i-dblink/src/components/SQLEditor.tsx) | ✅ 已实现 | Monaco Editor、工具栏、结果展示 |
| 数据表格 | [DataTable.tsx](file:///Users/itophua/AI/AiProjects/i-dblink/src/components/DataTable.tsx) | ✅ 已实现 | AG Grid、数据编辑、导出 |
| 应用入口 | [App.tsx](file:///Users/itophua/AI/AiProjects/i-dblink/src/App.tsx) | ✅ 已实现 | 主题配置、全局状态 |

### 设计文档

| 文档名称 | 文件路径 | 状态 | 说明 |
|---------|---------|------|------|
| 设计系统 | [UI-DESIGN-SYSTEM.md](file:///Users/itophua/AI/AiProjects/i-dblink/doc/UI-DESIGN-SYSTEM.md) | ✅ 已完成 | 完整的设计系统文档 |
| UI 设计 | [02-ui-design.md](file:///Users/itophua/AI/AiProjects/i-dblink/doc/02-ui-design.md) | ✅ 已更新 | 详细的 UI 设计文档 |

### 技术栈

- **前端框架**：Tauri v2 + React + TypeScript
- **UI 组件库**：Ant Design 5.x
- **SQL 编辑器**：Monaco Editor
- **数据表格**：AG Grid
- **状态管理**：Zustand
- **图标库**：Ant Design Icons

---

## 更新日志

### v1.0.0 (2024-01-XX)

**新增功能**：
- ✅ 完成主界面布局设计（双栏布局）
- ✅ 完成连接树组件设计（支持分组、对象树）
- ✅ 完成 SQL 编辑器组件设计（Monaco Editor）
- ✅ 完成数据表格组件设计（AG Grid）
- ✅ 完成深色/浅色主题适配
- ✅ 完成设计系统文档

**优化改进**：
- ✅ 将三栏布局优化为双栏布局，提升操作效率
- ✅ 连接树和对象树合并，减少界面复杂度
- ✅ 增强工具栏功能，添加主题切换
- ✅ 改进视觉设计，添加阴影和过渡效果

**技术实现**：
- ✅ 使用 Ant Design 组件库
- ✅ 集成 Monaco Editor 编辑器
- ✅ 集成 AG Grid 数据表格
- ✅ 实现深色/浅色主题切换

---

## 贡献指南

如果您对 UI 设计有任何建议或改进意见，欢迎：

1. 提交 Issue 描述问题或建议
2. 提交 Pull Request 贡献代码
3. 参与设计讨论

---

## 许可证

本设计系统遵循 MIT 许可证。
