# P2 — 功能追赶详细规格

> **目标**: 实现 SSH/SSL 安全连接、数据导入导出增强、复制表/转储等进阶功能  
> **预估总时间**: ~63 小时  
> **状态**: ✅ 已全部完成

---

## P2-1: SSH 隧道后端实现

**优先级**: 🔴 高 (生产环境必需)  
**预估**: 16 小时  
**涉及文件**:
- Go 后端: 新建 `go-backend/api/ssh_tunnel.go`
- Go 后端: `go-backend/go.mod` (添加 `golang.org/x/crypto/ssh`)
- Rust: `src-tauri/src/commands.rs` (新增 SSH 相关命令)
- Rust: `src-tauri/src/storage.rs` (连接配置增加 SSH 字段)
- 前端: `src/types/api.ts` (ConnectionInput 增加 SSH 字段)
- 前端: `src/components/ConnectionDialog.tsx` (SSH 配置 UI 已存在，需对接)

### 现状

`ConnectionDialog` 中已有 SSH 配置标签页（主机、端口、用户名、密钥文件、密码），但这些参数在保存连接时被忽略，Go 后端的 `openDB()` 不处理 SSH。

### 架构设计

```
[前端 UI] → [Rust invoke] → [Go HTTP API] → [SSH Tunnel + DB Connection]
                                                    ↓
                                              1. 建立 SSH 隧道
                                                 (本地随机端口 → 远程 DB 端口)
                                              2. 通过隧道连接数据库
                                              3. 后续查询走隧道
```

### Go 后端实现

#### 1. SSH 隧道配置结构

```go
// go-backend/models/models.go 新增
type SSHTunnelConfig struct {
    Host        string `json:"ssh_host"`
    Port        int    `json:"ssh_port"`
    Username    string `json:"ssh_username"`
    AuthMethod  string `json:"ssh_auth_method"`  // "password" | "key"
    Password    string `json:"ssh_password"`      // AuthMethod == "password" 时使用
    PrivateKey  string `json:"ssh_private_key"`   // AuthMethod == "key" 时使用
    Passphrase  string `json:"ssh_passphrase"`     // 私钥密码（可选）
}
```

#### 2. SSH 隧道管理器

```go
// go-backend/api/ssh_tunnel.go

// StartSSHTunnel 创建 SSH 隧道
// 1. 解析 SSH 配置
// 2. 建立 SSH 连接 (密码认证或密钥认证)
// 3. 在本地随机端口创建监听器
// 4. 通过 SSH 端口转发将本地端口映射到远程 DB 端口
// 5. 返回本地端口，后续 DB 连接使用 localhost:localPort

// StopSSHTunnel 关闭 SSH 隧道
// 在连接断开时自动调用
```

#### 3. 连接流程修改

```go
// go-backend/api/connection.go

func (h *Handler) Connect(w http.ResponseWriter, r *http.Request) {
    // 解析请求
    // 如果有 SSH 配置:
    //   1. 先建立 SSH 隧道
    //   2. 将目标 host:port 替换为 localhost:localPort
    //   3. 通过隧道连接数据库
    // 否则:
    //   正常连接数据库
}
```

### Rust 层修改

#### 1. 连接配置增加 SSH 字段

在 `storage.rs` 中，`ConnectionConfig` 结构体增加 SSH 相关字段:

```rust
pub struct ConnectionConfig {
    // ... 现有字段
    pub ssh_host: Option<String>,
    pub ssh_port: Option<u16>,
    pub ssh_username: Option<String>,
    pub ssh_auth_method: Option<String>,
    pub ssh_password: Option<String>,  // 加密存储
    pub ssh_private_key_path: Option<String>,
    pub ssh_passphrase: Option<String>,
}
```

#### 2. 新增 Tauri 命令

```rust
#[tauri::command]
async fn test_ssh_connection(ssh_config: SshConfig) -> Result<bool, String> {
    // 通过 Go sidecar 测试 SSH 连接
}
```

### 前端修改

#### 1. 类型定义

```typescript
// src/types/api.ts
export interface ConnectionInput {
  // ... 现有字段
  ssh_host?: string;
  ssh_port?: number;
  ssh_username?: string;
  ssh_auth_method?: 'password' | 'key';
  ssh_password?: string;
  ssh_private_key_path?: string;
  ssh_passphrase?: string;
  ssh_enabled?: boolean;
}
```

#### 2. ConnectionDialog 对接

当前 `ConnectionDialog.tsx` 的 SSH 标签页已经可以收集这些参数，但保存时未传递到后端。需要:
- 在 `saveConnection` 时将 SSH 参数包含在 ConnectionInput 中
- 在 `testConnection` 时可选测试 SSH 连通性

### 安全注意事项

- SSH 私钥密码通过系统 Keychain 存储（复用已有的 `security.rs` 密码存储机制）
- SSH 隧道在连接断开时必须关闭
- 超时处理: SSH 连接超时默认 10 秒

### 验收标准

- [x] 连接配置中填写 SSH 参数后，能通过 SSH 隧道连接到远程数据库
- [x] 密码认证和密钥认证两种方式都支持
- [x] 连接断开后 SSH 隧道正确关闭
- [x] SSH 连接失败的错误信息友好易懂
- [x] 支持 MySQL 和 PostgreSQL 通过 SSH 隧道连接

---

## P2-2: SSL/TLS 连接后端实现

**优先级**: 🔴 高  
**预估**: 8 小时  
**涉及文件**:
- Go 后端: `go-backend/db/mysql.go`, `go-backend/db/postgres.go` 等
- Go 后端: `go-backend/api/connection.go`
- 前端: `src/types/api.ts`, `src/components/ConnectionDialog.tsx`

### 现状

`ConnectionDialog` 有 SSL 配置标签页（CA 证书、客户端证书、客户端密钥、跳过验证），但这些参数在保存连接时被忽略。

### 实现规格

#### 1. Go 后端 — MySQL

```go
// mysql.go 的 openDB 函数中
// 如果 ssl_enabled:
//   cfg, _ := mysql.ParseDSN(dsn)
//   tlsConfig := &tls.Config{ ... }
//   if ssl_skip_verify { tlsConfig.InsecureSkipVerify = true }
//   if ssl_ca_path { ca_cert, _ := os.ReadFile(ssl_ca_path); tlsConfig.RootCAs.AppendCert(ca_cert) }
//   if ssl_cert_path && ssl_key_path { ... }
//   mysql.RegisterTLSConfig("custom", tlsConfig)
//   cfg.TLSConfig = "custom"
```

#### 2. Go 后端 — PostgreSQL

```go
// postgres.go 的 openDB 函数中
// 如果 ssl_enabled:
//   dsn += "?sslmode=require"
//   如果 ssl_skip_verify: dsn += "?sslmode=disable" (或直接不启用)
//   如果有 CA 证书: 设置 sslrootcert 参数
//   如果有客户端证书: 设置 sslcert 和 sslkey 参数
```

#### 3. 类型定义

```typescript
export interface ConnectionInput {
  // ... 现有字段
  ssl_enabled?: boolean;
  ssl_ca_path?: string;
  ssl_cert_path?: string;
  ssl_key_path?: string;
  ssl_skip_verify?: boolean;
}
```

### 验收标准

- [x] MySQL 连接支持 SSL/TLS
- [x] PostgreSQL 连接支持 SSL/TLS
- [x] "跳过证书验证"选项正确工作
- [x] 自签名证书场景正常
- [x] 无 SSL 配置时连接行为与目前一致

---

## P2-3: 复制表（仅结构 / 结构和数据）

**优先级**: 🟡 中  
**预估**: 6 小时  
**涉及文件**:
- `src/components/TabPanel/index.tsx` — 修改 `onTableCopy` 回调
- `src/components/ConnectionTree/EnhancedConnectionTree.tsx` — 启用复制表菜单
- Go 后端 — 新增复制表 API 或复用现有 `executeDDL`

### 实现方案

**方案 A (推荐)**: 前端组合调用现有 API:

```typescript
async function copyTableStructure(
  sourceConnId: string,
  sourceTable: string,
  sourceDb: string,
  targetTable: string,
): Promise<void> {
  // 1. 获取源表 DDL
  const ddlStatements = await api.getTableDDL(sourceConnId, sourceTable, sourceDb);
  // 2. 替换表名
  const newDdl = ddlStatements.map(s => 
    s.replace(new RegExp(`\`${sourceTable}\``, 'g'), `\`${targetTable}\``)
     .replace(new RegExp(`"${sourceTable}"`, 'g'), `"${targetTable}"`)
     .replace(new RegExp(`\\[${sourceTable}\\]`, 'g'), `[${targetTable}]`)
  );
  // 3. 执行 DDL
  for (const stmt of newDdl) {
    await api.executeDDL(sourceConnId, stmt.trim(), sourceDb);
  }
}

async function copyTableWithData(
  sourceConnId: string,
  sourceTable: string,
  sourceDb: string,
  targetTable: string,
): Promise<void> {
  // 1. 先复制结构
  await copyTableStructure(sourceConnId, sourceTable, sourceDb, targetTable);
  // 2. INSERT INTO ... SELECT ...
  const sql = `INSERT INTO ${escapeId(targetTable)} SELECT * FROM ${escapeId(sourceTable)}`;
  await api.executeQuery(sourceConnId, sql, sourceDb);
}
```

**方案 B**: 后端新增 `/copy-table` API，一步完成。

### UI 设计

创建 `CopyTableDialog` Modal:

```
┌────────────────────────────────────────┐
│  复制表                                │
├────────────────────────────────────────┤
│  源表: [users                   ▼]     │
│  目标表名: [users_copy        ]         │
│  目标数据库: [mydb            ▼]        │
│                                        │
│  ○ 仅结构                               │
│  ● 结构和数据                           │
│                                        │
│            [取消]  [复制]               │
└────────────────────────────────────────┘
```

### 验收标准

- [x] 连接树表右键菜单 "复制表 → 仅结构" 正常工作
- [x] 连接树表右键菜单 "复制表 → 结构和数据" 正常工作
- [x] 复制后的表结构与原表一致（索引、约束需视数据库支持情况）
- [x] 复制数据后行数正确

---

## P2-4: 转储 SQL 文件

**优先级**: 🟡 中  
**预估**: 8 小时  
**涉及文件**:
- `src/components/ConnectionTree/EnhancedConnectionTree.tsx`
- `src/components/TabPanel/index.tsx`
- 新建 `src/components/DumpDialog.tsx`
- Go 后端: 可能需要修改 `stream_export.go`

### 实现方案

利用已有的 `api.getTableDDL` + `api.streamExportTable` 组合:

1. **仅结构**: 调用 `api.getTableDDL` 获取 DDL，写入文件
2. **结构和数据**: DDL + INSERT 语句（通过 `api.streamExportTable`）

#### UI 设计

```
┌────────────────────────────────────────┐
│  转储 SQL 文件                          │
├────────────────────────────────────────┤
│  表/数据库: [users                   ]  │
│  转储内容:                            │
│    ○ 仅结构                            │
│    ● 结构和数据                        │
│                                        │
│  包含:                                 │
│    ☑ DROP TABLE IF EXISTS              │
│    ☑ CREATE TABLE                      │
│    ☑ INSERT 数据                       │
│    ☐ 索引                              │
│    ☐ 外键                              │
│                                        │
│  文件路径: [/path/to/dump.sql    [浏览]]│
│                                        │
│            [取消]  [导出]               │
└────────────────────────────────────────┘
```

#### 文件保存

使用 Tauri 的文件对话框 API:

```typescript
import { save } from '@tauri-apps/plugin-dialog';

const filePath = await save({
  defaultPath: `${tableName}.sql`,
  filters: [{ name: 'SQL', extensions: ['sql'] }],
});
```

### 验收标准

- [x] 表右键菜单 "转储 SQL 文件" 打开导出对话框
- [x] "仅结构" 模式生成正确的 CREATE TABLE DDL
- [x] "结构和数据" 模式同时生成 DDL 和 INSERT 语句
- [x] 生成的 SQL 文件可以直接在目标数据库执行
- [x] 大表导出不卡 UI

---

## P2-5: 运行 SQL 文件

**优先级**: 🟡 中  
**预估**: 4 小时  
**涉及文件**:
- `src/components/ConnectionTree/EnhancedConnectionTree.tsx` — 启用菜单项
- 新建 `src/components/RunSqlFileDialog.tsx`

### 实现

1. 使用 Tauri 文件对话框选择 `.sql` 文件
2. 读取文件内容
3. 使用已有的 `splitSqlStatements` 函数分割语句
4. 逐条执行，显示进度
5. 执行结果在 SQL 编辑器中展示

```typescript
import { open } from '@tauri-apps/plugin-dialog';
import { readTextFile } from '@tauri-apps/plugin-fs';

async function runSqlFile(connectionId: string, database?: string) {
  const filePath = await open({
    filters: [{ name: 'SQL', extensions: ['sql'] }],
    multiple: false,
  });
  if (!filePath) return;
  
  const content = await readTextFile(filePath as string);
  const statements = splitSqlStatements(content);
  
  let success = 0, failed = 0;
  for (const sql of statements) {
    try {
      await api.executeDDL(connectionId, sql, database);
      success++;
    } catch (err) {
      failed++;
      // 收集错误，继续执行
    }
  }
  
  message.success(`执行完毕: 成功 ${success}, 失败 ${failed}`);
}
```

### 验收标准

- [x] 数据库右键菜单 "运行 SQL 文件" 打开文件选择器
- [x] 选择文件后自动执行所有语句
- [x] 执行结果汇总显示
- [x] 语句分割正确（忽略注释和字符串中的分号）

---

## P2-6: 导入 Excel

**优先级**: 🟡 中  
**预估**: 6 小时  
**涉及文件**:
- `src/components/DataTable/ImportWizard.tsx`
- `package.json` (添加 `xlsx` 依赖)

### 现状

ImportWizard 仅支持 CSV 导入。需要增加 Excel (.xlsx/.xls) 格式支持。

### 实现规格

#### 1. 安装依赖

```bash
pnpm add xlsx
```

#### 2. ImportWizard 扩展

在格式选择中增加 Excel 选项:

```typescript
const [importFormat, setImportFormat] = useState<'csv' | 'json' | 'excel'>('csv');
```

#### 3. Excel 解析逻辑

```typescript
import * as XLSX from 'xlsx';

async function parseExcelFile(file: File): Promise<{
  columns: string[];
  rows: Record<string, unknown>[];
  sheetNames: string[];
}> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetNames = workbook.SheetNames;
  
  // 默认使用第一个 sheet
  const sheet = workbook.Sheets[sheetNames[0]];
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  const columns = jsonData[0] as string[];
  const rows = jsonData.slice(1).map((row: any[]) => {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i] ?? null;
    });
    return obj;
  });
  
  return { columns, rows, sheetNames };
}
```

#### 4. 多 Sheet 选择

如果 Excel 文件有多个 Sheet，增加 Sheet 选择下拉框。

### 验收标准

- [x] 导入向导支持 .xlsx 和 .xls 格式
- [x] 多 Sheet 文件可选择目标 Sheet
- [x] Excel 数据正确映射到表列
- [x] 大文件导入不卡 UI（使用 Web Worker 可选）

---

## P2-7: 导入 JSON

**优先级**: 🟢 低  
**预估**: 3 小时  
**涉及文件**:
- `src/components/DataTable/ImportWizard.tsx`

### 实现

在 ImportWizard 中增加 JSON 格式支持:

```typescript
async function parseJsonFile(file: File): Promise<{
  columns: string[];
  rows: Record<string, unknown>[];
}> {
  const text = await file.text();
  const data = JSON.parse(text);
  const arrayData = Array.isArray(data) ? data : [data];
  
  const allKeys = new Set<string>();
  arrayData.forEach((item: any) => {
    Object.keys(item).forEach(key => allKeys.add(key));
  });
  const columns = Array.from(allKeys);
  
  return { columns, rows: arrayData };
}
```

### 验收标准

- [x] 导入向导支持 .json 格式
- [x] JSON 数组和单个对象都能正确解析
- [x] 数据映射正确

---

## P2-8: ER 图完善（外键连线 + 自动布局）

**优先级**: 🟡 中  
**预估**: 12 小时  
**涉及文件**:
- `src/components/ERDiagram/index.tsx`

### 现状

ER 图组件使用 ReactFlow 渲染表节点，但:
1. 外键关系线未正确绘制
2. 没有自动布局算法
3. 无法选择显示哪些表
4. 无法导出图片

### 实现规格

#### 1. 选择显示的表

在 ER 图组件中添加 `Select` 下拉框，多选要显示的表:

```typescript
<Select
  mode="multiple"
  placeholder="选择要显示的表"
  value={selectedTables}
  onChange={setSelectedTables}
  options={tableOptions}
  style={{ width: '100%', marginBottom: 12 }}
/>
```

#### 2. 自动布局

使用 `dagre` 库进行自动布局:

```bash
pnpm add dagre @types/dagre
```

```typescript
import dagre from 'dagre';

function getLayoutedElements(nodes: Node[], edges: Edge[]): { nodes: Node[], edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR' }); // 从左到右布局

  nodes.forEach(node => g.setNode(node.id, { width: 220, height: nodeHeight }));
  edges.forEach(edge => g.setEdge(edge.source, edge.target));

  dagre.layout(g);

  const layoutedNodes = nodes.map(node => {
    const pos = g.node(node.id);
    return { ...node, position: { x: pos.x, y: pos.y } };
  });

  return { nodes: layoutedNodes, edges };
}
```

#### 3. 外键关系线

从 `api.getForeignKeys` 获取外键信息，绘制边:

```typescript
// 对于每对有外键关系的表:
const edges: Edge[] = foreignKeys.map((fk, i) => ({
  id: `fk-${fk.constraint_name}-${i}`,
  source: fk.referenced_table,
  target: table_name, // 外键所在的表
  label: fk.column_name,
  type: 'smoothstep',
  animated: true,
  style: { stroke: 'var(--color-primary)' },
}));
```

#### 4. 导出图片

```typescript
import { toPng } from 'html-to-image';

const handleExport = () => {
  const element = document.querySelector('.react-flow');
  if (element) {
    toPng(element as HTMLElement).then((dataUrl) => {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'er-diagram.png';
      a.click();
    });
  }
};
```

### 验收标准

- [x] 可选择要显示的表
- [x] 外键关系以连线形式显示
- [x] 连线上标注外键列名
- [x] dagre 自动布局正确
- [x] 可导出为 PNG 图片
- [x] 暗色/亮色主题下 ER 图显示正常

---

## P2-9: 全局对象搜索

**优先级**: 🟢 低  
**预估**: 6 小时  
**涉及文件**:
- `src/components/MainLayout.tsx`
- 新建 `src/components/GlobalSearch.tsx`
- Go 后端: 可能需要新增批量搜索 API

### 规格说明

创建全局搜索弹窗（类似 VS Code 的 Ctrl+P 或 Navicat 的搜索功能）:

1. **快捷键**: `Ctrl+Shift+F` 打开搜索
2. **搜索范围**: 表名、列名、存储过程名、函数名、视图名
3. **搜索结果分类显示**: 表 / 视图 / 列 / 存储过程 / 函数
4. **点击结果**: 跳转到对应的表/视图数据标签页

#### 实现方案

**方案 A**: 前端遍历已加载数据搜索（简单，无需后端改动）

```typescript
// 遍历 connectionDatabases 中已加载的表
function searchInLoadedData(query: string): SearchResult[] {
  const results: SearchResult[] = [];
  for (const [connId, dbs] of Object.entries(connectionDatabases)) {
    for (const db of dbs) {
      if (!db.loaded) continue;
      for (const table of db.tables) {
        if (table.table_name.toLowerCase().includes(query)) {
          results.push({ type: 'table', name: table.table_name, connectionId, database: db.database });
        }
      }
    }
  }
  return results;
}
```

**方案 B**: 后端批量搜索 API（更完整，可搜索列名）

```go
// POST /search
type SearchRequest struct {
    ConnectionID string `json:"connection_id"`
    Database     string `json:"database"`
    Query        string `json:"query"`
    Types        []string `json:"types"` // "table", "column", "procedure", "function"
}

type SearchResult struct {
    Type        string `json:"type"`
    Name        string `json:"name"`
    ParentName  string `json:"parent_name"` // 列所属的表名
    Schema      string `json:"schema"`
}
```

### 验收标准

- [x] `Ctrl+Shift+F` 打开全局搜索
- [x] 搜索表名返回匹配结果
- [x] 双击结果跳转到对应数据标签页
- [x] 搜索结果按类型分组显示