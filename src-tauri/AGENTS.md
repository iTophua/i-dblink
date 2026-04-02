# Rust 后端目录 (src-tauri/)

**目录**: `src-tauri/` - Tauri v2 (Rust) 后端

## 结构

```
src-tauri/
├── src/
│   ├── db/           # 数据库模块 (6 文件，实际内容)
│   ├── commands.rs   # Tauri 命令 (1151 行，高重复)
│   ├── main.rs       # Rust 入口
│   ├── security.rs   # 密钥链安全
│   └── storage.rs    # 本地存储
├── icons/            # 应用图标 (15 文件)
├── Cargo.toml        # Rust 依赖
└── tauri.conf.json   # Tauri 配置
```

## 核心文件

| 文件 | 行数 | 作用 | 备注 |
|------|------|------|------|
| `src/commands.rs` | 1151 | Tauri 命令实现 | 高重复，需重构 |
| `src/main.rs` | ~250 | Rust 入口、菜单初始化 | |
| `src/security.rs` | ~60 | 系统密钥链密码管理 | |
| `src/storage.rs` | ~150 | 连接配置持久化 | |
| `src/db/` | 6 文件 | 数据库模块 | 见 `src/db/AGENTS.md` |

## 数据库支持

| 数据库 | 状态 | 驱动 |
|--------|------|------|
| MySQL | ✅ 已实现 | sqlx |
| PostgreSQL | ✅ 已实现 | sqlx |
| SQLite | ✅ 已实现 | sqlx |
| SQL Server | ⏳ 计划中 | tiberius |
| Oracle | ⏳ 计划中 | rust-oracle / ODBC |
| MariaDB | ⏳ 计划中 | sqlx |
| 达梦 | ⏳ 评估中 | ODBC 桥接 |

## 约定

- **模块命名**: snake_case (`db_pool.rs`)
- **数据库驱动**: sqlx (MySQL, PostgreSQL, SQLite)
- **密码存储**: 系统密钥链 (keyring crate)
- **配置存储**: 本地 JSON 文件
- **Release 配置**: LTO 开启，codegen-units=1，panic=abort

## 后端特定问题

1. **commands.rs 需重构**: 1151 行，三种数据库连接逻辑高度重复
2. **TODO**: 1 个待实现功能 (`commands.rs` 连接测试逻辑)

## 构建

```bash
# 开发模式
pnpm tauri dev

# 构建生产版本
pnpm tauri build

# Rust 类型检查
cargo check

# Rust 格式化
cargo fmt

# Rust 代码检查
cargo clippy
```

## 后端特定注意事项

1. **权限配置**: `gen/schemas/` 为 Tauri 自动生成的 JSON Schema，勿手动修改
