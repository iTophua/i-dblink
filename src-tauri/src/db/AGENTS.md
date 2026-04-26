# 数据库模块 (src-tauri/src/db/)

**目录**: `src-tauri/src/db/` - 本地 SQLite 存储（连接配置、分组信息）

## 架构说明

数据库访问层已全面迁移到 Go Sidecar (`go-backend/`)。`src-tauri/src/db/` 现在**仅负责本地配置存储**，不再处理任何远程数据库连接。

## 结构

```
db/
├── mod.rs          # 模块导出入口
├── models.rs       # 数据结构定义 (DbConnection, ConnectionGroup)
├── pool.rs         # 本地 SQLite 连接池
├── migrations.rs   # 数据库迁移（连接表、分组表、历史表等）
└── repository.rs   # 数据访问层（连接/分组的 CRUD）
```

## 核心模式

### 本地存储 (`pool.rs` + `repository.rs`)

```rust
// pool.rs: 本地 SQLite 连接池（仅用于存储连接配置）
pub struct DbPool {
    pool: SqlitePool,
}

// repository.rs: 连接配置的增删改查
pub struct ConnectionRepository {
    pool: DbPool,
}
```

### 数据模型 (`models.rs`)

| 结构体 | 用途 | 存储位置 |
|--------|------|----------|
| `DbConnection` | 连接配置（名称、主机、端口、类型等） | 本地 SQLite |
| `ConnectionGroup` | 分组信息（名称、图标、颜色等） | 本地 SQLite |

## 注意事项

1. **sqlx 用途收缩**: `sqlx` 现在仅用于本地 SQLite 配置存储，不再连接 MySQL/PostgreSQL
2. **密码分离**: 连接密码通过 `security.rs` (keyring) 单独管理，不存本地数据库
3. **迁移历史**: `migrations.rs` 包含完整的表结构定义，修改 schema 时需同步更新
