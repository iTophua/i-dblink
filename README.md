# iDBLink - 跨平台数据库管理工具

类似 Navicat Premium 的数据库客户端，支持 MySQL、PostgreSQL、SQLite、SQL Server、Oracle、MariaDB 和达梦数据库。

## 技术栈

- **前端**: React 18 + TypeScript + Vite
- **UI 框架**: Ant Design 5
- **应用框架**: Tauri v1.6 (Rust 后端)
- **状态管理**: Zustand
- **SQL 编辑器**: Monaco Editor
- **数据网格**: AG Grid

## 功能特性

- ✅ 跨平台支持（Windows、macOS、Linux）
- ✅ 多数据库类型支持（MySQL、PostgreSQL、SQLite）
- ✅ 自定义连接分组
- ✅ 可视化数据浏览和编辑（AG Grid）
- ✅ SQL 查询编辑器（Monaco Editor）
- ✅ 表设计器（可视化创建/修改表）
- ✅ SQL 执行历史记录
- ✅ SQL 多结果集显示
- ✅ 执行计划（EXPLAIN）
- ✅ 数据导入导出
- ✅ 密码加密存储（系统密钥链）
- ✅ 快捷键系统
- ✅ 多查询标签页
- ✅ 右键上下文菜单
- 🔄 SSH 隧道配置（UI 存在）
- 🔄 SSL/TLS 配置（UI 存在）
- ⏳ ER 图与模型设计（计划中）

## 开发指南

### 前置要求

确保已安装以下工具：

- Node.js 18+ 和 pnpm
- Rust 1.70+
- macOS: Xcode Command Line Tools
- Windows: Visual Studio C++ Build Tools
- Linux: gcc, make, pkg-config, libwebkit2gtk, libgtk-3

### 安装依赖

```bash
# 安装前端依赖
pnpm install

# Rust 依赖会在首次编译时自动下载
```

### 开发模式

```bash
pnpm tauri dev
```

这会同时启动 Vite 开发服务器和 Tauri 应用窗口。

### 构建发布版

```bash
pnpm tauri build
```

构建产物位于 `src-tauri/target/release/bundle/`

## 项目结构

```
i-dblink/
├── src/                      # 前端源码 (TypeScript/React)
│   ├── components/           # React 组件 (20+ 文件)
│   ├── hooks/                # 自定义 Hooks (useApi, useMenuShortcuts)
│   ├── stores/               # Zustand 状态管理
│   ├── types/                # TypeScript 类型定义
│   ├── api/                  # Tauri invoke API 封装
│   ├── constants/            # 快捷键配置
│   └── styles/               # Ant Design 主题配置
├── src-tauri/                # Rust 后端
│   ├── src/
│   │   ├── db/              # 数据库模块 (pool, models, query, repository)
│   │   ├── drivers/         # 数据库驱动抽象 (MySQL, PostgreSQL, SQLite)
│   │   ├── commands.rs       # Tauri 命令
│   │   ├── main.rs          # Rust 入口
│   │   ├── security.rs       # 密钥链安全
│   │   └── storage.rs        # 本地存储
│   └── icons/               # 应用图标
├── doc/                      # 项目文档
└── package.json
```

## 支持的数据库

| 数据库 | 状态 | 驱动 |
|--------|------|------|
| MySQL | 🟢 已实现 | sqlx |
| PostgreSQL | 🟢 已实现 | sqlx |
| SQLite | 🟢 已实现 | sqlx |
| SQL Server | 🟡 计划中 | tiberius |
| Oracle | 🟡 计划中 | rust-oracle / ODBC |
| MariaDB | 🟡 计划中 | sqlx |
| 达梦 | 🔴 评估中 | ODBC 桥接 |

## 路线图

### Phase 1: MVP
- [x] 项目初始化
- [x] 基础连接管理
- [x] MySQL/PostgreSQL/SQLite 支持
- [x] 数据浏览
- [x] SQL 编辑器基础功能
- [x] 表设计器
- [x] SQL 执行历史
- [x] 快捷键系统
- [x] 多查询标签页
- [x] 右键上下文菜单

### Phase 2: 功能完善
- [ ] 完整数据库对象管理（视图、存储过程）
- [ ] 数据导入导出
- [ ] ER 图生成
- [ ] SSH/SSL 隧道
- [ ] SQL Server/Oracle/MariaDB 支持
- [ ] 达梦数据库支持

### Phase 3: 高级功能
- [ ] 数据库同步
- [ ] 备份恢复
- [ ] 模型设计器
- [ ] 智能 SQL 辅助

### Phase 4: 优化发布
- [ ] 性能优化
- [ ] 全面测试
- [ ] 文档完善
- [ ] 发布准备

## 相关文档

- [需求规格说明书](./doc/01-requirements.md)
- [UI 设计文档](./doc/02-ui-design.md)
- [交互操作设计文档](./doc/03-interaction-design.md)
- [功能更新报告 v0.2.0](./doc/FEATURES_UPDATE_REPORT_v0.2.0.md)

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
