# Rust 源码目录 (src-tauri/src/)

**目录**: `src-tauri/src/` - Rust 后端源码

## 结构

```
src/
├── db/           # 数据库模块 (6 文件)
├── drivers/      # 数据库驱动抽象 (mysql/pg/sqlite)
├── commands.rs   # Tauri 命令 (657 行，已优化)
├── main.rs       # Rust 入口、菜单初始化
├── security.rs   # 系统密钥链密码管理
└── storage.rs    # 连接配置持久化
```

## 模块说明

| 模块 | 文件 | 作用 |
|------|------|------|
| **db** | `db/` | 数据库连接池、模型、迁移、查询、仓储 |
| **commands** | `commands.rs` | Tauri 命令实现 (数据库操作) |
| **main** | `main.rs` | 应用启动、菜单系统初始化 |
| **security** | `security.rs` | PasswordManager 结构体，系统密钥链操作 |
| **storage** | `storage.rs` | LocalStorage 结构体，JSON 配置持久化 |

## 核心模式

### 命令处理 (`commands.rs`)

```rust
// ✅ 已重构：通过 DbPool::validate() 消除重复代码
#[tauri::command]
pub async fn test_connection(...) -> Result<bool, String> {
    let pool = connect_by_type(db_type, &config, password).await?;
    pool.validate().await?;  // 统一的验证逻辑
    Ok(true)
}
```

### 数据库模块 (`db/`)

```rust
// 模块导出 (db/mod.rs)
pub use self::models::*;
pub use self::pool::*;
pub use self::migrations::*;
pub use self::query::*;
pub use self::repository::*;
```

### 数据库驱动 (`drivers/`)

```rust
// DbPool 统一的验证方法
impl DbPool {
    pub async fn validate(&self) -> Result<(), String> {
        match self {
            DbPool::MySql(pool) => { sqlx::query("SELECT 1").fetch_one(pool).await?; }
            DbPool::Postgres(pool) => { sqlx::query("SELECT 1").fetch_one(pool).await?; }
            DbPool::Sqlite(pool) => { sqlx::query("SELECT 1").fetch_one(pool).await?; }
        }
        Ok(())
    }
}
```

### 安全存储 (`security.rs`)

```rust
// 系统密钥链密码管理
impl PasswordManager {
    pub fn get_password(connection_id: &str) -> Result<String, String> { ... }
    pub fn set_password(connection_id: &str, password: &str) -> Result<(), String> { ... }
}
```

## 约定

- **模块命名**: snake_case (`db_pool.rs`)
- **错误处理**: `Result<T, String>` 统一错误类型
- **异步处理**: `async/await` + `tokio` 运行时
- **数据库连接**: sqlx 连接池管理
- **密码安全**: 系统密钥链 (keyring crate)

## 源码改进

1. ✅ **commands.rs 重构**: 提取 `DbPool::validate()` 方法，消除重复代码 57 行
2. ✅ **drivers 模块化**: 驱动逻辑分离到 `drivers/` 目录
3. ✅ **连接验证**: 统一的 `validate()` 方法替代重复的 match 模式
