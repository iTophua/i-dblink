# 前端源码目录 (src/)

**目录**: `src/` - React 18 + TypeScript + Vite 前端源码

**最后更新**: 2026-05-03

## 结构

```
src/
├── components/   # React 组件 (20+ 文件)
├── hooks/        # 自定义 Hooks (useApi, useMenuShortcuts, useTableScrollHeight, useThemeColors, useViewStats)
├── stores/       # Zustand 全局状态 (useAppStore)
├── types/        # TypeScript 类型定义 (核心类型集中)
├── api/          # Tauri invoke 封装 (12 个 API 方法)
├── styles/       # Ant Design 主题配置 (362 行常量)
├── constants/    # 快捷键配置
└── utils/        # 工具函数 (空)
```

## 核心文件

| 文件                 | 作用                                                  | 引用 |
| -------------------- | ----------------------------------------------------- | ---- |
| `types/api.ts`       | 核心类型 (DatabaseType, ConnectionInput, QueryResult) | 6    |
| `stores/appStore.ts` | Zustand 全局状态 (connections, groups)                | 3    |
| `api/index.ts`       | Tauri invoke 封装                                     | 1    |
| `hooks/useApi.ts`    | 业务逻辑 (连接、分组、数据库操作)                     | 多   |

## 组件

| 文件                           | 行数  | 复杂度                      | 备注                             |
| ------------------------------ | ----- | --------------------------- | -------------------------------- |
| `MainLayout.tsx`               | ~1160 | 高                          | 布局组件，已集成快捷键           |
| `TabPanel/index.tsx`           | ~1127 | 中                          | 标签页管理，支持多 SQL 查询      |
| `SQLEditor.tsx`                | ~1948 | 中                          | Monaco Editor SQL 编辑器         |
| `DataTable.tsx`                | ~2636 | 中                          | AG Grid 数据表格，已实现右键菜单 |
| `ConnectionDialog.tsx`         | ~764  | 中                          | 连接配置对话框，已实现文件选择   |
| `EnhancedConnectionTree.tsx`   | ~2092 | 高                          | 连接树组件，已实现确认对话框     |
| `TableList.tsx`                | 中    | 中                          | 表列表组件                       |
| `TableDesigner/index.tsx`      | ~1034 | 中                          | 表设计器，支持多数据库类型       |
| `DatabaseProperties/index.tsx` | 新建  | 数据库属性面板              |
| `ViewDefinition/index.tsx`     | ~161  | 视图定义查看 (DDL + 列信息) |

## 约定

- **组件命名**: PascalCase (`ConnectionDialog.tsx`)
- **Hooks 命名**: camelCase (`useApi`, `useMenuShortcuts`)
- **状态管理**: Zustand，三个 store (`appStore`, `settingsStore`, `workspaceStore`)
- **API 调用**: 统一通过 `api/index.ts` 封装 Tauri invoke
- **类型定义**: 集中在 `types/api.ts`
- **不要添加注释** 除非必要
- **代码风格**: 2 空格缩进，single quotes，100 字符行宽

## 前端特定问题

1. **组件大文件**: 部分组件 >500 行，可进一步拆分
2. **内联样式**: `MainLayout.tsx` 含较多内联样式，建议提取为 CSS-in-JS 或样式文件

## 已解决问题

1. ✅ **SQL 注入漏洞** - DataTable.tsx UPDATE 语句已修复
2. ✅ **文件选择对话框** - ConnectionDialog.tsx SSL/SSH 文件选择已实现
3. ✅ **右键上下文菜单** - DataTable.tsx 行级操作菜单已实现
4. ✅ **危险操作确认对话框** - EnhancedConnectionTree.tsx 已实现
5. ✅ **快捷键系统** - MainLayout.tsx 已集成 useMenuShortcuts
6. ✅ **多查询标签页** - TabPanel/index.tsx 已支持 Tab 重命名
7. ✅ **P0 体验修复** - 禁用未实现菜单项、视图浏览、视图定义、状态栏增强、TableDesigner 保存
8. ✅ **P1 交互补齐** - 结果网格统计、单元格右键、SQL 错误高亮、表行数显示、触发器节点、TableDesigner 适配、连接颜色、数据库属性
