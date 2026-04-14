# 右侧内容区交互对比分析

## 一、Navicat Premium 右侧内容区交互规范

### 1.1 标签页体系

Navicat 的右侧工作区采用**多标签页架构**，包含以下标签类型：

| 标签类型 | 触发方式 | 显示内容 | 可关闭 |
|---------|---------|---------|--------|
| **对象浏览器** | 单击连接/数据库 | 树形或列表显示对象 | ❌ 不可关闭 |
| **数据表浏览** | 双击表名 | 表格显示数据 | ✅ 可关闭 |
| **表设计器** | 右键→设计表 | 可视化编辑表结构 | ✅ 可关闭 |
| **SQL 编辑器** | 点击查询按钮 | 编写执行 SQL | ✅ 可关闭 |
| **视图编辑器** | 双击视图名 | 编辑视图定义 | ✅ 可关闭 |
| **模型视图** | 右键→逆向模型 | ER 图显示关系 | ✅ 可关闭 |
| **表单视图** | 右键→表单视图 | 单条数据表单 | ✅ 可关闭 |

### 1.2 标签页交互规则

#### 1.2.1 标签页打开逻辑

| 操作 | 行为 | Navicat 表现 |
|------|------|-------------|
| 双击表 | 打开数据浏览 | 新标签，标题为表名，自动聚焦 |
| 双击已打开的表 | 切换到已有标签 | **不重复打开**，直接切换焦点 |
| 右键→设计表 | 打开设计器 | 新标签，标题"设计表: 表名" |
| 右键→打开视图 | 打开视图数据 | 新标签，标题为视图名 |
| 点击新建查询 | 打开 SQL 编辑器 | 新标签，标题"查询 1/2/3..." |

#### 1.2.2 标签页关闭逻辑

| 操作 | 行为 |
|------|------|
| 点击 × 关闭 | 关闭当前标签 |
| 关闭有未保存更改的标签 | 弹出确认对话框 |
| 右键标签 | 显示菜单：关闭、关闭其他、关闭右侧、全部关闭 |
| 关闭最后一个数据浏览标签 | 回到对象浏览器 |

### 1.3 数据表浏览交互

#### 1.3.1 数据浏览视图

```
┌─────────────────────────────────────────────────────────┐
│ 📄 users (my_database)                                   │
├─────────────────────────────────────────────────────────┤
│ [+ 新增] [编辑] [删除] [刷新] [导出] [打印] [┇ 更多]      │
├─────────────────────────────────────────────────────────┤
│ ☐ │ id  │ username │ email        │ created_at         │
│ ├───┼─────┼──────────┼──────────────┼────────────────────┤
│ ☑ │ 1   │ admin    │ admin@xx.com │ 2024-01-01 12:00   │
│ ☐ │ 2   │ user1    │ user@xx.com  │ 2024-01-02 12:00   │
│ ☐ │ 3   │ user2    │ user2@xx.com │ 2024-01-03 12:00   │
├─────────────────────────────────────────────────────────┤
│ [应用更改] [撤销] [刷新]  │  第 1-50 行，共 1234 行  │ [◀][▶] │
└─────────────────────────────────────────────────────────┘
```

**交互特性**:
- ✅ 单击单元格编辑（内联编辑）
- ✅ Ctrl+C/V 复制粘贴单元格
- ✅ 行选择（单选/多选）
- ✅ 筛选和排序
- ✅ 分页加载（默认 50/100/500 行）
- ✅ 未保存更改提示（标签显示 * 号）
- ✅ 提交/撤销按钮
- ✅ NULL 值显示为灰色斜体

#### 1.3.2 数据编辑交互

| 操作 | Navicat 行为 | 说明 |
|------|-------------|------|
| 双击单元格 | 进入编辑模式 | 文本框/日期选择器/下拉框 |
| 单击其他单元格 | 退出编辑，选中新单元格 | 自动保存上一个单元格 |
| Ctrl+S | 保存所有更改 | 弹出确认/错误提示 |
| Ctrl+Z | 撤销更改 | 恢复到上次保存的状态 |
| Delete 键 | 删除选中行 | 标记删除，需提交 |
| 右键行号 | 行操作菜单 | 新增、删除、复制行 |

### 1.4 表结构查看交互

#### 1.4.1 单击表时的显示内容

Navicat 单击表节点时，右侧显示**表信息面板**：

```
┌─────────────────────────────────────────────────────────┐
│ 📄 users                                                 │
├─────────────────────────────────────────────────────────┤
│ [信息] [列] [索引] [外键] [触发器] [SQL 预览]             │
├─────────────────────────────────────────────────────────┤
│ ● 信息页签                                               │
│   - 表名、引擎、排序规则、行数、数据大小、索引大小等      │
│                                                         │
│ ● 列页签                                                │
│   - 表格显示所有列：名、类型、可空、默认值、注释等        │
│                                                         │
│ ● 索引页签                                              │
│   - 表格显示索引：索引名、类型、列、唯一、主键等          │
│                                                         │
│ ● 外键页签                                              │
│   - 表格显示外键关系：约束名、列、引用表、引用列等        │
└─────────────────────────────────────────────────────────┘
```

### 1.5 SQL 编辑器交互

```
┌─────────────────────────────────────────────────────────┐
│ 💻 查询 1                                                │
├─────────────────────────────────────────────────────────┤
│ [运行] [停止] [解释] [格式化] [保存] [┇ 更多]             │
├─────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────┐   │
│ │ SELECT * FROM users                               │   │
│ │ WHERE status = 'active'                           │   │
│ │ ORDER BY created_at DESC;                         │   │
│ └───────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│ [结果 1 (23 行) 0.05s] [结果 2 (1 行) 0.02s] [消息]      │
├─────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────┐   │
│ │ id │ username │ email        │ created_at         │   │
│ │────┼──────────┼──────────────┼────────────────────│   │
│ │ 1  │ admin    │ admin@xx.com │ 2024-01-01 12:00   │   │
│ └───────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

**交互特性**:
- ✅ 语法高亮
- ✅ 代码补全（Ctrl+Space）
- ✅ 多语句执行（分号分隔）
- ✅ 多结果集显示（标签页）
- ✅ 执行计划
- ✅ SQL 格式化
- ✅ 保存/加载 SQL 文件

---

## 二、当前应用右侧内容区实现分析

### 2.1 标签页实现 (TabPanel/index.tsx)

#### 当前标签类型

| 标签类型 | 实现状态 | 标签 Key | 可关闭 |
|---------|---------|---------|--------|
| **对象浏览器** | ✅ 已实现 | `objects` | ❌ 不可关闭 |
| **数据表浏览** | ✅ 已实现 | `{table}@{db}-data` | ✅ 可关闭 |
| **SQL 编辑器** | ✅ 已实现 | `sql-{timestamp}` | ✅ 可关闭 |
| **表设计器** | ❌ 未实现 | - | - |
| **视图浏览** | ❌ 未实现 | - | - |

#### 标签页打开逻辑

```typescript
// 当前实现 (openTableTab 函数)
const openTableTab = useCallback(
  (tableName: string, database?: string) => {
    // ✅ 检查是否已存在，防止重复打开
    const exists = openedTables.find(
      (t) =>
        t.name === tableName && 
        t.connectionId === selectedConnectionId && 
        t.database === database
    );
    
    if (!exists) {
      // ✅ 不存在则添加
      setOpenedTables((prev) => [
        ...prev,
        { name: tableName, connectionId: selectedConnectionId, database },
      ]);
    }
    // ✅ 激活标签
    setActiveKey(dataTabKey);
  },
  [selectedConnectionId, openedTables]
);
```

**评估**: ✅ 与 Navicat 一致，防止重复打开

#### 标签页关闭逻辑

```typescript
// 当前实现 (handleTabEdit 函数)
const handleTabEdit = useCallback(
  (targetKey, action: 'add' | 'remove') => {
    if (action === 'add') {
      // ✅ 新增 SQL 查询 Tab
      const newSqlKey = `sql-${Date.now()}`;
      setOpenedSqlTabs((prev) => [...prev, { key: newSqlKey, title: 'SQL 查询' }]);
      setActiveKey(newSqlKey);
    } else if (action === 'remove') {
      // ✅ 关闭数据浏览或 SQL Tab
      // 关闭后自动回到 objects 标签
      if (activeKey === key) {
        setActiveKey('objects');
      }
    }
  },
  [activeKey]
);
```

**缺失功能**:
- ❌ 未保存更改确认对话框
- ❌ 右键菜单（关闭其他、关闭右侧、全部关闭）
- ❌ 标签拖拽排序

### 2.2 对象浏览器实现 (objects 标签)

#### 当前内容切换逻辑

```typescript
// 当前实现
{selectedConnectionId ? (
  selectedTable ? (
    // 单击表 → 展示表结构
    <TableStructure
      connectionId={selectedConnectionId}
      tableName={selectedTable}
      database={selectedDatabase}
    />
  ) : (
    // 未选表 → 显示表列表
    <TableList
      connectionId={selectedConnectionId}
      database={selectedDatabase}
      onTableSelect={(tableName, db) => {
        // 单击表 → 在对象浏览器内显示结构
      }}
      onTableOpen={openTableTab}  // 双击表 → 打开新标签
    />
  )
) : (
  <Empty description="请从左侧选择一个连接" />
)}
```

**评估**:
- ✅ 单击表 → 显示表结构（符合 Navicat）
- ✅ 未选表 → 显示表列表（符合 Navicat）
- ✅ 表列表支持双击打开数据浏览（符合 Navicat）

### 2.3 表结构查看实现 (TableStructure.tsx)

#### 当前实现

```typescript
<Tabs size="small" items={[
  { key: 'columns', label: `列 (${columns.length})`, children: <Table /> },
  { key: 'indexes', label: `索引 (${indexes.length})`, children: <Table /> },
  { key: 'foreign_keys', label: `外键 (${foreignKeys.length})`, children: <Table /> },
]}/>
```

**与 Navicat 对比**:

| 功能 | Navicat | 当前应用 | 状态 |
|------|---------|---------|------|
| 列信息 | ✅ 显示 | ✅ 显示 | ✅ 一致 |
| 索引信息 | ✅ 显示 | ✅ 显示 | ✅ 一致 |
| 外键信息 | ✅ 显示 | ✅ 显示 | ✅ 一致 |
| 表信息概览 | ✅ 显示 | ❌ 未实现 | 🟡 缺失 |
| SQL 预览 | ✅ 显示 | ❌ 未实现 | 🟡 缺失 |
| 触发器信息 | ✅ 显示 | ❌ 未实现 | 🟢 可选 |

**当前表结构页签内容**:

| 页签 | 显示内容 | 列定义 |
|------|---------|-------|
| 列 | 列名、类型、可空、默认值、键、注释 | ✅ 完善 |
| 索引 | 索引名、列名、唯一、主键、顺序 | ✅ 完善 |
| 外键 | 约束名、本表列、引用表、引用列 | ✅ 完善 |

### 2.4 数据表浏览实现 (DataTable.tsx)

#### 当前功能清单

| 功能 | Navicat | 当前应用 | 状态 |
|------|---------|---------|------|
| 数据加载 | ✅ 分页 | ✅ 分页（10/50/100/500） | ✅ 一致 |
| 新增行 | ✅ 对话框 | ✅ 对话框 | ✅ 一致 |
| 编辑行 | ✅ 内联+对话框 | ✅ 对话框 | 🟡 部分一致 |
| 删除行 | ✅ 标记删除 | ✅ 直接删除 | 🟡 部分一致 |
| 撤销更改 | ✅ 支持 | ✅ 支持 | ✅ 一致 |
| 提交更改 | ✅ 支持 | ✅ 支持（空操作） | 🟡 部分一致 |
| 导出数据 | ✅ CSV/Excel | ✅ CSV | 🟡 部分一致 |
| 刷新数据 | ✅ 支持 | ✅ 支持 | ✅ 一致 |
| 单元格复制 | ✅ 支持 | ❌ 未实现 | 🟡 缺失 |
| 筛选排序 | ✅ 支持 | ✅ AG Grid 内置 | ✅ 一致 |
| 未保存提示 | ✅ 标签*号 | ✅ hasUnsavedChanges | 🟡 部分一致 |
| 行选择 | ✅ 支持 | ✅ 支持 | ✅ 一致 |
| 多语句事务 | ✅ 支持 | ❌ 未实现 | 🟢 可选 |

#### 当前数据编辑流程

```typescript
// 新增行
handleAddRow() → 打开表单对话框 → 填写字段 → handleSaveNewRow() → INSERT SQL

// 编辑行
handleEditRow() → 检查选中一行 → 打开表单对话框 → 修改字段 → handleSaveEditRow() → UPDATE SQL

// 删除行
handleDeleteRows() → 检查主键 → 确认删除 → DELETE SQL (逐行)

// 内联编辑（AG Grid）
onCellValueChanged() → 标记 hasUnsavedChanges → 自动提交（当前为空操作）
```

**与 Navicat 差异**:
- 🔴 Navicat 内联编辑自动保存，当前需要手动打开对话框
- 🟡 Navicat 支持多行批量编辑和提交
- 🟡 当前 `handleCommit` 函数为空操作，实际未提交更改

### 2.5 TableList 双击交互 (TableList.tsx)

#### 当前实现

```typescript
const handleTableClick = useCallback(
  (tableName: string) => {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      // Double click
      onTableOpen?.(tableName, database);  // ✅ 双击打开数据浏览
    } else {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        // Single click
        onTableSelect?.(tableName, database);  // ✅ 单击选中
      }, 250);
    }
  },
  [database, onTableSelect, onTableOpen]
);
```

**评估**: ✅ 完美实现 Navicat 风格的单击/双击区分（250ms 延迟）

---

## 三、与 Navicat 的差异总结

### 3.1 一致的部分 ✅

| 交互 | Navicat | 当前应用 | 状态 |
|------|---------|---------|------|
| 单击表显示结构 | ✅ | ✅ | ✅ 一致 |
| 双击表打开数据浏览 | ✅ | ✅ | ✅ 一致 |
| 单击连接显示对象列表 | ✅ | ✅ | ✅ 一致 |
| 多标签页切换 | ✅ | ✅ | ✅ 一致 |
| 防止重复打开同一表 | ✅ | ✅ | ✅ 一致 |
| 表列表显示表/视图计数 | ✅ | ✅ | ✅ 一致 |
| 表结构分 Tab 显示 | ✅ | ✅ | ✅ 一致 |
| 数据分页加载 | ✅ | ✅ | ✅ 一致 |
| 新增/编辑/删除数据 | ✅ | ✅ | ✅ 一致 |

### 3.2 部分一致的部分 🟡

| 交互 | Navicat | 当前应用 | 差异 |
|------|---------|---------|------|
| 数据编辑方式 | 内联编辑 | 对话框编辑 | 🟡 体验差异 |
| 删除行 | 标记删除+提交 | 直接 DELETE | 🟡 安全性差异 |
| 提交更改 | 实际执行 SQL | 空操作 | 🔴 功能缺失 |
| 未保存提示 | 标签*号+确认框 | 仅状态标记 | 🟡 体验差异 |
| 表结构信息 | 含表信息+SQL预览 | 仅列/索引/外键 | 🟡 内容缺失 |

### 3.3 缺失的部分 ❌

| 功能 | Navicat | 当前应用 | 优先级 |
|------|---------|---------|-------|
| **表设计器** | ✅ 可视化设计表 | ❌ 未实现 | 🔴 高 |
| **标签右键菜单** | ✅ 关闭其他/右侧/全部 | ❌ 未实现 | 🟡 中 |
| **标签拖拽排序** | ✅ 支持 | ❌ 未实现 | 🟡 中 |
| **SQL 多结果集** | ✅ 多 Tab 显示 | ❌ 单结果 | 🔴 高 |
| **SQL 语法高亮** | ✅ Monaco/自定义 | ✅ Monaco | ✅ 已有 |
| **SQL 代码补全** | ✅ 支持 | ⚠️ 基础 | 🟡 中 |
| **单元格复制粘贴** | ✅ 支持 | ❌ 未实现 | 🟡 中 |
| **数据筛选视图** | ✅ 高级筛选 | ✅ AG Grid 内置 | ✅ 已有 |
| **执行计划** | ✅ EXPLAIN 可视化 | ❌ 未实现 | 🟢 低 |
| **SQL 执行历史** | ✅ 记录 | ❌ 未实现 | 🟡 中 |

---

## 四、核心问题识别

### 4.1 数据编辑流程问题

**当前问题**:
```typescript
// DataTable.tsx - handleCommit 函数
const handleCommit = useCallback(async () => {
  message.info('内联编辑已自动提交');  // ❌ 仅提示，无实际操作
  setHasUnsavedChanges(false);
}, []);
```

**Navicat 行为**:
1. 内联编辑单元格
2. 自动标记更改
3. 点击"应用更改"按钮
4. 执行批量 UPDATE/INSERT/DELETE SQL
5. 显示成功/失败消息

**当前行为**:
1. 单元格编辑（AG Grid 内联）
2. 标记 `hasUnsavedChanges`
3. 点击"提交"按钮
4. **仅显示提示，无 SQL 执行** ← 🔴 问题

### 4.2 标签页交互问题

**当前缺失**:
```typescript
// 缺失 1: 标签右键菜单
const handleTabContextMenu = (e, tabKey) => {
  // ❌ 未实现
};

// 缺失 2: 未保存更改确认
const handleCloseTab = (tabKey) => {
  const tab = findTab(tabKey);
  if (tab.dirty) {
    // ❌ 未弹出确认对话框
  }
  closeTab(tabKey);
};

// 缺失 3: 标签拖拽排序
// ❌ 未实现
```

### 4.3 表结构查看问题

**当前缺失**:
- 表信息概览页签（表大小、引擎、行数等）
- SQL 预览页签（SHOW CREATE TABLE）
- 触发器信息页签

---

## 五、改进建议

### 5.1 高优先级（核心功能）

#### 5.1.1 实现数据提交逻辑

```typescript
// DataTable.tsx - 修改 handleCommit
const handleCommit = useCallback(async () => {
  try {
    setLoading(true);
    
    // 收集所有更改
    const api = gridApiRef.current;
    if (!api) return;
    
    const modifiedRows = api.getRenderedNodes()
      .map(node => node.data)
      .filter(row => row.__status__ === 'modified' || row.__status__ === 'new');
    
    const deletedRows = rowData.filter(row => row.__status__ === 'deleted');
    
    // 执行批量操作
    for (const row of modifiedRows) {
      if (row.__status__ === 'new') {
        // INSERT
        const columns = Object.keys(row).filter(k => !k.startsWith('__'));
        const values = columns.map(k => `'${row[k]}'`);
        const sql = `INSERT INTO \`${tableName}\` (${columns.join(',')}) VALUES (${values.join(',')})`;
        await executeQuery(connectionId, sql);
      } else {
        // UPDATE
        const primaryKey = columns.find(c => c.column_key === 'PRI');
        if (primaryKey) {
          const updates = Object.entries(row)
            .filter(([k]) => !k.startsWith('__'))
            .map(([k, v]) => `\`${k}\` = '${v}'`)
            .join(', ');
          const sql = `UPDATE \`${tableName}\` SET ${updates} WHERE \`${primaryKey.column_name}\` = '${row[primaryKey.column_name]}'`;
          await executeQuery(connectionId, sql);
        }
      }
    }
    
    // 删除行
    for (const row of deletedRows) {
      const primaryKey = columns.find(c => c.column_key === 'PRI');
      if (primaryKey) {
        const sql = `DELETE FROM \`${tableName}\` WHERE \`${primaryKey.column_name}\` = '${row[primaryKey.column_name]}'`;
        await executeQuery(connectionId, sql);
      }
    }
    
    message.success('更改已提交');
    setHasUnsavedChanges(false);
    loadData();
  } catch (error: any) {
    message.error(`提交失败：${error.message}`);
  } finally {
    setLoading(false);
  }
}, [gridApiRef, tableName, connectionId, executeQuery, loadData]);
```

#### 5.1.2 添加标签右键菜单

```typescript
// TabPanel/index.tsx
const [contextMenu, setContextMenu] = useState<{
  visible: boolean;
  x: number;
  y: number;
  tabKey: string;
}>({ visible: false, x: 0, y: 0, tabKey: '' });

const handleTabContextMenu = (e: React.MouseEvent, tabKey: string) => {
  e.preventDefault();
  e.stopPropagation();
  setContextMenu({
    visible: true,
    x: e.clientX,
    y: e.clientY,
    tabKey,
  });
};

const contextMenuItems = [
  { key: 'close', label: '关闭' },
  { key: 'closeOthers', label: '关闭其他' },
  { key: 'closeRight', label: '关闭右侧' },
  { key: 'closeAll', label: '关闭全部' },
  { type: 'divider' },
  { key: 'clone', label: '克隆标签' },
];

// 在 Tab 标题上添加事件
{
  key: dataTabKey,
  label: (
    <span
      onContextMenu={(e) => handleTabContextMenu(e, dataTabKey)}
    >
      <TableOutlined /> {table.name}
    </span>
  ),
}
```

#### 5.1.3 添加表信息页签

```typescript
// TableStructure.tsx - 新增信息页签
interface TableInfo {
  table_name: string;
  engine?: string;
  row_count?: number;
  data_length?: number;
  index_length?: number;
  create_time?: string;
  update_time?: string;
  collation?: string;
  comment?: string;
}

// 新增页签
{
  key: 'info',
  label: '信息',
  children: <TableInfoPanel info={tableInfo} />,
}
```

### 5.2 中优先级（体验优化）

#### 5.2.1 单元格复制粘贴

```typescript
// DataTable.tsx
useEffect(() => {
  const handleCopy = () => {
    const selected = gridApiRef.current?.getSelectedCells();
    if (!selected) return;
    
    const text = selected.map(cell => cell.value).join('\t');
    navigator.clipboard.writeText(text);
  };
  
  const handlePaste = async () => {
    const text = await navigator.clipboard.readText();
    const selected = gridApiRef.current?.getFocusedCell();
    if (!selected) return;
    
    // 解析并粘贴数据
    const rows = text.split('\n');
    // ... 实现粘贴逻辑
  };
  
  document.addEventListener('copy', handleCopy);
  document.addEventListener('paste', handlePaste);
  
  return () => {
    document.removeEventListener('copy', handleCopy);
    document.removeEventListener('paste', handlePaste);
  };
}, []);
```

#### 5.2.2 未保存更改确认

```typescript
const handleCloseTab = useCallback((tabKey: string) => {
  const isDirty = tabKey.endsWith('-data') && hasUnsavedChanges;
  
  if (isDirty) {
    Modal.confirm({
      title: '未保存的更改',
      content: '有未保存的数据更改，确定要关闭吗？',
      okText: '关闭',
      cancelText: '取消',
      onOk: () => {
        // 关闭标签
        setOpenedTables(prev => prev.filter(...));
        setActiveKey('objects');
      },
    });
  } else {
    // 直接关闭
  }
}, [hasUnsavedChanges]);
```

### 5.3 低优先级（高级特性）

| 功能 | 复杂度 | 说明 |
|------|-------|------|
| 标签拖拽排序 | 中 | 使用 dnd-kit 或 react-dnd |
| SQL 多结果集 | 高 | 修改后端解析逻辑 |
| 表设计器 | 高 | 可视化编辑表结构 |
| SQL 执行历史 | 低 | 本地存储历史记录 |
| 执行计划可视化 | 中 | EXPLAIN 结果渲染 |

---

## 六、总体评估

### 6.1 一致性评分

| 维度 | 得分 | 说明 |
|------|------|------|
| 标签页管理 | 85% | 多标签、防重复打开已实现 |
| 数据浏览 | 80% | 分页、筛选、排序已实现 |
| 数据编辑 | 60% | 对话框编辑体验差异，提交未实现 |
| 表结构查看 | 75% | 列/索引/外键已实现，缺信息页签 |
| SQL 编辑器 | 70% | Monaco 已集成，缺多结果集 |
| **总体评分** | **74%** | 基础功能完善，核心编辑流程需优化 |

### 6.2 与 Navicat 的核心差异

**✅ 已对齐**:
- 单击表显示结构
- 双击表打开数据浏览
- 多标签页切换
- 表列表搜索和过滤
- 数据分页加载

**🟡 部分对齐**:
- 数据编辑方式（对话框 vs 内联）
- 删除流程（直接删除 vs 标记删除）
- 未保存提示（状态标记 vs 标签*号）

**❌ 未对齐**:
- 表设计器（完全缺失）
- 数据提交逻辑（空操作）
- 标签右键菜单
- SQL 多结果集

### 6.3 建议优先级

**Phase 1（立即实施）**:
1. 实现数据提交逻辑（handleCommit 函数）
2. 添加标签右键菜单
3. 添加未保存更改确认对话框

**Phase 2（下一迭代）**:
1. 实现表设计器
2. 添加表信息页签
3. 实现单元格复制粘贴

**Phase 3（后续规划）**:
1. SQL 多结果集支持
2. 标签拖拽排序
3. SQL 执行历史

---

## 七、总结

当前应用的右侧内容区**基础架构完善**，多标签页、数据浏览、表结构查看等核心功能已实现。与 Navicat 的主要差距在于：

1. **数据编辑流程**：提交逻辑未实现（核心问题）
2. **标签页交互**：缺少右键菜单和未保存确认
3. **高级功能**：表设计器、多结果集等完全缺失

建议优先修复数据提交流程，再逐步完善交互体验。
