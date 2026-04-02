# Rust 源码目录 (src-tauri/src/)

**目录**: `src-tauri/src/` - Rust 后端源码

## 结构

```
src/
├── db/           # 数据库模块 (6 文件，实际内容)
├── commands.rs   # Tauri 命令 (1151 行，高重复)
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
// 重复的数据库连接逻辑 (MySQL/PostgreSQL/SQLite)
#[tauri::command]
pub async fn get_tables_mysql(connection_id: String) -> Result<Vec<TableInfo>, String> {
    let conn_config = Storage::get_connection(&connection_id)?;
    let password = PasswordManager::get_password(&connection_id)?;
    let pool = create_mysql_pool(&conn_config, &password).await?;
    // ... 查询逻辑
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

## 源码特定问题

1. **commands.rs 大文件**: 1151 行，需拆分为 `commands/` 模块
2. **TODO**: 连接测试逻辑待实现

## 改进建议

1. **重构 commands.rs**: 提取数据库驱动抽象层，减少重复代码
2. **模块化**: 使用 `commands/` 目录拆分命令模块
