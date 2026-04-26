# Go Sidecar 后端改造计划

## 背景
将 iDBLink 的数据库访问层从 Rust (sqlx) 全面迁移到 Go Sidecar，以支持达梦等国产数据库，同时保留 Tauri 桌面壳和 React 前端。

## 架构变更

```
React 前端 (src/)
    ↓ Tauri invoke (不变)
Rust 主进程 (src-tauri/src/)
    ├─ Storage/Security (保留)
    ├─ Sidecar 管理 (新增)
    └─ Commands (变薄，HTTP 转发)
        ↓ HTTP/JSON (localhost)
Go Sidecar (go-backend/)
    ├─ HTTP Server
    ├─ 连接池管理
    ├─ MySQL / PostgreSQL / SQLite / 达梦 驱动
    └─ 元数据查询 / SQL 执行
```

## 目录结构

```
go-backend/
├── go.mod
├── main.go                 # 入口
├── server.go               # HTTP 服务启动
├── api/
│   ├── router.go           # 路由注册
│   ├── connection.go       # 连接/断开/测试
│   ├── query.go            # SQL 执行
│   └── metadata.go         # 元数据查询
├── db/
│   ├── manager.go          # 连接池管理器
│   ├── mysql.go            # MySQL 连接
│   ├── postgres.go         # PostgreSQL 连接
│   ├── sqlite.go           # SQLite 连接
│   └── dameng.go           # 达梦连接
└── models/
    └── models.go           # 共享结构体
```

## API 契约

Go HTTP 服务监听随机端口，启动后打印 `PORT: xxxx` 到 stdout。

### 端点清单

| 方法 | 路径 | 说明 | 对应 Rust Command |
|------|------|------|-----------------|
| POST | `/connect` | 建立连接 | `connect_database` |
| POST | `/disconnect` | 断开连接 | `disconnect_database` |
| POST | `/test` | 测试连接 | `test_connection` |
| POST | `/query` | 执行 SQL | `execute_query` |
| POST | `/databases` | 获取数据库列表 | `get_databases` |
| POST | `/tables` | 获取表列表 | `get_tables` |
| POST | `/tables-categorized` | 分类表+视图 | `get_tables_categorized` |
| POST | `/columns` | 获取列信息 | `get_columns` |
| POST | `/indexes` | 获取索引 | `get_indexes` |
| POST | `/foreign-keys` | 获取外键 | `get_foreign_keys` |
| POST | `/table-structure` | 完整表结构 | `get_table_structure` |
| POST | `/routines` | 存储过程/函数 | `get_routines` |

### 请求/响应格式

所有端点使用 JSON。核心结构体与前端类型完全对齐：

```go
// ConnectRequest
type ConnectRequest struct {
    DbType   string `json:"db_type"`
    Host     string `json:"host"`
    Port     int    `json:"port"`
    Username string `json:"username"`
    Password string `json:"password"`
    Database string `json:"database,omitempty"`
}

// QueryRequest
type QueryRequest struct {
    ConnectionID string `json:"connection_id"`
    SQL          string `json:"sql"`
}

// QueryResult (与前端 QueryResult 一致)
type QueryResult struct {
    Columns      []string        `json:"columns"`
    Rows         [][]interface{} `json:"rows"`
    RowsAffected *uint64         `json:"rows_affected,omitempty"`
    Error        string          `json:"error,omitempty"`
}
```

## 分阶段实施

### Phase 1: Go 后端骨架（Day 1）
- [ ] `go-backend/go.mod`
- [ ] `go-backend/models/models.go`
- [ ] `go-backend/db/manager.go`
- [ ] `go-backend/server.go` + `main.go`
- [ ] `go-backend/api/router.go`

### Phase 2: 数据库驱动层（Day 1-2）
- [ ] `db/mysql.go` - DSN 构建 + 连接
- [ ] `db/postgres.go` - DSN 构建 + 连接
- [ ] `db/sqlite.go` - 文件路径处理 + 连接
- [ ] `db/dameng.go` - 达梦 DSN + 连接（需用户自行提供驱动包）

### Phase 3: API 实现（Day 2-3）
- [ ] `api/connection.go` - connect / disconnect / test
- [ ] `api/query.go` - execute_query
- [ ] `api/metadata.go` - tables / columns / indexes / foreign-keys / databases / routines

### Phase 4: Rust 侧改造（Day 3-4）
- [ ] `Cargo.toml` 添加 `reqwest`
- [ ] 新建 `src/sidecar.rs` - Go 进程启动/停止/健康检查
- [ ] 改造 `src/commands.rs` - 移除 sqlx 驱动调用，改为 HTTP 转发
- [ ] 改造 `src/main.rs` - 初始化时启动 sidecar
- [ ] 删除 `src/drivers/` 目录（或保留空壳）
- [ ] `tauri.conf.json` 配置 `bundle.externalBin`

### Phase 5: 测试与文档（Day 4-5）
- [ ] MySQL 连接测试
- [ ] PostgreSQL 连接测试
- [ ] SQLite 连接测试
- [ ] 达梦连接测试（用户环境）
- [ ] 更新 `AGENTS.md`

## 构建说明

### 开发模式
```bash
# 终端 1: 启动 Go 后端
cd go-backend
go run .

# 终端 2: 启动 Tauri 前端
cd ../
pnpm tauri dev
```

### 生产打包
```bash
# 1. 编译 Go sidecar (macOS 示例)
cd go-backend
GOOS=darwin GOARCH=arm64 go build -o ../src-tauri/sidecars/go-backend-aarch64-apple-darwin

# 2. Tauri 打包
# tauri.conf.json 中配置 externalBin，Tauri 会自动将 sidecar 打包进 App
```

## 依赖

### Go 依赖
```
github.com/go-sql-driver/mysql        # MySQL
github.com/lib/pq                     # PostgreSQL
modernc.org/sqlite                    # SQLite (纯Go，无CGO)
github.com/ganl/go-dm                 # 达梦 (社区版，可选)
```

### Rust 新增依赖
```toml
reqwest = { version = "0.12", features = ["json"] }
```

## 注意事项

1. **SQLite 无 CGO**: 使用 `modernc.org/sqlite` 替代 `mattn/go-sqlite3`，避免交叉编译问题
2. **达梦驱动**: 达梦官方驱动不在公共 Go proxy 中，需要用户手动放置或使用 `github.com/ganl/go-dm`。代码中使用 build tag 控制编译
3. **连接池**: Go 侧用 `database/sql` 内置连接池，`db.SetMaxOpenConns(10)`
4. **错误处理**: Go 侧所有 API 返回 HTTP 200 + JSON 中的 `error` 字段，Rust 侧解析后转为 `Result<_, String>`
5. **Sidecar 生命周期**: Rust 侧在 `main()` 启动时启动 Go 进程，应用退出时自动终止
