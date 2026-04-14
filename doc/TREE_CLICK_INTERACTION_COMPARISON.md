# 左侧树单击/双击交互对比分析

## 一、Navicat Premium 的交互规范

### 1.1 标准交互行为

| 节点类型 | 单击 (Click) | 双击 (DoubleClick) | 展开/折叠 (Expand/Collapse) |
|---------|-------------|-------------------|---------------------------|
| **分组** | 选中分组，右侧显示该分组下的所有连接 | 展开/折叠分组 | 点击箭头图标 |
| **连接（未连接）** | 选中连接，右侧显示连接详情 | 连接数据库并展开 | 点击箭头图标 |
| **连接（已连接）** | 选中连接，右侧显示对象列表 | 展开/折叠连接 | 点击箭头图标 |
| **数据库** | 选中数据库，右侧显示该数据库下的表列表 | 展开/折叠数据库 | 点击箭头图标 |
| **表分组（表/视图等）** | 选中分组，右侧显示该类型对象列表 | 展开/折叠分组 | 点击箭头图标 |
| **具体表** | 选中表，右侧显示表结构（列、索引） | 打开数据浏览（新标签页） | 点击箭头展开显示列/索引 |
| **视图** | 选中视图，右侧显示视图结构 | 打开视图数据浏览 | 点击箭头展开 |
| **列/索引** | 仅选中，无额外操作 | 无操作 | 叶子节点，不可展开 |

### 1.2 关键交互特征

#### 单击行为
- **始终选中节点**：任何单击都会选中该节点
- **触发右侧内容更新**：根据选中的节点类型显示对应内容
- **不改变展开状态**：单击不会展开或折叠节点

#### 双击行为
- **连接节点**：首次双击未连接的节点会建立连接
- **切换展开状态**：已连接的节点双击会展开/折叠
- **打开数据浏览**：双击表节点会打开新的数据浏览标签页
- **不改变选中状态**：双击主要触发动作，选中是附带效果

#### 展开/折叠行为
- **独立事件**：展开/折叠是独立于单击和双击的事件
- **触发数据加载**：展开时按需加载子节点数据（懒加载）
- **不改变选中状态**：展开/折叠不影响当前选中的节点

---

## 二、当前应用实现分析

### 2.1 当前交互实现

根据代码分析 (`src/components/ConnectionTree/index.tsx`)：

```typescript
<Tree
  showIcon={false}
  selectedKeys={selectedId ? [selectedId] : []}
  expandedKeys={expandedKeys}
  onExpand={handleExpand}        // 展开/折叠回调
  onSelect={handleSelect}         // 选中回调
  treeData={buildTreeData() as any}
  // ❌ 没有 onDoubleClick 属性！
/>
```

### 2.2 当前单击行为 (`handleSelect`)

```typescript
const handleSelect = useCallback(
  (keys: React.Key[]) => {
    const key = keys[0] as string;
    if (!key) return;

    if (key.startsWith('table::')) {
      // 单击表 → 选中连接 + 选中表
      onSelect(connectionId);
      onTableSelect(tableName, database);  // ✅ 右侧显示表结构
    } else if (key.startsWith('db::')) {
      // 单击数据库 → 选中连接 + 清除表选中
      onSelect(connectionId);
      onTableSelect(null, database);
    } else if (key.startsWith('tables::') || key.startsWith('views::')) {
      // 单击表/视图分组 → 选中连接 + 清除表选中
      onSelect(connectionId);
      onTableSelect(null, database);
    } else if (key.startsWith('group-')) {
      // 单击分组 → 无操作
    } else {
      // 单击连接 → 选中连接
      onSelect(key);
    }
  },
  [onSelect, onTableSelect]
);
```

**当前单击行为总结**：
- ✅ 单击连接 → 选中连接
- ✅ 单击数据库 → 选中数据库，右侧显示表列表
- ✅ 单击表 → 选中表，右侧显示表结构
- ❌ 单击不会展开/折叠节点（**符合 Navicat 规范**）

### 2.3 当前展开行为 (`handleExpand`)

```typescript
const handleExpand = useCallback(
  (keys: React.Key[], info: { node: any; expanded: boolean }) => {
    onExpandKeys(strKeys);  // 更新展开的 keys

    // 展开连接 → 自动连接
    if (info.expanded && conn && conn.status !== 'connected') {
      onConnect(key);  // ✅ 自动连接数据库
    }

    // 展开数据库 → 加载表列表
    if (key.startsWith('db::') && info.expanded) {
      onDatabaseExpand(connectionId, database);  // ✅ 懒加载表
    }

    // 展开表 → 加载列和索引
    if (key.startsWith('table::') && info.expanded) {
      onTableExpand(connectionId, database, tableName);  // ✅ 懒加载列/索引
    }
  },
  [...]
);
```

**当前展开行为总结**：
- ✅ 展开连接 → 自动连接数据库
- ✅ 展开数据库 → 加载表列表
- ✅ 展开表 → 加载列和索引
- ✅ 懒加载机制完善

### 2.4 当前缺失的功能

| 功能 | Navicat 有？ | 当前应用 | 影响 |
|------|-------------|---------|------|
| **双击表打开数据浏览** | ✅ 是 | ❌ 无 | 🔴 高 - 核心交互差异 |
| **双击连接切换展开** | ✅ 是 | ❌ 无 | 🟡 中 - 便利性降低 |
| **双击数据库切换展开** | ✅ 是 | ❌ 无 | 🟡 中 - 便利性降低 |
| **双击分组切换展开** | ✅ 是 | ❌ 无 | 🟢 低 - 可用箭头替代 |
| **展开不改变选中状态** | ✅ 是 | ✅ 已有 | ✅ 符合规范 |

---

## 三、与 Navicat 的差异总结

### 3.1 一致的部分 ✅

| 交互 | Navicat | 当前应用 | 状态 |
|------|---------|---------|------|
| 单击连接选中连接 | ✅ | ✅ | ✅ 一致 |
| 单击表显示结构 | ✅ | ✅ | ✅ 一致 |
| 单击数据库显示表列表 | ✅ | ✅ | ✅ 一致 |
| 展开触发懒加载 | ✅ | ✅ | ✅ 一致 |
| 展开连接自动连接 | ✅ | ✅ | ✅ 一致 |
| 右键菜单 | ✅ | ✅ | ✅ 一致 |
| 展开不改变选中 | ✅ | ✅ | ✅ 一致 |

### 3.2 不一致的部分 ❌

| 交互 | Navicat | 当前应用 | 差异程度 |
|------|---------|---------|---------|
| **双击表打开数据浏览** | ✅ 双击打开新标签 | ❌ 无双击事件 | 🔴 严重 |
| **双击连接展开/折叠** | ✅ 双击切换展开 | ❌ 只能点箭头 | 🟡 中等 |
| **双击数据库展开/折叠** | ✅ 双击切换展开 | ❌ 只能点箭头 | 🟡 中等 |
| **双击分组展开/折叠** | ✅ 双击切换展开 | ❌ 只能点箭头 | 🟢 轻微 |

### 3.3 核心问题：双击缺失

**当前问题**：
- Ant Design Tree 组件支持 `onDoubleClick` 事件，但当前代码**未使用**
- 用户**无法通过双击快速打开表数据浏览**
- 用户**必须点击小箭头**才能展开/折叠节点（效率低）

**Navicat 用户习惯**：
1. 双击连接 → 连接并展开
2. 双击数据库 → 展开显示表
3. 双击表 → 打开数据浏览标签
4. 单击仅用于选中和查看结构

**当前用户体验**：
1. 单击连接 → 选中（不会连接）
2. 手动点箭头展开连接 → 触发连接
3. 单击表 → 显示结构
4. **无法双击表打开数据浏览** ← 核心缺失

---

## 四、改进方案

### 4.1 添加双击事件处理

Ant Design Tree 组件**不直接支持** `onDoubleClick`，但可以通过自定义节点实现：

```typescript
// 方案 1: 使用 title 渲染函数 + onDoubleClick
const buildConnectionNode = (conn: Connection) => {
  return {
    key: conn.id,
    title: (
      <div
        onClick={() => handleSelect([conn.id])}
        onDoubleClick={() => handleDoubleClick(conn.id)}  // ← 添加双击
        style={{ cursor: 'pointer', width: '100%' }}
      >
        {/* 节点内容 */}
      </div>
    ),
    // ...
  };
};

// 方案 2: 使用 Tree 的 onDoubleClick 属性（如果 Ant Design 支持）
<Tree
  onDoubleClick={(e) => {
    const nodeKey = getNodeKey(e.target);  // 从事件目标获取节点 key
    handleDoubleClick(nodeKey);
  }}
/>
```

### 4.2 双击处理逻辑

```typescript
const handleDoubleClick = useCallback(
  (key: string) => {
    console.log('[Tree] Double click:', key);

    if (key.startsWith('table::')) {
      // 双击表 → 打开数据浏览
      const parts = key.split('::');
      if (parts.length >= 4) {
        const connectionId = parts[1];
        const database = parts[2];
        const tableName = parts.slice(3).join('::');
        onTableOpen(tableName, database);  // ← 触发父组件打开标签
      }
    } else if (key.startsWith('db::')) {
      // 双击数据库 → 切换展开
      const parts = key.split('::');
      const connectionId = parts[1];
      const database = parts[2];
      toggleExpand(key);  // 切换展开状态
    } else if (!key.startsWith('group-') && !key.includes('::')) {
      // 双击连接 → 切换展开/连接
      const conn = connections.find((c) => c.id === key);
      if (conn && conn.status !== 'connected') {
        onConnect(key);  // 未连接则连接
      } else {
        toggleExpand(key);  // 已连接则切换展开
      }
    } else if (key.startsWith('group-')) {
      // 双击分组 → 切换展开
      toggleExpand(key);
    }
  },
  [connections, onConnect, onTableOpen]
);
```

### 4.3 修改 Tree 渲染

需要修改 `buildTreeData()` 函数，在每个节点的 `title` 中添加 `onDoubleClick`：

```typescript
const buildConnectionNode = (conn: Connection) => {
  return {
    key: conn.id,
    title: (
      <div
        className="tree-node-content"
        onDoubleClick={(e) => {
          e.stopPropagation();
          handleDoubleClick(conn.id);
        }}
      >
        {getDbIcon(conn.db_type)}
        <span>{conn.name}</span>
        {conn.status === 'connected' && <Tag color="green">已连接</Tag>}
      </div>
    ),
    // ...
  };
};

const buildTableNode = (table: TableInfo, connectionId: string, database: string) => {
  const tableKey = `${connectionId}::${database}::${table.table_name}`;
  return {
    key: `table::${tableKey}`,
    title: (
      <div
        className="tree-node-content"
        onDoubleClick={(e) => {
          e.stopPropagation();
          onTableOpen(table.table_name, database);
        }}
      >
        <TableOutlined />
        <span>{table.table_name}</span>
      </div>
    ),
    // ...
  };
};
```

### 4.4 完整实现步骤

| 步骤 | 文件 | 修改内容 | 复杂度 |
|------|------|---------|-------|
| 1 | `ConnectionTree/index.tsx` | 添加 `handleDoubleClick` 函数 | 低 |
| 2 | `ConnectionTree/index.tsx` | 修改 `buildConnectionNode` 添加双击 | 低 |
| 3 | `ConnectionTree/index.tsx` | 修改 `buildDatabaseNode` 添加双击 | 低 |
| 4 | `ConnectionTree/index.tsx` | 修改 `buildTableNode` 添加双击 | 低 |
| 5 | `ConnectionTree/index.tsx` | 修改 `buildGroupNode` 添加双击 | 低 |
| 6 | 测试 | 验证双击交互符合 Navicat 习惯 | 中 |

---

## 五、改进后的交互对照表

| 操作 | Navicat | 当前 | 改进后 |
|------|---------|------|-------|
| 单击连接 | 选中连接 | ✅ 一致 | ✅ 保持 |
| 双击连接 | 连接/展开 | ❌ 无 | ✅ 添加 |
| 单击数据库 | 选中显示表列表 | ✅ 一致 | ✅ 保持 |
| 双击数据库 | 展开/折叠 | ❌ 无 | ✅ 添加 |
| 单击表 | 显示表结构 | ✅ 一致 | ✅ 保持 |
| 双击表 | 打开数据浏览 | ❌ 无 | ✅ 添加 |
| 单击分组 | 选中（可选） | ✅ 一致 | ✅ 保持 |
| 双击分组 | 展开/折叠 | ❌ 无 | ✅ 添加 |
| 展开节点 | 懒加载数据 | ✅ 一致 | ✅ 保持 |
| 右键菜单 | 上下文操作 | ✅ 一致 | ✅ 保持 |

---

## 六、总结

### 当前一致性评分

| 维度 | 得分 | 说明 |
|------|------|------|
| 单击交互 | 90% | 基本一致，仅在分组单击时可优化 |
| 展开/折叠 | 100% | 懒加载逻辑完善 |
| 双击交互 | 0% | 完全缺失 |
| 右键菜单 | 100% | 功能完善 |
| **总体评分** | **72.5%** | 基础交互一致，核心双击缺失 |

### 核心差距

**🔴 最关键问题**：
1. 双击表无法打开数据浏览（Navicat 最常用的操作之一）
2. 双击连接/数据库/分组无法切换展开状态

**🟡 次要问题**：
1. 展开必须依赖小箭头点击（效率低）
2. 缺少键盘快捷键支持（如 Enter 展开、Space 选中）

### 建议

**立即实施**（30 分钟内可完成）：
- 添加 `handleDoubleClick` 函数
- 在所有节点 title 中添加 `onDoubleClick` 事件
- 连接 MainLayout 的 `onTableOpen` 回调

**预期效果**：
- 一致性评分从 **72.5%** 提升至 **95%+**
- 用户可以使用 Navicat 习惯的双击操作
- 提升操作效率（减少箭头点击次数）
