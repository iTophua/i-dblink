# Navicat Premium 交互深度分析与模仿方案

## 一、Navicat Premium 页面结构解析

### 1.1 整体布局

```
┌─────────────────────────────────────────────────────────────────┐
│  菜单栏 (Menu Bar)                                               │
├─────────────────────────────────────────────────────────────────┤
│  工具栏 (Toolbar) - 快捷操作按钮                                  │
├──────────┬──────────────────────────────────────────────────────┤
│          │  对象标签页 (Object Tabs) - 可选显示                   │
│  左侧    ├──────────────────────────────────────────────────────┤
│  连接    │  工作区标签页 (Workspace Tabs)                        │
│  树      │  ┌────────────────────────────────────────────────┐  │
│  (Tree)  │  │  内容标签 (Content Tab)                          │  │
│          │  │  ┌──────────────────────────────────────────┐  │  │
│          │  │  │  对象详情 / 数据表格 / SQL编辑器          │  │  │
│          │  │  │  / 设计视图 / 模型视图                    │  │  │
│          │  │  └──────────────────────────────────────────┘  │  │
│          │  └────────────────────────────────────────────────┘  │
│          ├──────────────────────────────────────────────────────┤
│          │  信息面板 (Info Panel) - 可选显示                     │
│          │  ┌────────────────────────────────────────────────┐  │
│          │  │  日志 / 输出 / 注释                              │  │
│          │  └────────────────────────────────────────────────┘  │
├──────────┴──────────────────────────────────────────────────────┤
│  状态栏 (Status Bar)                                             │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 左侧连接树层级结构

Navicat 的连接树采用**多层级嵌套**结构：

```
📁 分组名称 (N)                          ← 一级分组
  🔗 连接名称 (MySQL)                     ← 二级连接
    📊 数据库名                           ← 三级数据库
      📋 表 (N)                          ← 四级对象类型分组
        📄 表名1                          ← 五级具体表
        📄 表名2
        📄 表名3
      👁️ 视图 (N)                         ← 四级对象类型分组
        👁️ 视图名1
        👁️ 视图名2
      ⚡ 函数 (N)                         ← 四级对象类型分组
      📝 存储过程 (N)
      🔔 触发器 (N)
      📅 事件 (N)
  🔗 连接名称 (PostgreSQL)
    📊 数据库名
      📋 表 (N)
        📄 表名1
        📄 表名2
      🔍 查询 (N)
      👁️ 视图 (N)
      📝 函数 (N)
📁 另一个分组
  🔗 连接名称 (SQLite)
    📋 表 (N)                            ← SQLite 无数据库层级
      📄 表名1
```

### 1.3 右侧工作区标签页类型

Navicat 支持**多种标签页类型**，可以同时打开多个：

| 标签类型 | 触发方式 | 内容 |
|---------|---------|------|
| **对象列表** | 点击连接/数据库 | 显示该层级下的所有对象（表、视图等） |
| **数据表浏览** | 双击表名 | 表格形式显示数据，支持 CRUD 操作 |
| **表设计器** | 右键→设计表 | 可视化编辑表结构、字段、索引、外键 |
| **SQL 编辑器** | 点击工具栏"查询" | 编写和执行 SQL，显示结果集 |
| **模型视图** | 右键→逆向模型 | ER 图显示表结构和关系 |
| **表单视图** | 右键→打开表（表单） | 表单形式显示单条数据 |

### 1.4 核心交互逻辑

#### 1.4.1 左侧树交互

| 操作 | 行为 | 反馈 |
|------|------|------|
| **单击连接** | 选中连接 | 右侧显示该连接的对象列表（表、视图等） |
| **双击连接** | 展开/折叠 | 自动连接数据库，展开显示数据库列表 |
| **单击数据库** | 选中数据库 | 右侧显示该数据库下的表列表 |
| **双击数据库** | 展开/折叠 | 加载并显示表、视图等子项 |
| **单击表** | 选中表 | 右侧显示表结构（列、索引等） |
| **双击表** | 打开数据浏览 | 新标签页打开表格数据编辑器 |
| **右键连接** | 上下文菜单 | 显示操作菜单（打开、编辑、删除、查询等） |
| **右键表** | 上下文菜单 | 显示操作菜单（打开、设计、截断、删除等） |
| **拖拽连接** | 调整顺序 | 调整连接在树中的位置 |
| **搜索框** | 输入关键字 | 实时过滤树节点，高亮匹配项 |

#### 1.4.2 右侧内容区交互

| 操作 | 行为 | 反馈 |
|------|------|------|
| **点击标签** | 切换活动标签 | 显示对应内容 |
| **关闭标签** | 点击 × 按钮 | 关闭标签，如有未保存更改会提示 |
| **拖拽标签** | 调整标签顺序 | 重新排列标签页 |
| **双击标签** | 弹出/还原 | 将标签弹出为独立窗口（Navicat 特有） |
| **右键标签** | 上下文菜单 | 关闭其他、关闭右侧全部等 |
| **Ctrl+T** | 新建 SQL 查询 | 新建查询标签 |
| **Ctrl+W** | 关闭当前标签 | 关闭当前活动标签 |

#### 1.4.3 标签页工具栏

每个标签页顶部都有**快捷工具栏**：

```
┌─────────────────────────────────────────────────────────┐
│ 📄 表名 (数据库)                                          │
├─────────────────────────────────────────────────────────┤
│ [刷新] [过滤] [排序] [导出] [打印] [┇ 更多]               │
├─────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────┐   │
│ │  数据表格 / 表单 / 结构图                           │   │
│ └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 二、当前应用现状分析

### 2.1 已实现的功能

| 功能 | 状态 | 位置 |
|------|------|------|
| **连接树渲染** | ✅ 已实现 | `src/components/ConnectionTree/index.tsx` (1147 行) |
| **分组管理** | ✅ 已实现 | 支持新建/编辑/删除分组 |
| **懒加载数据** | ✅ 已实现 | 展开连接→加载数据库，展开数据库→加载表 |
| **表结构查看** | ✅ 已实现 | `src/components/TableStructure.tsx` |
| **数据表格浏览** | ✅ 已实现 | `src/components/DataTable.tsx` |
| **SQL 编辑器** | ✅ 已实现 | `src/components/SQLEditor.tsx` (Monaco Editor) |
| **多标签页** | ✅ 已实现 | `src/components/TabPanel/index.tsx` |
| **右键菜单** | ✅ 已实现 | 连接、分组、数据库、表、视图右键菜单 |
| **搜索过滤** | ✅ 已实现 | 带 300ms 防抖 |
| **状态栏** | ✅ 已实现 | `src/components/StatusBar/` |
| **日志面板** | ✅ 已实现 | `src/components/LogPanel.tsx` |

### 2.2 与 Navicat 的差距

| Navicat 特性 | 当前状态 | 优先级 |
|-------------|---------|-------|
| **双击表打开数据浏览** | ✅ 已实现 | - |
| **单击表显示结构** | ✅ 已实现 | - |
| **表设计器** | ❌ 未实现 | 🔴 高 |
| **标签页拖拽排序** | ❌ 未实现 | 🟡 中 |
| **标签页右键菜单** | ❌ 未实现 | 🟡 中 |
| **面包屑导航** | ⚠️ 基础实现 | 🟡 中 |
| **对象图标区分类型** | ⚠️ 基础实现 | 🟢 低 |
| **多结果集显示** | ❌ 未实现 | 🔴 高 |
| **数据表格 CRUD** | ⚠️ 基础实现 | 🔴 高 |
| **SQL 执行历史** | ❌ 未实现 | 🟡 中 |
| **标签页独立窗口** | ❌ 未实现 | 🟢 低 |
| **树节点拖拽** | ❌ 未实现 | 🟡 中 |
| **树节点计数显示** | ✅ 已实现 | - |
| **收藏夹/常用连接** | ❌ 未实现 | 🟢 低 |

---

## 三、模仿 Navicat 的交互改进方案

### 3.1 高优先级改进

#### 3.1.1 表设计器 (Table Designer)

**目标**: 模仿 Navicat 的设计表功能，提供可视化表编辑

**交互流程**:
```
右键表 → 设计表 → 打开表设计器标签页
├── 字段页签 (Columns)
│   ├── 表格形式编辑字段
│   ├── 支持添加/删除/拖拽排序字段
│   └── 实时预览 SQL
├── 外键页签 (Foreign Keys)
│   ├── 可视化配置外键关系
│   └── 级联操作设置
├── 索引页签 (Indexes)
│   ├── 添加/删除索引
│   └── 配置复合索引
└── SQL 预览页签
    └── 显示生成的 CREATE TABLE 语句
```

**实现方案**:
```typescript
// 新文件: src/components/TableDesigner/index.tsx
interface TableDesignerProps {
  connectionId: string;
  tableName: string;
  database?: string;
  onSave: (sql: string) => void;
}

// 页签结构
const tabItems = [
  { key: 'columns', label: '字段', children: <ColumnsEditor /> },
  { key: 'indexes', label: '索引', children: <IndexesEditor /> },
  { key: 'foreignKeys', label: '外键', children: <ForeignKeysEditor /> },
  { key: 'sql', label: 'SQL 预览', children: <SqlPreview /> },
];
```

#### 3.1.2 多结果集显示

**目标**: 模仿 Navicat 执行多条 SQL 时显示多个结果集

**交互流程**:
```
SQL 编辑器输入:
  SELECT * FROM users;
  SELECT COUNT(*) FROM orders;

执行后 → 结果区显示多个标签页:
  [结果 1 (12 行)] [结果 2 (1 行)] [消息]
```

**实现方案**:
```typescript
// SQLEditor.tsx 改进
interface QueryResult {
  index: number;
  columns: string[];
  rows: any[][];
  rowsAffected?: number;
  executionTime: number;
  error?: string;
}

// 结果区多标签显示
{results.length > 1 && (
  <Tabs type="card">
    {results.map((r, i) => (
      <Tabs.TabPane 
        key={i} 
        tab={`结果 ${i + 1} (${r.rowsAffected || r.rows.length} 行)`}
      >
        <DataTable data={r} />
      </Tabs.TabPane>
    ))}
  </Tabs>
)}
```

#### 3.1.3 数据表格 CRUD 增强

**目标**: 模仿 Navicat 的数据编辑功能

**交互特性**:
- 双击单元格编辑
- 行级新增/删除
- 撤销/重做
- 应用更改按钮
- 数据验证提示

**实现方案**:
```typescript
// DataTable.tsx 增强
interface DataTableProps {
  editable?: boolean;
  onRowAdd?: (data: Record<string, any>) => void;
  onRowUpdate?: (oldData: Record<string, any>, newData: Record<string, any>) => void;
  onRowDelete?: (data: Record<string, any>) => void;
  onApply?: () => void;     // 应用所有更改
  onDiscard?: () => void;   // 丢弃所有更改
}

// 工具栏按钮
const toolbar = (
  <Space>
    <Button icon={<PlusOutlined />} onClick={handleAdd}>新增</Button>
    <Button icon={<DeleteOutlined />} onClick={handleDelete}>删除</Button>
    <Button icon={<UndoOutlined />} onClick={handleDiscard}>撤销</Button>
    <Button type="primary" icon={<CheckOutlined />} onClick={handleApply}>
      应用更改
    </Button>
  </Space>
);
```

### 3.2 中优先级改进

#### 3.2.1 标签页右键菜单

**实现**:
```typescript
// TabPanel/index.tsx 增强
const handleTabContextMenu = (e: React.MouseEvent, tabKey: string) => {
  e.preventDefault();
  setContextMenuVisible(true);
  setContextMenuPosition({ x: e.clientX, y: e.clientY });
  setContextMenuTabKey(tabKey);
};

const menuItems = [
  { key: 'close', label: '关闭' },
  { key: 'closeOthers', label: '关闭其他' },
  { key: 'closeRight', label: '关闭右侧' },
  { key: 'closeAll', label: '关闭全部' },
  { type: 'divider' },
  { key: 'clone', label: '克隆标签' },
  { key: 'newWindow', label: '在新窗口打开' },
];
```

#### 3.2.2 面包屑导航增强

**当前问题**: 仅在选中表时显示，且不支持点击导航

**改进方案**:
```typescript
// 始终显示面包，支持点击导航
<Breadcrumb>
  <Breadcrumb.Item onClick={() => navigateHome()}>
    <HomeOutlined /> 首页
  </Breadcrumb.Item>
  {selectedConnectionId && (
    <Breadcrumb.Item onClick={() => selectConnection()}>
      {connectionName}
    </Breadcrumb.Item>
  )}
  {selectedDatabase && (
    <Breadcrumb.Item onClick={() => selectDatabase()}>
      {selectedDatabase}
    </Breadcrumb.Item>
  )}
  {selectedTable && (
    <Breadcrumb.Item>{selectedTable}</Breadcrumb.Item>
  )}
</Breadcrumb>
```

#### 3.2.3 SQL 执行历史

**实现**:
```typescript
// 新增 SQL 历史记录
interface SqlHistoryItem {
  id: string;
  sql: string;
  connectionId: string;
  database?: string;
  executedAt: Date;
  duration: number;
  success: boolean;
}

// SQLEditor 添加历史记录面板
const historyPanel = (
  <List
    dataSource={sqlHistory}
    renderItem={(item) => (
      <List.Item 
        onClick={() => loadSql(item.sql)}
        style={{ cursor: 'pointer' }}
      >
        <List.Item.Meta
          title={item.sql.substring(0, 50)}
          description={`${item.executedAt.toLocaleString()} (${item.duration}ms)`}
        />
      </List.Item>
    )}
  />
);
```

#### 3.2.4 树节点拖拽

**实现**:
```typescript
// ConnectionTree/index.tsx 使用 Ant Design Tree 的 draggable
<Tree
  draggable={{
    icon: (node) => <DragOutlined />,
    handleDrag: (info) => {
      const { dragNode, node, dropPosition } = info;
      // 处理拖拽逻辑
      // - 连接 → 分组: 移动连接到新分组
      // - 表 → 表: 不支持
    }
  }}
/>
```

### 3.3 低优先级改进

#### 3.3.1 标签页独立窗口 (Tauri 多窗口)

**实现方案** (需要 Tauri 支持):
```rust
// src-tauri/src/commands.rs
#[tauri::command]
async fn open_new_window(
    app: AppHandle,
    tab_type: String,
    tab_data: serde_json::Value,
) -> Result<(), String> {
    let window = WindowBuilder::new(
        &app,
        format!("tab-{}", uuid::Uuid::new_v4()),
        WindowUrl::App(format!("/tab/{}?data={}", tab_type, tab_data))
    )
    .title("新标签页")
    .inner_size(1200.0, 800.0)
    .build()?;
    Ok(())
}
```

#### 3.3.2 收藏夹/常用连接

**实现**:
```typescript
// 添加星标功能
interface Connection {
  // ... 现有字段
  isFavorite?: boolean;
}

// 连接树顶部显示收藏夹
{favoriteConnections.length > 0 && (
  <div className="favorites-section">
    <div className="section-title">⭐ 收藏的连接</div>
    {favoriteConnections.map(conn => <ConnectionNode key={conn.id} />)}
  </div>
)}
```

---

## 四、实施路线图

### Phase 1: 核心功能增强 (1-2 周)

| 任务 | 文件 | 复杂度 |
|------|------|-------|
| 表设计器 - 字段编辑 | `src/components/TableDesigner/index.tsx` | 高 |
| 表设计器 - 索引/外键 | `src/components/TableDesigner/IndexesEditor.tsx` | 中 |
| 表设计器 - SQL 预览 | `src/components/TableDesigner/SqlPreview.tsx` | 低 |
| 数据表格 CRUD | `src/components/DataTable.tsx` 增强 | 高 |
| 后端 - 表结构修改 | `src-tauri/src/commands.rs` 新增命令 | 高 |

### Phase 2: 交互体验优化 (1 周)

| 任务 | 文件 | 复杂度 |
|------|------|-------|
| 标签页右键菜单 | `src/components/TabPanel/index.tsx` | 低 |
| 面包屑导航增强 | `src/components/TabPanel/index.tsx` | 低 |
| SQL 多结果集 | `src/components/SQLEditor.tsx` | 中 |
| SQL 执行历史 | `src/components/SQLEditor/HistoryPanel.tsx` | 中 |

### Phase 3: 高级特性 (后续迭代)

| 任务 | 文件 | 复杂度 |
|------|------|-------|
| 树节点拖拽 | `src/components/ConnectionTree/index.tsx` | 中 |
| 标签页独立窗口 | `src-tauri/src/` 多窗口支持 | 高 |
| 收藏夹功能 | `src/stores/appStore.ts` | 低 |
| ER 图可视化 | `src/components/ERDiagram/` | 高 |

---

## 五、关键技术细节

### 5.1 树节点 Key 命名规范扩展

当前规范已满足需求，无需大改：

```
group-{groupId}                    → 分组节点
{connectionId}                     → 连接节点
db::{connectionId}::{database}     → 数据库节点
tables::{connectionId}::{database} → 表分组节点
table::{connectionId}::{database}::{tableName}  → 具体表节点
columns::{tableKey}                → 列分组
indexes::{tableKey}                → 索引分组
foreignKeys::{tableKey}            → 外键分组 (新增)
```

### 5.2 标签页状态管理

**建议**: 将 TabPanel 的状态提升至全局 store，支持跨组件访问

```typescript
// src/stores/tabStore.ts
interface TabState {
  tabs: TabInfo[];
  activeTabKey: string;
  addTab: (tab: TabInfo) => void;
  removeTab: (key: string) => void;
  setActiveTab: (key: string) => void;
}

interface TabInfo {
  key: string;
  type: 'objects' | 'data' | 'sql' | 'design' | 'model';
  title: string;
  data: Record<string, any>;
  closable: boolean;
  dirty?: boolean;  // 是否有未保存更改
}
```

### 5.3 快捷键映射

参考 Navicat 的快捷键：

| 快捷键 | 功能 | 平台 |
|--------|------|------|
| `Ctrl/Cmd + N` | 新建连接 | 全局 |
| `Ctrl/Cmd + Q` | 新建查询 | 全局 |
| `Ctrl/Cmd + T` | 新建查询 | 全局 |
| `Ctrl/Cmd + W` | 关闭当前标签 | 全局 |
| `Ctrl/Cmd + Shift + W` | 关闭全部标签 | 全局 |
| `Ctrl/Cmd + D` | 复制当前行 | 编辑器 |
| `Ctrl/Cmd + /` | 注释/取消注释 | 编辑器 |
| `F5` | 执行 SQL | 编辑器 |
| `Ctrl/Cmd + S` | 保存更改 | 数据表格/设计器 |
| `Ctrl/Cmd + Z` | 撤销 | 数据表格 |
| `Ctrl/Cmd + Y` | 重做 | 数据表格 |
| `Delete` | 删除选中行 | 数据表格 |
| `Ctrl/Cmd + F` | 查找/过滤 | 数据表格 |

---

## 六、UI 设计建议

### 6.1 图标系统

使用 Ant Design Icons，保持图标语义一致：

| 对象 | 图标 | 用途 |
|------|------|------|
| 分组 | `FolderOutlined` / `FolderOpenOutlined` | 树节点分组 |
| 连接 | `CloudServerOutlined` | 树节点连接 |
| 数据库 | `DatabaseOutlined` | 树节点数据库 |
| 表 | `TableOutlined` | 树节点表 |
| 视图 | `EyeOutlined` | 树节点视图 |
| 列 | `ColumnWidthOutlined` | 树节点列 |
| 索引 | `ThunderboltOutlined` | 树节点索引 |
| 外键 | `LinkOutlined` | 树节点外键 |
| 函数 | `FunctionOutlined` | 树节点函数 |
| 存储过程 | `ProcedureOutlined` | 树节点存储过程 |
| 数据浏览 | `AppstoreOutlined` | 标签页数据 |
| SQL 编辑器 | `CodeOutlined` | 标签页SQL |
| 表设计器 | `BuildOutlined` | 标签页设计器 |
| ER 图 | `DeploymentUnitOutlined` | 标签页ER图 |

### 6.2 颜色规范

| 场景 | 亮色模式 | 暗色模式 |
|------|---------|---------|
| 左侧树背景 | `#fff` | `#1f1f1f` |
| 右侧内容区背景 | `#fafafa` | `#141414` |
| 选中行背景 | `#e6f4ff` | `#111a2c` |
| 悬停行背景 | `#f5f5f5` | `#1f1f1f` |
| 分割线颜色 | `#e8e8e8` | `#303030` |
| 主色调 | `#1890ff` | `#177ddc` |
| 成功色调 | `#52c41a` | `#49aa19` |
| 警告色调 | `#faad14` | `#d89614` |
| 错误色调 | `#ff4d4f` | `#a61d24` |

---

## 七、总结

### 当前应用优势
1. ✅ 基础架构良好，组件分离清晰
2. ✅ 懒加载机制实现完善
3. ✅ 多标签页基础功能已实现
4. ✅ 类型系统完整

### 核心改进方向
1. 🔴 **表设计器** - 最接近 Navicat 体验的差距
2. 🔴 **数据表格 CRUD** - 提升数据编辑体验
3. 🟡 **标签页交互** - 右键菜单、拖拽排序
4. 🟡 **SQL 多结果集** - 支持批量执行
5. 🟢 **高级特性** - 独立窗口、ER 图等

### 建议优先级
**立即开始**: Phase 1 (表设计器 + 数据表格 CRUD)
**下一迭代**: Phase 2 (交互体验优化)
**后续规划**: Phase 3 (高级特性)
