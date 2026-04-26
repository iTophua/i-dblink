# Rust 源码目录 (src-tauri/src/)

**目录**: `src-tauri/src/` - Rust 后端源码

## 结构

```
src/
├── db/           # 本地 SQLite 模块（连接配置/分组存储）
├── commands.rs   # Tauri 命令（通过 Go Sidecar 转发数据库操作）
├── main.rs       # Rust 入口、菜单初始化
├── security.rs   # 系统密钥链密码管理
├── sidecar.rs    # Go Sidecar 进程管理
└── storage.rs    # 连接配置持久化
```

## 模块说明

| 模块 | 文件 | 作用 |
|------|------|------|
| **db** | `db/` | 本地 SQLite 连接池、模型、迁移、仓储（仅用于存储连接配置和分组） |
| **commands** | `commands.rs` | Tauri 命令实现（数据库操作通过 HTTP 转发给 Go Sidecar） |
| **main** | `main.rs` | 应用启动、菜单系统初始化、Sidecar 启动 |
| **security** | `security.rs` | PasswordManager 结构体，系统密钥链操作 |
| **storage** | `storage.rs` | Storage 结构体，连接配置/分组的 CRUD |
| **sidecar** | `sidecar.rs` | SidecarManager 结构体，启动并通信 Go 后端 |

## 核心模式

### 命令处理 (`commands.rs`)

所有数据库操作命令（`test_connection`, `execute_query`, `get_tables` 等）均通过 `SidecarManager.post()` 将请求转发给 Go Sidecar 处理：

```rust
#[tauri::command]
pub async fn execute_query(
    connection_id: String,
    sql: String,
    ...
) -> Result<QueryResult, String> {
    let sidecar_guard = sidecar.lock().await;
    let sm = sidecar_guard
        .as_ref()
        .ok_or_else(|| "Sidecar not initialized".to_string())?;

    ensure_connected(&connection_id, &state, &connections, sm).await?;

    let req = serde_json::json!({ "connection_id": connection_id, "sql": sql });
    let resp: QueryResult = sm.post("/query", &req).await?;
    Ok(resp)
}
```

### 数据库模块 (`db/`)

```rust
// 模块导出 (db/mod.rs)
pub use self::models::*;
pub use self::pool::*;
pub use self::migrations::*;
pub use self::repository::*;
```

`db/` 现在**仅负责本地 SQLite 配置存储**，不再处理任何远程数据库连接。远程数据库连接和查询已全部迁移到 Go Sidecar (`go-backend/`)。

### Sidecar 管理 (`sidecar.rs`)

```rust
pub struct SidecarManager {
    port: u16,
    client: reqwest::Client,
    _process: Mutex<Child>,
}

impl SidecarManager {
    pub async fn start() -> Result<Self, String> { ... }
    pub async fn post<T, R>(&self, path: &str, body: &T) -> Result<R, String> { ... }
}
```

### 安全存储 (`security.rs`)

```rust
// 系统密钥链密码管理
impl PasswordManager {
    pub fn get_password(connection_id: &str) -> Result<Option<String>, PasswordError> { ... }
    pub fn save_password(connection_id: &str, password: &str) -> Result<(), PasswordError> { ... }
    pub fn delete_password(connection_id: &str) -> Result<(), PasswordError> { ... }
}
```

## 约定

- **模块命名**: snake_case (`db_pool.rs`)
- **错误处理**: `Result<T, String>` 统一错误类型（Tauri 命令层）
- **异步处理**: `async/await` + `tokio` 运行时
- **本地数据库**: sqlx 仅用于本地 SQLite 配置存储
- **远程数据库**: 所有远程数据库操作通过 HTTP 转发给 Go Sidecar
- **密码安全**: 系统密钥链 (keyring crate)

## 源码改进

1. ✅ **commands.rs 重构**: 数据库操作全部通过 Go Sidecar HTTP 转发
2. ✅ **drivers 移除**: 旧的数据库驱动代码已完全删除，Rust 不再直接连接远程数据库
3. ✅ **Sidecar 架构**: 引入 Go Sidecar 处理所有数据库连接和查询
