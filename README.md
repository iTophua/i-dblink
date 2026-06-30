# iDBLink

跨平台数据库管理工具，支持 10 种数据库，基于 Wails v2 + React 19 构建。

## 支持的数据库

MySQL · PostgreSQL · SQLite · SQL Server · Oracle · MariaDB · 达梦 · 人大金仓 · 瀚高 · VastBase

## 功能特性

**连接管理**
- 自定义分组 + 颜色标记 + 连接导入导出
- SSH 隧道 + SSL/TLS 配置
- 密码 AES-256-GCM 加密存储（机器绑定密钥）

**数据操作**
- AG Grid 可视化数据浏览与编辑
- 数据导入导出（CSV / JSON / SQL / Excel）
- 表数据复制、备份恢复

**SQL 编辑**
- Monaco Editor SQL 编辑器 + 多标签页
- 多结果集 + 执行计划分析
- SQL 片段管理 + 执行历史
- 参数化查询

**对象管理**
- 可视化表设计器（创建/修改表结构）
- 触发器 / 存储过程 / 函数 / 视图浏览
- DDL 查看器 + 视图定义
- 数据库属性查看

**其他**
- 命令面板 + 快捷键系统
- 右键上下文菜单
- 全局搜索 + 数据库内搜索
- Schema 对比
- 数据库同步
- 用户权限管理
- 暗色 / 亮色主题

**计划中**
- ER 图与模型设计

## 快速开始

### 前置要求

| 依赖 | 版本 |
|------|------|
| Go | 1.25+ |
| Node.js | 24+ |
| pnpm | 最新版 |
| Wails CLI | v2.12.0 |
| macOS | Xcode Command Line Tools |

安装 Wails CLI：

```bash
go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
```

### 安装与运行

```bash
# 克隆仓库
git clone https://github.com/your-org/i-dblink.git
cd i-dblink

# 安装依赖
pnpm install

# 开发模式（Vite 端口 5100 + Wails 原生窗口）
wails dev

# 构建生产版本
wails build                  # 产物在 build/bin/iDBLink.app/

# 打包 DMG（macOS）
pnpm package                 # 需要 create-dmg
```

## 开发命令

```bash
# 测试
pnpm test                    # 全部前端测试 (Vitest)
pnpm test:unit               # 单元测试
pnpm test:components         # 组件测试
pnpm test:hooks              # Hook 测试
pnpm test:api                # API 测试
pnpm test:integration        # 集成测试
pnpm test:e2e                # E2E 测试 (Playwright)
go test ./...                # Go 后端测试（项目根目录执行）

# 代码质量
pnpm lint                    # ESLint
pnpm lint:fix                # ESLint 自动修复
pnpm format                  # Prettier 格式化
pnpm format:check            # Prettier 检查
pnpm exec -- tsc --noEmit    # TypeScript 类型检查
```

## 项目结构

```
i-dblink/
├── main.go                          # Wails 入口 + 菜单系统（38 个菜单项）
├── backend/                         # Go 后端
│   ├── app.go                       # App struct, 50+ Wails 绑定方法
│   ├── db/                          # 10 种数据库驱动
│   ├── api/                         # 业务逻辑 handlers
│   ├── localdb/                     # SQLite 本地存储
│   ├── security.go                  # AES-256-GCM 加密
│   └── storage.go                   # 统一存储服务
├── frontend/
│   └── src/
│       ├── api/                     # Wails 绑定封装（47 个方法）
│       ├── components/              # ~39 React 组件
│       ├── hooks/                   # 6 个自定义 hooks
│       ├── stores/                  # Zustand 状态管理（3 个 store）
│       ├── styles/                  # 主题系统
│       ├── utils/                   # SQL 方言、导出工具等
│       ├── i18n/                    # 国际化（zh-CN / en-US）
│       └── __tests__/               # 前端测试（20 个文件）
├── e2e/                             # Playwright E2E 测试
├── doc/                             # 项目文档（规格、计划、测试报告）
├── scripts/                         # 构建脚本
├── build/                           # 构建产物
└── wails.json                       # Wails 项目配置
```

## 技术栈

| 层 | 技术 |
|----|------|
| 应用框架 | Wails v2 |
| 后端 | Go 1.25 |
| 前端 | React 19 + TypeScript + Vite |
| UI | Ant Design 6 |
| 状态管理 | Zustand |
| SQL 编辑器 | Monaco Editor |
| 数据网格 | AG Grid |
| 测试 | Vitest (前端) + Go testing (后端) + Playwright (E2E) |

## 架构说明

前后端通过 Wails 绑定通信：

- **前端 → 后端**：调用 `frontend/wailsjs/go/backend/App.*` 绑定方法
- **后端 → 前端**：`runtime.EventsEmit("menu-action", ...)` 事件推送
- **绑定生成**：`wails dev` 自动生成 `frontend/wailsjs/`（已 gitignore）

后端 `app.go` 通过 `httptest` 的 `callHandler` 模式复用 HTTP handler，实现 Wails 绑定与 HTTP API 的统一。

## 许可证

MIT License
