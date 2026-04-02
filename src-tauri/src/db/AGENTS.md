# 数据库模块 (src-tauri/src/db/)

**目录**: `src-tauri/src/db/` - 数据库连接池、模型、迁移、查询、仓储

## 结构

```
db/
├── mod.rs          # 模块导出入口
├── models.rs       # 数据结构定义
├── pool.rs         # 连接池管理
├── migrations.rs   # 数据库迁移
├── query.rs        # 查询构建
└── repository.rs   # 数据访问层
```

## 核心模式

### 模块导出 (`mod.rs`)

```rust
// 使用 pub use 重导出所有子模块
pub use self::models::*;
pub use self::pool::*;
pub use self::migrations::*;
pub use self::query::*;
pub use self::repository::*;
```

### 连接池 (`pool.rs`)

```rust
// 支持多种数据库
pub async fn create_pool(conn_config: &ConnectionConfig, password: &str) -> Result<AnyPool, String> {
    match conn_config.db_type.as_str() {
        "mysql" => create_mysql_pool(conn_config, password).await,
        "postgresql" => create_postgresql_pool(conn_config, password).await,
        "sqlite" => create_sqlite_pool(conn_config, password).await,
        _ => Err(format!("Unsupported database type: {}", conn_config.db_type)),
    }
}
```

## 数据库模块特定问题

1. **错误处理**: 使用 `String` 作为错误类型，建议定义 `DbError` 枚举
2. **连接池配置**: 缺少连接池大小、超时等配置

## 改进建议

1. **抽象数据库驱动**: 定义统一的 `DatabaseDriver` trait
2. **自定义错误**: 定义 `DbError` 枚举替代 `String`
3. **连接池配置**: 添加连接池大小、超时等配置
