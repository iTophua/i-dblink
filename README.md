# iDBLink - 跨平台数据库管理工具

类似 Navicat Premium 的数据库客户端，支持 MySQL、PostgreSQL、SQLite、SQL Server、Oracle、MariaDB、达梦、人大金仓、瀚高、VastBase。

## 技术栈

- **前端**: React 19 + TypeScript + Vite
- **UI 框架**: Ant Design 6
- **应用框架**: Wails v2 (Go 后端)
- **状态管理**: Zustand
- **SQL 编辑器**: Monaco Editor
- **数据网格**: AG Grid

## 功能特性

- ✅ 跨平台支持（Windows、macOS、Linux）
- ✅ 多数据库类型支持（MySQL、PostgreSQL、SQLite、SQL Server、Oracle、MariaDB、达梦、人大金仓、瀚高、VastBase）
- ✅ 自定义连接分组 + 颜色标记
- ✅ 可视化数据浏览和编辑（AG Grid）
- ✅ SQL 查询编辑器（Monaco Editor）+ 多结果集 + 执行计划
- ✅ 表设计器（可视化创建/修改表，支持多数据库类型）
- ✅ SSH 隧道 + SSL/TLS 配置
- ✅ 数据导入导出 + 备份恢复
- ✅ 数据库同步
- ✅ 密码加密存储（AES-256-GCM + 机器绑定密钥）
- ✅ 快捷键系统 + 右键上下文菜单
- ✅ 多查询标签页 + SQL 执行历史
- ✅ 触发器/存储过程/函数浏览
- ⏳ ER 图与模型设计（计划中）

## 开发指南

### 前置要求

- Go 1.25+
- Node.js 24+ + pnpm
- macOS: Xcode Command Line Tools
- Wails CLI v2.12.0: `~/go/bin/wails`（或 `go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0`）

### 安装依赖

```bash
pnpm install
```

### 开发模式

```bash
wails dev
```

这会启动 Vite 开发服务器（端口 5100）和 Wails 原生窗口。

### 构建发布版

```bash
wails build
```

构建产物位于 `build/bin/iDBLink.app/`

### 运行测试

```bash
pnpm test       # 前端测试 (Vitest, 307 tests)
go test ./...   # Go 后端测试
pnpm lint       # ESLint
pnpm format     # Prettier
```

## 项目结构

```
i-dblink/
├── frontend/                   # 前端源码 (React 19 + TypeScript)
│   └── src/
│       ├── api/                # Wails TS 绑定封装 (47 methods)
│       ├── components/         # ~39 React 组件
│       ├── hooks/              # 5 个自定义 hooks
│       ├── stores/             # Zustand (appStore, settingsStore, workspaceStore)
│       ├── types/              # TypeScript 类型定义
│       ├── utils/              # SQL 方言、导出工具
│       └── __tests__/          # 测试文件 (20 files, 307 tests)
├── backend/                    # Go Wails 后端
│   ├── app.go                  # App struct, 50+ binding methods
│   ├── main.go                 # Wails 入口 + 38 个菜单项
│   ├── db/                     # 10 种数据库驱动
│   ├── api/                    # 业务逻辑 HTTP handlers
│   ├── localdb/                # SQLite 本地存储 (connections, groups, snippets)
│   ├── security.go             # AES-256-GCM 加密
│   └── storage.go              # 统一存储服务
├── build/bin/iDBLink.app/      # 构建产物
├── doc/                        # 项目文档
└── wails.json                  # Wails 项目配置
```

## 支持的数据库

| 数据库 | Go 驱动 |
|--------|---------|
| MySQL | go-sql-driver/mysql |
| PostgreSQL | lib/pq |
| SQLite | modernc/sqlite (纯 Go) |
| SQL Server | mssql |
| Oracle | go-ora |
| MariaDB | go-sql-driver/mysql |
| 达梦 (Dameng) | dm (官方 Go 驱动) |
| 人大金仓 (Kingbase) | gokb |
| 瀚高 (Highgo) | lib/pq |
| VastBase | lib/pq |

## 许可证

MIT License
