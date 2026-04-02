# 前端源码目录 (src/)

**目录**: `src/` - React 18 + TypeScript + Vite 前端源码

## 结构

```
src/
├── components/   # React 组件 (7 文件，500+ 行占多数)
├── hooks/        # 自定义 Hooks (useApi, useMenuShortcuts)
├── stores/       # Zustand 全局状态 (useAppStore)
├── types/        # TypeScript 类型定义 (核心类型集中)
├── api/          # Tauri invoke 封装 (12 个 API 方法)
├── styles/       # Ant Design 主题配置 (362 行常量)
├── constants/    # 快捷键配置
└── utils/        # 工具函数 (空)
```

## 核心文件

| 文件 | 作用 | 引用 |
|------|------|------|
| `types/api.ts` | 核心类型 (DatabaseType, ConnectionInput, QueryResult) | 6 |
| `stores/appStore.ts` | Zustand 全局状态 (connections, groups) | 3 |
| `api/index.ts` | Tauri invoke 封装 | 1 |
| `hooks/useApi.ts` | 业务逻辑 (连接、分组、数据库操作) | 多 |

## 组件

| 文件 | 行数 | 复杂度 | 备注 |
|------|------|--------|------|
| `MainLayout.tsx` | 783 | 高 | 500+ 行内联样式，需拆分 |
| `UIDesignShowcase.tsx` | 641 | 中 | UI 展示 (Demo) |
| `SQLEditor.tsx` | 631 | 中 | Monaco Editor SQL 编辑器 |
| `DataTable.tsx` | 523 | 中 | AG Grid 数据表格 |
| `ConnectionDialog.tsx` | 中 | 连接配置对话框 |
| `TableList.tsx` | 中 | 表列表组件 |
| `Welcome.tsx` | 低 | 欢迎页 |

## 约定

- **组件命名**: PascalCase (`ConnectionDialog.tsx`)
- **Hooks 命名**: camelCase (`useApi`, `useMenuShortcuts`)
- **状态管理**: Zustand，单一 store (`useAppStore`)
- **API 调用**: 统一通过 `api/index.ts` 封装 Tauri invoke
- **类型定义**: 集中在 `types/api.ts`

## 前端特定问题

1. **组件大文件**: 4 个组件 >500 行，`MainLayout.tsx` 达 783 行
2. **内联样式**: `MainLayout.tsx` 含 500+ 行内联样式，建议提取为 CSS-in-JS 或样式文件
3. **TODO**: 2 个待实现功能 (`TableList.tsx` 刷新按钮, `useApi.ts` 菜单操作)
