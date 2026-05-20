# Tauri → Wails 迁移设计文档

**日期**: 2026-05-20  
**方案**: 大爆炸式完整迁移（允许数据重置）  
**预计工期**: 2-3 周

---

## 1. 迁移概述

### 1.1 为什么迁移

当前三层架构存在根本性冗余：

```
React 前端 → Tauri Rust (2000+ 行 HTTP 转发) → Go Sidecar (HTTP 服务) → 数据库
```

Rust 层实际只做了三件事：
1. 启动和管理 Go 子进程（sidecar.rs 532 行）
2. 把前端请求转发给 Go HTTP 服务（commands/mod.rs 2021 行，90% 是样板代码）
3. 本地 SQLite 配置存储 + 密码加密（~650 行）

**Wails 可以将以上全部统一到 Go 层**，消除跨进程通信开销和双运行时维护成本。

### 1.2 迁移策略

- **大爆炸式**：在一个 feature 分支完成所有改造，完成后整体替换
- **不兼容旧数据**：SQLite 数据库重新初始化，用户需重新配置连接
- **前端最小改动**：保留 React 代码，仅替换 API 调用层
- **Go 后端最大化复用**：现有 `go-backend/` 所有数据库驱动代码原样保留

---

## 2. 新架构设计

### 2.1 目标架构

```
React 19 + Vite 前端
        ↓
  Wails Runtime (Go)
        ↓
  Go 后端（直接绑定调用，非 HTTP）
        ↓
  数据库驱动
```

### 2.2 对比

| 维度 | 当前 (Tauri) | 目标 (Wails) |
|------|-------------|-------------|
| 后端语言 | Rust + Go | Go 单一语言 |
| 通信方式 | invoke → HTTP → Go | Wails bindings（直接调用） |
| 进程模型 | 主进程 + Sidecar 子进程 | 单进程 |
| 打包产物 | Rust 二进制 + Go 二进制 | 单 Go 二进制（前端嵌入） |
| 前端框架 | React 19 | React 19（不变） |
| 构建工具 | Vite + Tauri CLI | Vite + Wails CLI |

---

## 3. 目录结构

### 3.1 迁移前

```
i-dblink/
├── src/                          # React 前端
├── src-tauri/                    # Tauri Rust 后端（待删除）
│   ├── src/
│   │   ├── main.rs               # 菜单、启动逻辑
│   │   ├── commands/mod.rs       # 54 个命令（HTTP 转发）
│   │   ├── sidecar.rs            # Go 进程管理
│   │   ├── storage.rs            # 本地 SQLite
│   │   ├── security.rs           # 密码加密
│   │   └── db/                   # 本地数据库模块
│   ├── Cargo.toml
│   └── tauri.conf.json
├── go-backend/                   # Go Sidecar（保留整合）
│   ├── main.go                   # HTTP 服务器入口
│   ├── server.go
│   ├── db/                       # 10 个数据库驱动
│   ├── api/                      # HTTP handlers
│   └── models/
├── package.json
└── vite.config.ts
```

### 3.2 迁移后

```
i-dblink/
├── frontend/                     # 前端（原 src/ 移动）
│   ├── src/
│   │   ├── api/index.ts          # 新 API 层（Wails 调用）
│   │   └── ...                   # 其余不变
│   ├── package.json
│   └── vite.config.ts
├── backend/                      # Wails Go 后端
│   ├── main.go                   # Wails 入口 + 菜单
│   ├── app.go                    # App struct + 绑定方法
│   ├── storage.go                # 存储服务（从 Rust 迁移）
│   ├── security.go               # 加密服务（从 Rust 迁移）
│   ├── localdb/                  # 本地 SQLite 模块
│   │   ├── models.go             # 数据模型
│   │   ├── pool.go               # 连接池
│   │   ├── repository.go         # CRUD
│   │   └── migrations.go         # 数据库迁移
│   ├── db/                       # 原 go-backend/db/（数据库驱动）
│   ├── api/                      # 原 go-backend/api/（业务逻辑）
│   └── models/                   # 原 go-backend/models/
├── wails.json                    # Wails 配置
├── go.mod                        # Go 模块
└── package.json                  # 根目录包管理（脚本更新）
```

---

## 4. 关键模块设计

### 4.1 Wails App 结构（backend/app.go）

```go
type App struct {
    ctx       context.Context
    storage   *Storage
    dbManager *db.Manager
}

// Startup 应用启动时调用
func (a *App) Startup(ctx context.Context) {
    a.ctx = ctx
    a.initStorage()
    a.dbManager = db.NewManager()
}

// Shutdown 应用关闭时调用
func (a *App) Shutdown(ctx context.Context) {
    a.dbManager.CloseAll()
}
```

### 4.2 绑定方法映射

将现有 54 个 Tauri 命令映射为 Wails 绑定方法：

| Tauri Command | Wails Binding | 来源 |
|--------------|---------------|------|
| `test_connection` | `App.TestConnection(req)` | 复用 api/connection.go |
| `connect_database` | `App.ConnectDatabase(id)` | 复用 api/connection.go |
| `execute_query` | `App.ExecuteQuery(req)` | 复用 api/query.go |
| `get_tables` | `App.GetTables(req)` | 复用 api/metadata.go |
| `get_connections` | `App.GetConnections()` | 新实现（本地 SQLite） |
| `save_connection` | `App.SaveConnection(req)` | 新实现（本地 SQLite） |
| ... | ... | ... |

**设计原则**：
- 数据库操作方法：直接调用 `api/` 包中的函数
- 本地存储方法：新实现在 `storage.go` 中
- 返回类型：复用 `models/` 中已有的结构体

### 4.3 本地存储迁移（Rust → Go）

**当前 Rust 实现**：
- `db/pool.rs` 45 行：sqlx SQLite 连接池
- `db/models.rs` 137 行：DbConnection, ConnectionGroup, Snippet 模型
- `db/repository.rs` 387 行：CRUD 操作
- `db/migrations.rs` 163 行：表结构定义
- `storage.rs` 199 行：Storage 服务层

**Go 等效实现**：
- 使用 `modernc.org/sqlite`（纯 Go，无需 CGO）
- 数据库 schema 保持一致
- 模型结构体重新实现（json 标签保留）

### 4.4 密码加密迁移（Rust → Go）

**当前 Rust 实现**（security.rs 137 行）：
- AES-256-GCM 加密
- 密钥派生：machine_id + SHA256
- machine_id：macOS IOPlatformUUID + hostname + username + "i-dblink"

**Go 等效实现**：
- `crypto/aes` + `crypto/cipher`（GCM 模式）
- 密钥派生逻辑保持一致
- 相同输入产生相同密钥（允许密码解密）

> 注意：虽然允许数据重置，但加密方案保持一致，便于未来如果需要兼容时使用。

### 4.5 菜单系统迁移（Rust → Go）

**当前 Rust 实现**（main.rs 200+ 行）：
- 7 个菜单：文件、编辑、查看、连接、工具、窗口、帮助
- macOS 应用菜单（关于、偏好设置、隐藏等）
- 菜单事件通过 `window.emit("menu-action", ...)` 转发到前端

**Go 等效实现**：
- Wails `menu.NewMenuFromItems()`
- 菜单回调函数通过 `runtime.EventsEmit()` 发送事件到前端
- 前端通过 `runtime.EventsOn()` 监听

---

## 5. 前端改造方案

### 5.1 API 层重写

**当前**（src/api/index.ts）：
```typescript
import { invoke } from '@tauri-apps/api/core';

const result = await invoke('execute_query', { connectionId, sql });
```

**目标**：
```typescript
// Wails 自动生成的绑定
import { ExecuteQuery } from '../../wailsjs/go/backend/App';

const result = await ExecuteQuery({ connectionId, sql });
```

> Wails 编译时自动生成 `wailsjs/go/backend/App.ts`，包含所有绑定方法的 TypeScript 签名。

### 5.2 菜单事件监听

**当前**：
```typescript
import { listen } from '@tauri-apps/api/event';
listen('menu-action', (event) => { ... });
```

**目标**：
```typescript
import { EventsOn } from '../../wailsjs/runtime';
EventsOn('menu-action', (data) => { ... });
```

### 5.3 依赖变更

**移除**：
- `@tauri-apps/api`
- `@tauri-apps/cli`

**新增**：
- `wailsjs`（Wails 自动生成，无需安装）

### 5.4 前端目录移动

将 `src/` 重命名为 `frontend/src/`，并在 `wails.json` 中配置：

```json
{
  "$schema": "...",
  "name": "iDBLink",
  "outputfilename": "iDBLink",
  "frontend": {
    "dir": "./frontend",
    "install": "pnpm install",
    "build": "pnpm build",
    "dev": "pnpm dev",
    "package": "package.json"
  }
}
```

---

## 6. 数据迁移策略

### 6.1 数据重置方案

由于允许重置，迁移后：
- 本地 SQLite 数据库（connections.db）重新初始化
- 用户需要重新添加数据库连接
- 代码片段、分组等数据清空

### 6.2 数据库 Schema（Go 版本）

保持与 Rust 版本相同的表结构：
- `connections`：连接配置
- `connection_groups`：分组
- `connection_passwords`：加密密码
- `snippets`：代码片段
- `connection_history`：连接历史
- `app_config`：应用配置

---

## 7. 构建系统改造

### 7.1 开发模式

**当前**：
```bash
pnpm tauri dev    # 启动 Vite + Tauri
```

**目标**：
```bash
wails dev         # 启动 Vite + Wails（自动热重载）
```

### 7.2 生产构建

**当前**：
```bash
pnpm tauri build  # 构建 Rust + Go 二进制
```

**目标**：
```bash
wails build       # 构建单 Go 二进制（前端资源嵌入）
```

### 7.3 包管理

- 根目录 `package.json` 保留用于脚本和工具
- 前端依赖移到 `frontend/package.json`
- Go 依赖通过 `go.mod` 管理

---

## 8. 测试策略

### 8.1 Go 后端测试

- 现有 `go-backend/` 测试继续运行：`go test ./...`
- 新增本地存储模块测试
- 新增加密模块测试

### 8.2 前端测试

- 现有 Vitest 测试继续运行（需更新 mocks）
- API 层单元测试需要重写

### 8.3 集成测试

- 端到端测试：使用 Playwright 测试完整工作流
- 平台测试：macOS（主开发平台）、Windows、Linux

---

## 9. 风险和对策

| 风险 | 影响 | 对策 |
|------|------|------|
| Wails 菜单 API 功能不足 | 中 | 提前验证菜单功能，必要时用自定义实现 |
| 前端框架版本兼容性 | 低 | Wails v2 支持 React 19，Vite 集成成熟 |
| 构建产物体积增加 | 低 | Go 后端原本就存在，Wails 嵌入资源不会显著增加体积 |
| 开发环境切换成本 | 中 | 并行维护两套构建系统直到迁移完成 |
| SSH 隧道/SSL 功能 | 低 | Go 代码原样保留，不受影响 |
| 团队学习成本 | 中 | Wails 文档完善，API 与 Tauri 类似 |

---

## 10. 实施阶段

### 阶段 1：基础设施（3 天）
1. 初始化 Wails 项目
2. 配置目录结构
3. 设置前端目录移动
4. 验证开发环境（`wails dev` 能启动）

### 阶段 2：Go 后端改造（5-7 天）
1. 创建 Wails App 结构和绑定方法桩
2. 迁移本地存储模块（SQLite）
3. 迁移安全模块（加密）
4. 迁移菜单系统
5. 集成现有数据库驱动和业务逻辑

### 阶段 3：前端改造（3-5 天）
1. 重写 API 层（invoke → Wails bindings）
2. 迁移菜单事件监听
3. 移除 Tauri 依赖
4. 更新构建脚本

### 阶段 4：测试和修复（3-5 天）
1. 功能测试（连接、查询、管理等）
2. 平台兼容性测试
3. 性能对比测试
4. Bug 修复

### 阶段 5：清理和文档（2 天）
1. 删除 src-tauri/ 目录
2. 更新 README 和文档
3. 更新 CI/CD 配置
4. 代码审查

---

## 11. 验收标准

- [ ] `wails dev` 能正常启动应用
- [ ] 能添加、编辑、删除数据库连接
- [ ] 能连接数据库并执行查询
- [ ] 能浏览表结构、索引、外键
- [ ] 菜单系统正常工作（快捷键、事件转发）
- [ ] 生产构建产物能在目标平台运行
- [ ] 所有现有功能正常工作（事务、DDL、导入导出等）
- [ ] 现有测试套件通过（适当更新后）

---

## 12. 回滚计划

如果迁移过程中遇到无法解决的技术障碍：
1. 保留 `src-tauri/` 分支（不立即删除）
2. 保留旧的 `go-backend/` HTTP 入口
3. 随时可切回 Tauri 版本

**回滚触发条件**：
- Wails 存在阻碍功能实现的已知 bug
- 构建产物在目标平台无法正常运行
- 性能显著劣于当前版本（>20%）

---

*设计文档完成。请审阅并确认是否开始实施。*
