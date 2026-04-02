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
- ✅ 多数据库类型支持
- ✅ 自定义连接分组
- ✅ 可视化数据浏览和编辑
- ✅ SQL 查询编辑器（Monaco Editor）
- ✅ ER 图与模型设计
- ✅ 数据导入导出
- ✅ 密码加密存储（系统密钥链）

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
├── src/                      # 前端源码
│   ├── components/           # React 组件
│   ├── hooks/                # Custom Hooks
│   ├── stores/               # Zustand Stores
│   ├── types/                # TypeScript 类型定义
│   ├── utils/                # 工具函数
│   └── styles/               # 全局样式
├── src-tauri/                # Rust 后端
│   ├── src/
│   │   ├── commands/         # Tauri Commands
│   │   ├── drivers/          # 数据库驱动
│   │   ├── models/           # 数据模型
│   │   └── utils/            # 工具函数
│   └── Cargo.toml
├── doc/                      # 项目文档
└── package.json
```

## 支持的数据库

| 数据库 | 状态 | 驱动 |
|--------|------|------|
| MySQL | 🟢 开发中 | sqlx |
| PostgreSQL | 🟢 开发中 | sqlx |
| SQLite | 🟢 开发中 | sqlx |
| SQL Server | 🟡 计划中 | tiberius |
| Oracle | 🟡 计划中 | rust-oracle / ODBC |
| MariaDB | 🟡 计划中 | sqlx |
| 达梦 | 🔴 评估中 | ODBC 桥接 |

## 路线图

### Phase 1: MVP (8 周)
- [x] 项目初始化
- [ ] 基础连接管理
- [ ] MySQL/PostgreSQL/SQLite支持
- [ ] 数据浏览
- [ ] SQL 编辑器基础功能

### Phase 2: 功能完善 (10 周)
- [ ] 完整数据库对象管理
- [ ] 数据导入导出
- [ ] ER 图生成
- [ ] SQL Server/Oracle/MariaDB支持
- [ ] 达梦数据库支持

### Phase 3: 高级功能 (8 周)
- [ ] 数据库同步
- [ ] 备份恢复
- [ ] 模型设计器
- [ ] 智能 SQL 辅助

### Phase 4: 优化发布 (4 周)
- [ ] 性能优化
- [ ] 全面测试
- [ ] 文档完善
- [ ] 发布准备

## 相关文档

- [需求规格说明书](./doc/01-requirements.md)
- [UI 设计文档](./doc/02-ui-design.md)
- [跨平台菜单栏实现指南](./doc/03-cross-platform-menu.md)
- [技术选型文档](./doc/04-tech-stack.md)

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

---

**注意**: 当前版本处于早期开发阶段，许多功能尚未实现。
