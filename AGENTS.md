# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-01 22:37:12
**Commit:** N/A (not a git repo)
**Branch:** N/A

## OVERVIEW

iDBLink - 跨平台数据库管理工具（类似Navicat）。React 18 + TypeScript + Vite 前端，Tauri v2 (Rust) 后端，支持 MySQL/PostgreSQL/SQLite/SQL Server/Oracle/MariaDB/达梦。

## STRUCTURE

```
i-dblink/
├── src/                          # 前端源码 (TypeScript/React)
│   ├── api/                      # Tauri invoke API 封装 (1 文件)
│   ├── components/               # React 组件 (7 文件，复杂度高)
│   ├── hooks/                    # 自定义 Hooks (2 文件，广泛引用)
│   ├── stores/                   # Zustand 状态管理 (1 文件)
│   ├── types/                    # TypeScript 类型定义 (被 6 文件引用)
│   ├── styles/                   # Ant Design 主题配置 (362 行常量)
│   └── constants/                # 快捷键配置 (1 文件)
├── src-tauri/                    # Rust 后端
│   ├── src/
│   │   ├── db/                   # 数据库模块 (6 文件，实际内容)
│   │   ├── commands.rs           # Tauri 命令 (1151 行，高重复)
│   │   ├── main.rs               # Rust 入口
│   │   ├── security.rs           # 密钥链安全
│   │   └── storage.rs            # 本地存储
│   └── icons/                    # 应用图标 (15 文件)
├── doc/                          # 项目文档 (6 个 markdown)
└── public/                       # 静态资源
```

## WHERE TO LOOK

| 任务 | 位置 | 备注 |
|------|------|------|
| 前端组件 | `src/components/` | 7 个组件文件，500+ 行占多数 |
| 前端状态 | `src/stores/appStore.ts` | Zustand 全局状态，被 3 文件引用 |
| 前端类型 | `src/types/api.ts` | 核心类型定义，被 6 文件引用 |
| 前端 Hooks | `src/hooks/` | useApi (业务逻辑)，useMenuShortcuts (快捷键) |
| 前端 API | `src/api/index.ts` | 封装 12 个 Tauri invoke 调用 |
| Rust 入口 | `src-tauri/src/main.rs` | 应用启动、菜单初始化 |
| Rust 数据库 | `src-tauri/src/db/` | 连接池、模型、迁移、查询、仓储 |
| Rust 命令 | `src-tauri/src/commands.rs` | 数据库操作命令 (1151 行，需重构) |
| 安全存储 | `src-tauri/src/security.rs` | 系统密钥链密码管理 |
| 本地存储 | `src-tauri/src/storage.rs` | 连接配置持久化 |

## CODE MAP

| 符号 | 类型 | 位置 | 引用 | 角色 |
|------|------|------|------|------|
| `useAppStore` | Zustand Store | `src/stores/appStore.ts` | 3 | 全局状态管理 |
| `api` | API 对象 | `src/api/index.ts` | 1 | Tauri invoke 封装 |
| `useConnections` | Hook | `src/hooks/useApi.ts` | 多 | 连接 CRUD 逻辑 |
| `useGroups` | Hook | `src/hooks/useApi.ts` | 多 | 分组 CRUD 逻辑 |
| `useDatabase` | Hook | `src/hooks/useApi.ts` | 多 | 数据库查询逻辑 |
| `DatabaseType` | 类型 | `src/types/api.ts` | 6 | 数据库类型联合 |
| `ConnectionInput` | 接口 | `src/types/api.ts` | 多 | 连接输入结构 |
| `QueryResult` | 接口 | `src/types/api.ts` | 多 | 查询结果结构 |
| `PasswordManager` | Struct | `src-tauri/src/security.rs` | 多 | 密码管理 |
| `LocalStorage` | Struct | `src-tauri/src/storage.rs` | 多 | 配置存储 |

## CONVENTIONS

### 前端
- **状态管理**: Zustand，单一 store (`useAppStore`)
- **API 调用**: 统一通过 `src/api/index.ts` 封装 Tauri invoke
- **组件命名**: PascalCase (`ConnectionDialog.tsx`)
- **Hooks 命名**: camelCase (`useApi`, `useMenuShortcuts`)
- **类型定义**: 集中在 `src/types/api.ts`

### 后端
- **模块命名**: snake_case (`db_pool.rs`)
- **数据库驱动**: sqlx (MySQL, PostgreSQL, SQLite)
- **密码存储**: 系统密钥链 (keyring crate)
- **配置存储**: 本地 JSON 文件

### 配置缺失
- **无 ESLint/Prettier**: 无代码格式化规范
- **无测试框架**: 无自动化测试
- **无 CI/CD**: 无自动化构建/发布
- **无 .editorconfig**: 无编辑器配置统一

## ANTI-PATTERNS (THIS PROJECT)

1. **重复代码**: `src-tauri/src/commands.rs` 中 MySQL/PostgreSQL/SQLite 连接逻辑高度重复
2. **大文件**: 5 个文件 >500 行，`commands.rs` 达 1151 行
3. **内联样式**: `MainLayout.tsx` 含 500+ 行内联样式
4. **空目录**: `commands/`, `drivers/`, `models/`, `utils/` 为空 (预留模块化)
5. **重复嵌套**: `src-tauri/src-tauri/.dev-data` 异常路径
6. **无测试**: 零测试覆盖，3 个 TODO 待实现

## UNIQUE STYLES

1. **前后端通信**: 前端通过 `src/api/index.ts` 统一封装 Tauri `invoke` 调用
2. **状态管理**: Zustand 轻量级 store，无 Redux/Context
3. **SQL 编辑器**: Monaco Editor 集成，自定义语法高亮
4. **数据表格**: AG Grid 企业级表格，支持 CRUD
5. **快捷键系统**: 跨平台快捷键映射 (macOS/Ctrl 兼容)
6. **主题系统**: Ant Design 5 主题配置 (`src/styles/theme.ts`)

## COMMANDS

```bash
# 开发模式 (启动 Vite + Tauri)
pnpm tauri dev

# 构建生产版本
pnpm tauri build

# 安装前端依赖
pnpm install

# TypeScript 类型检查
pnpm exec tsc --noEmit
```

## NOTES

1. **项目阶段**: 早期开发 (v0.1.0)，功能不完整
2. **数据库支持**: MySQL/PostgreSQL/SQLite 已实现，SQL Server/Oracle/达梦 计划中
3. **构建产物**: `src-tauri/target/` 为 Rust 编译缓存，勿手动修改
4. **密钥存储**: 密码通过系统密钥链管理，不存明文
5. **开发端口**: Vite 固定 1420，Tauri 开发窗口自动连接
6. **文档目录**: `doc/` 含需求、UI 设计、技术选型等详细文档
