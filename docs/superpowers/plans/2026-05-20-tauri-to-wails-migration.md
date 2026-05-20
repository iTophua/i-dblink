# Tauri → Wails 迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 iDBLink 从 Tauri v2 (Rust) + Go Sidecar 架构迁移到 Wails v2 (Go) 单一后端架构，消除 HTTP 转发层和 Sidecar 进程管理。

**Architecture:** 保留现有 React 19 + Vite 前端，将前端从 `src/` 移至 `frontend/src/`；用 Wails Go 后端替代 Tauri Rust 后端，Rust 层的本地 SQLite 存储、密码加密、菜单系统全部迁移到 Go；现有 `go-backend/` 的数据库驱动和业务逻辑直接复用。

**Tech Stack:** React 19, Vite, TypeScript, Wails v2, Go 1.25.7, modernc.org/sqlite, crypto/aes

---

## 文件映射总览

### 新增文件
- `wails.json` - Wails 项目配置
- `backend/main.go` - Wails 入口 + 菜单系统
- `backend/app.go` - App struct + 绑定方法
- `backend/storage.go` - 本地 SQLite 存储服务
- `backend/security.go` - AES 密码加密
- `backend/localdb/models.go` - 数据模型
- `backend/localdb/pool.go` - SQLite 连接池
- `backend/localdb/repository.go` - CRUD 操作
- `backend/localdb/migrations.go` - 数据库迁移
- `frontend/src/api/index.ts` - 新 API 层（替换 Tauri invoke）

### 移动文件（内容基本不变）
- `src/` → `frontend/src/`（除 api/index.ts 外）
- `go-backend/db/` → `backend/db/`（数据库驱动）
- `go-backend/api/` → `backend/api/`（业务逻辑）
- `go-backend/models/` → `backend/models/`（数据模型）

### 删除文件
- `src-tauri/` 整个目录
- `go-backend/main.go`（替换为 Wails 入口）
- `go-backend/server.go`（HTTP 服务不再需要）
- `src/api/index.ts`（旧 Tauri API 层）

---

## Phase 1: 基础设施搭建

### Task 1: 初始化 Wails 项目结构

**Files:**
- Create: `wails.json`
- Create: `go.mod`
- Create: `.gitignore` (更新)

- [ ] **Step 1: 创建 wails.json 配置**

Create `wails.json`:
```json
{
  "$schema": "https://wails.io/schemas/config.v2.json",
  "name": "iDBLink",
  "outputfilename": "iDBLink",
  "frontend": {
    "dir": "./frontend",
    "install": "pnpm install",
    "build": "pnpm build",
    "dev": "pnpm dev",
    "package": "package.json"
  },
  "author": {
    "name": "iDBLink Team",
    "email": ""
  },
  "info": {
    "companyName": "iDBLink",
    "productName": "iDBLink",
    "productVersion": "0.1.0",
    "copyright": "",
    "comments": "A cross-platform database management tool"
  }
}
```

- [ ] **Step 2: 创建根目录 go.mod**

Create `go.mod`:
```go
module idblink

go 1.25.7

require (
	github.com/wailsapp/wails/v2 v2.12.0
)
```

- [ ] **Step 3: 更新 .gitignore**

在现有 `.gitignore` 末尾追加：
```
# Wails
build/bin/
frontend/dist/
frontend/wailsjs/
```

- [ ] **Step 4: Commit**

```bash
git add wails.json go.mod .gitignore
git commit -m "chore: initialize Wails project structure"
```

---

### Task 2: 移动前端代码到 frontend/ 目录

**Files:**
- Move: `src/` → `frontend/src/`
- Move: `public/` → `frontend/public/`
- Move: `package.json` → `frontend/package.json`
- Move: `vite.config.ts` → `frontend/vite.config.ts`
- Move: `tsconfig.json` → `frontend/tsconfig.json`
- Move: `tsconfig.app.json` → `frontend/tsconfig.app.json`
- Move: `tsconfig.node.json` → `frontend/tsconfig.node.json`
- Move: `.prettierrc.json` → `frontend/.prettierrc.json`
- Move: `eslint.config.mjs` → `frontend/eslint.config.mjs`
- Create: `frontend/index.html`（从现有 index.html 移动）

- [ ] **Step 1: 创建 frontend 目录并移动文件**

```bash
# 创建目录结构
mkdir -p frontend/src frontend/public

# 移动前端源代码
mv src/* frontend/src/
mv public/* frontend/public/ 2>/dev/null || true

# 移动配置文件
mv package.json frontend/
mv vite.config.ts frontend/
mv tsconfig.json frontend/
mv tsconfig.app.json frontend/ 2>/dev/null || true
mv tsconfig.node.json frontend/ 2>/dev/null || true
mv .prettierrc.json frontend/ 2>/dev/null || true
mv eslint.config.mjs frontend/ 2>/dev/null || true
mv index.html frontend/ 2>/dev/null || true
```

- [ ] **Step 2: 更新前端 package.json 中的路径**

修改 `frontend/package.json`，确保 scripts 路径正确：
```json
{
  "name": "idblink-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:e2e": "playwright test",
    "test:unit": "vitest run src/__tests__/unit",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write \"src/**/*.{ts,tsx,json,css,md}\""
  },
  "dependencies": {
    "@ant-design/icons": "^6.2.2",
    "@dnd-kit/core": "^6.3.1",
    "@dnd-kit/sortable": "^10.0.0",
    "@dnd-kit/utilities": "^3.2.2",
    "@monaco-editor/react": "^4.7.0",
    "@types/dagre": "^0.7.54",
    "@xyflow/react": "^12.10.2",
    "ag-grid-community": "^35.3.0",
    "ag-grid-react": "^35.3.0",
    "antd": "^6.4.2",
    "dagre": "^0.8.5",
    "html-to-image": "^1.11.13",
    "i18next": "^26.0.8",
    "monaco-editor": "^0.55.1",
    "react": "^19.2.5",
    "react-dom": "^19.2.5",
    "react-hotkeys-hook": "^5.3.0",
    "react-i18next": "^17.0.6",
    "sql-formatter": "^15.7.3",
    "xlsx": "^0.18.5",
    "zustand": "^5.0.12"
  },
  "devDependencies": {
    "@eslint/js": "^10.0.1",
    "@playwright/test": "^1.59.1",
    "@testing-library/dom": "^10.4.1",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@testing-library/user-event": "^14.6.1",
    "@types/node": "^25.6.0",
    "@types/react": "^19.2.14",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^6.0.1",
    "esbuild": "^0.28.0",
    "eslint": "^10.3.0",
    "eslint-config-prettier": "^10.1.8",
    "eslint-plugin-react-hooks": "^7.1.1",
    "eslint-plugin-react-refresh": "^0.5.2",
    "globals": "^17.6.0",
    "jsdom": "^29.1.1",
    "msw": "^2.14.2",
    "prettier": "^3.8.3",
    "typescript": "^6.0.3",
    "typescript-eslint": "^8.59.1",
    "vite": "^8.0.10",
    "vite-plugin-monaco-editor": "^1.1.0",
    "vitest": "^4.1.5"
  }
}
```

注意：移除了 `@tauri-apps/api` 和 `@tauri-apps/cli` 依赖。

- [ ] **Step 3: 创建根目录 package.json**

Create `package.json` (根目录):
```json
{
  "name": "idblink",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "dev": "cd frontend && pnpm dev",
    "build": "cd frontend && pnpm build",
    "test": "cd frontend && pnpm test",
    "lint": "cd frontend && pnpm lint",
    "format": "cd frontend && pnpm format",
    "wails:dev": "wails dev",
    "wails:build": "wails build"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/ package.json
git commit -m "chore: move frontend code to frontend/ directory"
```

---

## Phase 2: Go 后端核心模块

### Task 3: 创建本地数据库模块 (SQLite)

**Files:**
- Create: `backend/localdb/models.go`
- Create: `backend/localdb/pool.go`
- Create: `backend/localdb/migrations.go`
- Create: `backend/localdb/repository.go`

- [ ] **Step 1: 创建数据模型**

Create `backend/localdb/models.go`:
```go
package localdb

import "time"

// DbConnection 数据库连接配置
type DbConnection struct {
	ID                 string     `json:"id" db:"id"`
	Name               string     `json:"name" db:"name"`
	DbType             string     `json:"db_type" db:"db_type"`
	Host               string     `json:"host" db:"host"`
	Port               int        `json:"port" db:"port"`
	Username           string     `json:"username" db:"username"`
	Database           *string    `json:"database,omitempty" db:"database"`
	GroupID            *string    `json:"group_id,omitempty" db:"group_id"`
	Color              *string    `json:"color,omitempty" db:"color"`
	SSHHost            *string    `json:"ssh_host,omitempty" db:"ssh_host"`
	SSHPort            *string    `json:"ssh_port,omitempty" db:"ssh_port"`
	SSHUsername        *string    `json:"ssh_username,omitempty" db:"ssh_username"`
	SSHAuthMethod      *string    `json:"ssh_auth_method,omitempty" db:"ssh_auth_method"`
	SSHPrivateKeyPath  *string    `json:"ssh_private_key_path,omitempty" db:"ssh_private_key_path"`
	SSLEnabled         *string    `json:"ssl_enabled,omitempty" db:"ssl_enabled"`
	SSLCAPath          *string    `json:"ssl_ca_path,omitempty" db:"ssl_ca_path"`
	SSLCertPath        *string    `json:"ssl_cert_path,omitempty" db:"ssl_cert_path"`
	SSLKeyPath         *string    `json:"ssl_key_path,omitempty" db:"ssl_key_path"`
	SSLSkipVerify      *string    `json:"ssl_skip_verify,omitempty" db:"ssl_skip_verify"`
	CreatedAt          time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at" db:"updated_at"`
}

// ConnectionGroup 连接分组
type ConnectionGroup struct {
	ID        string     `json:"id" db:"id"`
	Name      string     `json:"name" db:"name"`
	Icon      string     `json:"icon" db:"icon"`
	Color     string     `json:"color" db:"color"`
	ParentID  *string    `json:"parent_id,omitempty" db:"parent_id"`
	SortOrder int        `json:"sort_order" db:"sort_order"`
	CreatedAt time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt time.Time  `json:"updated_at" db:"updated_at"`
}

// Snippet 代码片段
type Snippet struct {
	ID        string     `json:"id" db:"id"`
	Name      string     `json:"name" db:"name"`
	SQLText   string     `json:"sql_text" db:"sql_text"`
	DbType    *string    `json:"db_type,omitempty" db:"db_type"`
	Category  *string    `json:"category,omitempty" db:"category"`
	Tags      *string    `json:"tags,omitempty" db:"tags"`
	IsPrivate bool       `json:"is_private" db:"is_private"`
	CreatedAt time.Time  `json:"created_at" db:"created_at"`
	UpdatedAt time.Time  `json:"updated_at" db:"updated_at"`
}
```

- [ ] **Step 2: 创建连接池**

Create `backend/localdb/pool.go`:
```go
package localdb

import (
	"database/sql"
	"fmt"
	"time"

	_ "modernc.org/sqlite"
)

// Pool SQLite 连接池包装器
type Pool struct {
	db *sql.DB
}

// NewPool 创建新的 SQLite 连接池
func NewPool(dbPath string) (*Pool, error) {
	// 使用 file: URI 格式
	uri := fmt.Sprintf("file:%s?mode=rwc&cache=shared", dbPath)

	db, err := sql.Open("sqlite", uri)
	if err != nil {
		return nil, fmt.Errorf("failed to open sqlite: %w", err)
	}

	db.SetMaxOpenConns(5)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(10 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("failed to ping sqlite: %w", err)
	}

	return &Pool{db: db}, nil
}

// Close 关闭连接池
func (p *Pool) Close() error {
	return p.db.Close()
}

// DB 获取底层数据库连接
func (p *Pool) DB() *sql.DB {
	return p.db
}
```

- [ ] **Step 3: 创建迁移脚本**

Create `backend/localdb/migrations.go`:
```go
package localdb

import (
	"database/sql"
	"fmt"
)

// RunMigrations 运行数据库迁移
func RunMigrations(db *sql.DB) error {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS connections (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			db_type TEXT NOT NULL,
			host TEXT NOT NULL,
			port INTEGER NOT NULL,
			username TEXT NOT NULL,
			database TEXT,
			group_id TEXT,
			color TEXT,
			ssh_host TEXT,
			ssh_port TEXT,
			ssh_username TEXT,
			ssh_auth_method TEXT,
			ssh_private_key_path TEXT,
			ssl_enabled TEXT,
			ssl_ca_path TEXT,
			ssl_cert_path TEXT,
			ssl_key_path TEXT,
			ssl_skip_verify TEXT,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS connection_groups (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			icon TEXT NOT NULL,
			color TEXT NOT NULL,
			parent_id TEXT,
			sort_order INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS connection_passwords (
			connection_id TEXT PRIMARY KEY,
			password TEXT NOT NULL,
			FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS snippets (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			sql_text TEXT NOT NULL,
			db_type TEXT,
			category TEXT DEFAULT '通用',
			tags TEXT,
			is_private BOOLEAN DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS connection_history (
			id TEXT PRIMARY KEY,
			connection_id TEXT NOT NULL,
			action TEXT NOT NULL,
			success BOOLEAN NOT NULL,
			error_message TEXT,
			created_at TEXT NOT NULL,
			FOREIGN KEY (connection_id) REFERENCES connections(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS app_config (
			key TEXT PRIMARY KEY,
			value TEXT NOT NULL,
			updated_at TEXT NOT NULL
		)`,
		`CREATE INDEX IF NOT EXISTS idx_connections_group_id ON connections(group_id)`,
		`CREATE INDEX IF NOT EXISTS idx_connections_name ON connections(name)`,
		`CREATE INDEX IF NOT EXISTS idx_connection_groups_sort_name ON connection_groups(sort_order, name)`,
		`CREATE INDEX IF NOT EXISTS idx_snippets_category ON snippets(category)`,
		`CREATE INDEX IF NOT EXISTS idx_snippets_db_type ON snippets(db_type)`,
		`INSERT OR IGNORE INTO connection_groups (id, name, icon, color, parent_id, sort_order, created_at, updated_at)
		 VALUES ('default', '未分组', '📁', '#6d6d6d', NULL, 0, datetime('now'), datetime('now'))`,
	}

	for i, migration := range migrations {
		if _, err := db.Exec(migration); err != nil {
			return fmt.Errorf("migration %d failed: %w", i, err)
		}
	}

	return nil
}
```

- [ ] **Step 4: 创建 Repository**

Create `backend/localdb/repository.go`:
```go
package localdb

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
)

// ConnectionRepository 连接配置仓库
type ConnectionRepository struct {
	pool *Pool
}

// NewConnectionRepository 创建连接仓库
func NewConnectionRepository(pool *Pool) *ConnectionRepository {
	return &ConnectionRepository{pool: pool}
}

// GetAll 获取所有连接
func (r *ConnectionRepository) GetAll() ([]DbConnection, error) {
	rows, err := r.pool.DB().Query("SELECT id, name, db_type, host, port, username, database, group_id, color, ssh_host, ssh_port, ssh_username, ssh_auth_method, ssh_private_key_path, ssl_enabled, ssl_ca_path, ssl_cert_path, ssl_key_path, ssl_skip_verify, created_at, updated_at FROM connections ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var connections []DbConnection
	for rows.Next() {
		var c DbConnection
		err := rows.Scan(&c.ID, &c.Name, &c.DbType, &c.Host, &c.Port, &c.Username, &c.Database, &c.GroupID, &c.Color,
			&c.SSHHost, &c.SSHPort, &c.SSHUsername, &c.SSHAuthMethod, &c.SSHPrivateKeyPath,
			&c.SSLEnabled, &c.SSLCAPath, &c.SSLCertPath, &c.SSLKeyPath, &c.SSLSkipVerify,
			&c.CreatedAt, &c.UpdatedAt)
		if err != nil {
			return nil, err
		}
		connections = append(connections, c)
	}
	return connections, rows.Err()
}

// GetByID 根据 ID 获取连接
func (r *ConnectionRepository) GetByID(id string) (*DbConnection, error) {
	var c DbConnection
	err := r.pool.DB().QueryRow("SELECT id, name, db_type, host, port, username, database, group_id, color, ssh_host, ssh_port, ssh_username, ssh_auth_method, ssh_private_key_path, ssl_enabled, ssl_ca_path, ssl_cert_path, ssl_key_path, ssl_skip_verify, created_at, updated_at FROM connections WHERE id = ?", id).Scan(
		&c.ID, &c.Name, &c.DbType, &c.Host, &c.Port, &c.Username, &c.Database, &c.GroupID, &c.Color,
		&c.SSHHost, &c.SSHPort, &c.SSHUsername, &c.SSHAuthMethod, &c.SSHPrivateKeyPath,
		&c.SSLEnabled, &c.SSLCAPath, &c.SSLCertPath, &c.SSLKeyPath, &c.SSLSkipVerify,
		&c.CreatedAt, &c.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &c, nil
}

// Save 保存连接（新增或更新）
func (r *ConnectionRepository) Save(conn *DbConnection) error {
	now := time.Now().UTC().Format(time.RFC3339)
	conn.UpdatedAt, _ = time.Parse(time.RFC3339, now)

	var exists bool
	err := r.pool.DB().QueryRow("SELECT 1 FROM connections WHERE id = ?", conn.ID).Scan(&exists)
	exists = (err == nil)

	if exists {
		_, err = r.pool.DB().Exec(`
			UPDATE connections SET name = ?, db_type = ?, host = ?, port = ?, username = ?, database = ?, group_id = ?, color = ?,
			ssh_host = ?, ssh_port = ?, ssh_username = ?, ssh_auth_method = ?, ssh_private_key_path = ?,
			ssl_enabled = ?, ssl_ca_path = ?, ssl_cert_path = ?, ssl_key_path = ?, ssl_skip_verify = ?,
			updated_at = ? WHERE id = ?`,
			conn.Name, conn.DbType, conn.Host, conn.Port, conn.Username, conn.Database, conn.GroupID, conn.Color,
			conn.SSHHost, conn.SSHPort, conn.SSHUsername, conn.SSHAuthMethod, conn.SSHPrivateKeyPath,
			conn.SSLEnabled, conn.SSLCAPath, conn.SSLCertPath, conn.SSLKeyPath, conn.SSLSkipVerify,
			now, conn.ID)
	} else {
		if conn.ID == "" {
			conn.ID = uuid.New().String()
		}
		conn.CreatedAt, _ = time.Parse(time.RFC3339, now)
		_, err = r.pool.DB().Exec(`
			INSERT INTO connections (id, name, db_type, host, port, username, database, group_id, color,
			ssh_host, ssh_port, ssh_username, ssh_auth_method, ssh_private_key_path,
			ssl_enabled, ssl_ca_path, ssl_cert_path, ssl_key_path, ssl_skip_verify,
			created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			conn.ID, conn.Name, conn.DbType, conn.Host, conn.Port, conn.Username, conn.Database, conn.GroupID, conn.Color,
			conn.SSHHost, conn.SSHPort, conn.SSHUsername, conn.SSHAuthMethod, conn.SSHPrivateKeyPath,
			conn.SSLEnabled, conn.SSLCAPath, conn.SSLCertPath, conn.SSLKeyPath, conn.SSLSkipVerify,
			now, now)
	}
	return err
}

// Delete 删除连接
func (r *ConnectionRepository) Delete(id string) error {
	_, err := r.pool.DB().Exec("DELETE FROM connections WHERE id = ?", id)
	return err
}

// GetPassword 获取连接密码
func (r *ConnectionRepository) GetPassword(connectionID string) (*string, error) {
	var password string
	err := r.pool.DB().QueryRow("SELECT password FROM connection_passwords WHERE connection_id = ?", connectionID).Scan(&password)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &password, nil
}

// SavePassword 保存连接密码
func (r *ConnectionRepository) SavePassword(connectionID, password string) error {
	_, err := r.pool.DB().Exec(`
		INSERT INTO connection_passwords (connection_id, password) VALUES (?, ?)
		ON CONFLICT(connection_id) DO UPDATE SET password = excluded.password`,
		connectionID, password)
	return err
}

// DeletePassword 删除连接密码
func (r *ConnectionRepository) DeletePassword(connectionID string) error {
	_, err := r.pool.DB().Exec("DELETE FROM connection_passwords WHERE connection_id = ?", connectionID)
	return err
}

// GroupRepository 分组仓库
type GroupRepository struct {
	pool *Pool
}

// NewGroupRepository 创建分组仓库
func NewGroupRepository(pool *Pool) *GroupRepository {
	return &GroupRepository{pool: pool}
}

// GetAll 获取所有分组
func (r *GroupRepository) GetAll() ([]ConnectionGroup, error) {
	rows, err := r.pool.DB().Query("SELECT id, name, icon, color, parent_id, sort_order, created_at, updated_at FROM connection_groups ORDER BY sort_order, name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var groups []ConnectionGroup
	for rows.Next() {
		var g ConnectionGroup
		err := rows.Scan(&g.ID, &g.Name, &g.Icon, &g.Color, &g.ParentID, &g.SortOrder, &g.CreatedAt, &g.UpdatedAt)
		if err != nil {
			return nil, err
		}
		groups = append(groups, g)
	}
	return groups, rows.Err()
}

// Save 保存分组
func (r *GroupRepository) Save(group *ConnectionGroup) error {
	now := time.Now().UTC().Format(time.RFC3339)
	group.UpdatedAt, _ = time.Parse(time.RFC3339, now)

	var exists bool
	err := r.pool.DB().QueryRow("SELECT 1 FROM connection_groups WHERE id = ?", group.ID).Scan(&exists)
	exists = (err == nil)

	if exists {
		_, err = r.pool.DB().Exec(`
			UPDATE connection_groups SET name = ?, icon = ?, color = ?, parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?`,
			group.Name, group.Icon, group.Color, group.ParentID, group.SortOrder, now, group.ID)
	} else {
		if group.ID == "" {
			group.ID = uuid.New().String()
		}
		group.CreatedAt, _ = time.Parse(time.RFC3339, now)
		_, err = r.pool.DB().Exec(`
			INSERT INTO connection_groups (id, name, icon, color, parent_id, sort_order, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			group.ID, group.Name, group.Icon, group.Color, group.ParentID, group.SortOrder, now, now)
	}
	return err
}

// Delete 删除分组
func (r *GroupRepository) Delete(id string) error {
	if id == "default" {
		return fmt.Errorf("cannot delete default group")
	}

	// 将属于该分组的连接移到默认分组
	_, err := r.pool.DB().Exec("UPDATE connections SET group_id = 'default' WHERE group_id = ?", id)
	if err != nil {
		return err
	}

	_, err = r.pool.DB().Exec("DELETE FROM connection_groups WHERE id = ?", id)
	return err
}

// SnippetRepository 代码片段仓库
type SnippetRepository struct {
	pool *Pool
}

// NewSnippetRepository 创建代码片段仓库
func NewSnippetRepository(pool *Pool) *SnippetRepository {
	return &SnippetRepository{pool: pool}
}

// GetAll 获取所有代码片段
func (r *SnippetRepository) GetAll() ([]Snippet, error) {
	rows, err := r.pool.DB().Query("SELECT id, name, sql_text, db_type, category, tags, is_private, created_at, updated_at FROM snippets ORDER BY category, name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var snippets []Snippet
	for rows.Next() {
		var s Snippet
		err := rows.Scan(&s.ID, &s.Name, &s.SQLText, &s.DbType, &s.Category, &s.Tags, &s.IsPrivate, &s.CreatedAt, &s.UpdatedAt)
		if err != nil {
			return nil, err
		}
		snippets = append(snippets, s)
	}
	return snippets, rows.Err()
}

// Save 保存代码片段
func (r *SnippetRepository) Save(snippet *Snippet) error {
	now := time.Now().UTC().Format(time.RFC3339)
	snippet.UpdatedAt, _ = time.Parse(time.RFC3339, now)

	var exists bool
	err := r.pool.DB().QueryRow("SELECT 1 FROM snippets WHERE id = ?", snippet.ID).Scan(&exists)
	exists = (err == nil)

	if exists {
		_, err = r.pool.DB().Exec(`
			UPDATE snippets SET name = ?, sql_text = ?, db_type = ?, category = ?, tags = ?, is_private = ?, updated_at = ? WHERE id = ?`,
			snippet.Name, snippet.SQLText, snippet.DbType, snippet.Category, snippet.Tags, snippet.IsPrivate, now, snippet.ID)
	} else {
		if snippet.ID == "" {
			snippet.ID = uuid.New().String()
		}
		snippet.CreatedAt, _ = time.Parse(time.RFC3339, now)
		_, err = r.pool.DB().Exec(`
			INSERT INTO snippets (id, name, sql_text, db_type, category, tags, is_private, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			snippet.ID, snippet.Name, snippet.SQLText, snippet.DbType, snippet.Category, snippet.Tags, snippet.IsPrivate, now, now)
	}
	return err
}

// Delete 删除代码片段
func (r *SnippetRepository) Delete(id string) error {
	_, err := r.pool.DB().Exec("DELETE FROM snippets WHERE id = ?", id)
	return err
}
```

- [ ] **Step 5: Commit**

```bash
git add backend/localdb/
git commit -m "feat: add local SQLite storage module in Go"
```

---

### Task 4: 创建安全加密模块

**Files:**
- Create: `backend/security.go`

- [ ] **Step 1: 实现 AES-256-GCM 加密**

Create `backend/security.go`:
```go
package backend

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
)

var (
	keyOnce sync.Once
	key     []byte
)

// getMachineID 获取机器标识（与 Rust 版本一致）
func getMachineID() string {
	var id strings.Builder

	// macOS: 使用 IOPlatformUUID
	if runtime.GOOS == "darwin" {
		if out, err := exec.Command("ioreg", "-rd1", "-c", "IOPlatformExpertDevice").Output(); err == nil {
			stdout := string(out)
			if idx := strings.Index(stdout, "IOPlatformUUID"); idx != -1 {
				rest := stdout[idx:]
				if start := strings.Index(rest, `"`); start != -1 {
					uuidPart := rest[start+1:]
					if end := strings.Index(uuidPart, `"`); end != -1 {
						id.WriteString(uuidPart[:end])
					}
				}
			}
		}
	}

	// 如果 macOS UUID 没获取到，或其他平台，使用 hostname
	if id.Len() == 0 {
		if hostname, err := os.Hostname(); err == nil {
			id.WriteString(hostname)
		} else {
			id.WriteString("default-host")
		}
	}

	// 用户名
	if user := os.Getenv("USER"); user != "" {
		id.WriteString(user)
	} else if user := os.Getenv("USERNAME"); user != "" {
		id.WriteString(user)
	} else {
		id.WriteString("default-user")
	}

	// 应用标识
	id.WriteString("i-dblink")

	return id.String()
}

// getKey 获取加密密钥（32 字节）
func getKey() []byte {
	keyOnce.Do(func() {
		machineID := getMachineID()
		hash := sha256.Sum256([]byte(machineID))
		key = hash[:]
	})
	return key
}

// EncryptPassword 加密密码
func EncryptPassword(password string) (string, error) {
	block, err := aes.NewCipher(getKey())
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("failed to generate nonce: %w", err)
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(password), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

// DecryptPassword 解密密码
func DecryptPassword(encrypted string) (string, error) {
	data, err := base64.StdEncoding.DecodeString(encrypted)
	if err != nil {
		return "", fmt.Errorf("invalid base64: %w", err)
	}

	block, err := aes.NewCipher(getKey())
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("failed to create GCM: %w", err)
	}

	nonceSize := gcm.NonceSize()
	if len(data) < nonceSize {
		return "", fmt.Errorf("invalid encrypted data")
	}

	nonce, ciphertext := data[:nonceSize], data[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decryption failed: %w", err)
	}

	return string(plaintext), nil
}
```

- [ ] **Step 2: 编写测试**

Create `backend/security_test.go`:
```go
package backend

import "testing"

func TestEncryptDecrypt(t *testing.T) {
	password := "my_secret_password_123!"
	encrypted, err := EncryptPassword(password)
	if err != nil {
		t.Fatalf("EncryptPassword failed: %v", err)
	}

	decrypted, err := DecryptPassword(encrypted)
	if err != nil {
		t.Fatalf("DecryptPassword failed: %v", err)
	}

	if decrypted != password {
		t.Errorf("decrypted password mismatch: got %q, want %q", decrypted, password)
	}
}

func TestSameMachineSameKey(t *testing.T) {
	key1 := getKey()
	key2 := getKey()

	for i := range key1 {
		if key1[i] != key2[i] {
			t.Error("key mismatch on same machine")
			break
		}
	}
}
```

- [ ] **Step 3: 运行测试**

```bash
cd backend && go test -v ./... -run TestEncrypt
```

Expected: 2 PASS

- [ ] **Step 4: Commit**

```bash
git add backend/security.go backend/security_test.go
git commit -m "feat: add AES-256-GCM password encryption in Go"
```

---

### Task 5: 创建存储服务层

**Files:**
- Create: `backend/storage.go`

- [ ] **Step 1: 实现 Storage 服务**

Create `backend/storage.go`:
```go
package backend

import (
	"fmt"
	"os"
	"path/filepath"

	"idblink/backend/localdb"
)

// Storage 统一存储服务
type Storage struct {
	pool              *localdb.Pool
	connectionRepo    *localdb.ConnectionRepository
	groupRepo         *localdb.GroupRepository
	snippetRepo       *localdb.SnippetRepository
}

// NewStorage 创建存储服务
func NewStorage(dataDir string) (*Storage, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data dir: %w", err)
	}

	dbPath := filepath.Join(dataDir, "connections.db")
	pool, err := localdb.NewPool(dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create pool: %w", err)
	}

	if err := localdb.RunMigrations(pool.DB()); err != nil {
		pool.Close()
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	return &Storage{
		pool:           pool,
		connectionRepo: localdb.NewConnectionRepository(pool),
		groupRepo:      localdb.NewGroupRepository(pool),
		snippetRepo:    localdb.NewSnippetRepository(pool),
	}, nil
}

// Close 关闭存储
func (s *Storage) Close() error {
	return s.pool.Close()
}

// GetConnections 获取所有连接（不包含密码）
func (s *Storage) GetConnections() ([]localdb.DbConnection, error) {
	return s.connectionRepo.GetAll()
}

// GetConnectionWithPassword 获取连接详情（包含密码）
func (s *Storage) GetConnectionWithPassword(id string) (*localdb.DbConnection, *string, error) {
	conn, err := s.connectionRepo.GetByID(id)
	if err != nil {
		return nil, nil, err
	}
	if conn == nil {
		return nil, nil, nil
	}

	encrypted, err := s.connectionRepo.GetPassword(id)
	if err != nil {
		return nil, nil, err
	}

	var password *string
	if encrypted != nil {
		decrypted, err := DecryptPassword(*encrypted)
		if err == nil {
			password = &decrypted
		}
	}

	return conn, password, nil
}

// SaveConnection 保存连接
func (s *Storage) SaveConnection(conn *localdb.DbConnection, password *string) error {
	if err := s.connectionRepo.Save(conn); err != nil {
		return err
	}

	if password != nil && *password != "" {
		encrypted, err := EncryptPassword(*password)
		if err != nil {
			return fmt.Errorf("encryption error: %w", err)
		}
		if err := s.connectionRepo.SavePassword(conn.ID, encrypted); err != nil {
			return err
		}
	}

	return nil
}

// UpdateConnection 更新连接
func (s *Storage) UpdateConnection(id string, conn *localdb.DbConnection, newPassword *string) error {
	conn.ID = id
	if err := s.connectionRepo.Save(conn); err != nil {
		return err
	}

	if newPassword != nil && *newPassword != "" {
		encrypted, err := EncryptPassword(*newPassword)
		if err != nil {
			return fmt.Errorf("encryption error: %w", err)
		}
		if err := s.connectionRepo.SavePassword(id, encrypted); err != nil {
			return err
		}
	}

	return nil
}

// DeleteConnection 删除连接
func (s *Storage) DeleteConnection(id string) error {
	if err := s.connectionRepo.DeletePassword(id); err != nil {
		return err
	}
	return s.connectionRepo.Delete(id)
}

// GetGroups 获取所有分组
func (s *Storage) GetGroups() ([]localdb.ConnectionGroup, error) {
	return s.groupRepo.GetAll()
}

// SaveGroup 保存分组
func (s *Storage) SaveGroup(group *localdb.ConnectionGroup) error {
	return s.groupRepo.Save(group)
}

// DeleteGroup 删除分组
func (s *Storage) DeleteGroup(id string) error {
	return s.groupRepo.Delete(id)
}

// UpdateConnectionPassword 更新连接密码
func (s *Storage) UpdateConnectionPassword(id string, password string) error {
	encrypted, err := EncryptPassword(password)
	if err != nil {
		return fmt.Errorf("encryption error: %w", err)
	}
	return s.connectionRepo.SavePassword(id, encrypted)
}

// GetSnippets 获取所有代码片段
func (s *Storage) GetSnippets() ([]localdb.Snippet, error) {
	return s.snippetRepo.GetAll()
}

// SaveSnippet 保存代码片段
func (s *Storage) SaveSnippet(snippet *localdb.Snippet) error {
	return s.snippetRepo.Save(snippet)
}

// DeleteSnippet 删除代码片段
func (s *Storage) DeleteSnippet(id string) error {
	return s.snippetRepo.Delete(id)
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/storage.go
git commit -m "feat: add storage service layer"
```

---

### Task 6: 移动并改造 Go 后端代码

**Files:**
- Move: `go-backend/db/` → `backend/db/`
- Move: `go-backend/api/` → `backend/api/`
- Move: `go-backend/models/` → `backend/models/`
- Delete: `go-backend/main.go`
- Delete: `go-backend/server.go`
- Update: `go-backend/go.mod` → `backend/` 整合到根 `go.mod`

- [ ] **Step 1: 移动数据库驱动和业务逻辑**

```bash
# 移动数据库驱动
mkdir -p backend/db backend/api backend/models
mv go-backend/db/* backend/db/
mv go-backend/api/* backend/api/
mv go-backend/models/* backend/models/

# 删除旧的 HTTP 服务入口
rm -f go-backend/main.go go-backend/server.go
```

- [ ] **Step 2: 更新 Go 模块路径**

更新所有 Go 文件中的 import 路径，将 `idblink-backend/` 改为 `idblink/backend/`：

```bash
# 使用 sed 批量替换（macOS 版本）
find backend -name "*.go" -exec sed -i '' 's|idblink-backend/|idblink/backend/|g' {} +
```

- [ ] **Step 3: 更新根 go.mod**

更新 `go.mod`，添加 Go 后端所需依赖：

```go
module idblink

go 1.25.7

require (
	github.com/wailsapp/wails/v2 v2.12.0
	github.com/google/uuid v1.6.0
	modernc.org/sqlite v1.28.0
	// ... 其他 go-backend 的依赖
)
```

注意：需要运行 `go mod tidy` 自动解析所有依赖。

- [ ] **Step 4: 验证 Go 代码编译**

```bash
go mod tidy
go build ./backend/...
```

Expected: 编译成功，无错误

- [ ] **Step 5: Commit**

```bash
git add backend/db/ backend/api/ backend/models/ go.mod go.sum
git rm -r go-backend/
git commit -m "feat: migrate Go backend code to backend/ directory"
```

---

### Task 7: 创建 Wails App 和绑定方法

**Files:**
- Create: `backend/app.go`
- Create: `backend/main.go`

- [ ] **Step 1: 创建 App 结构**

Create `backend/app.go`:
```go
package backend

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"runtime"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"idblink/backend/api"
	"idblink/backend/db"
	"idblink/backend/localdb"
	"idblink/backend/models"
)

// App Wails 应用结构
type App struct {
	ctx       context.Context
	storage   *Storage
	dbManager *db.Manager
}

// NewApp 创建新应用
func NewApp() *App {
	return &App{}
}

// Startup 应用启动时调用（Wails 生命周期）
func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx

	// 初始化存储
	dataDir := a.getDataDir()
	storage, err := NewStorage(dataDir)
	if err != nil {
		runtime.LogErrorf(ctx, "Failed to initialize storage: %v", err)
		return
	}
	a.storage = storage

	// 初始化数据库管理器
	a.dbManager = db.NewManager()
}

// Shutdown 应用关闭时调用
func (a *App) Shutdown(ctx context.Context) {
	if a.dbManager != nil {
		a.dbManager.CloseAll()
	}
	if a.storage != nil {
		a.storage.Close()
	}
}

// getDataDir 获取数据目录
func (a *App) getDataDir() string {
	// 开发模式使用项目目录
	if runtime.Environment(a.ctx).BuildType == "dev" {
		exe, _ := os.Executable()
		return filepath.Join(filepath.Dir(exe), "..", "..", ".dev-data")
	}

	// 生产模式使用系统应用数据目录
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".idblink", "data")
}

// Greet 测试方法
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello, %s! Welcome to iDBLink!", name)
}
```

- [ ] **Step 2: 添加连接管理绑定方法**

在 `backend/app.go` 中追加：

```go
// === 连接管理 ===

// TestConnectionInput 测试连接输入
type TestConnectionInput struct {
	DbType            string `json:"dbType"`
	Host              string `json:"host"`
	Port              int    `json:"port"`
	Username          string `json:"username"`
	Password          string `json:"password"`
	Database          string `json:"database,omitempty"`
	SSHEnabled        bool   `json:"ssh_enabled,omitempty"`
	SSHHost           string `json:"ssh_host,omitempty"`
	SSHPort           int    `json:"ssh_port,omitempty"`
	SSHUsername       string `json:"ssh_username,omitempty"`
	SSHAuthMethod     string `json:"ssh_auth_method,omitempty"`
	SSHPassword       string `json:"ssh_password,omitempty"`
	SSHPrivateKeyPath string `json:"ssh_private_key_path,omitempty"`
	SSHPassphrase     string `json:"ssh_passphrase,omitempty"`
	SSLEnabled        bool   `json:"ssl_enabled,omitempty"`
	SSLCAPath         string `json:"ssl_ca_path,omitempty"`
	SSLCertPath       string `json:"ssl_cert_path,omitempty"`
	SSLKeyPath        string `json:"ssl_key_path,omitempty"`
	SSLSkipVerify     bool   `json:"ssl_skip_verify,omitempty"`
}

// TestConnection 测试数据库连接
func (a *App) TestConnection(input TestConnectionInput) error {
	req := models.ConnectRequest{
		DbType:            input.DbType,
		Host:              input.Host,
		Port:              input.Port,
		Username:          input.Username,
		Password:          input.Password,
		Database:          input.Database,
		SSHEnabled:        input.SSHEnabled,
		SSHHost:           input.SSHHost,
		SSHPort:           input.SSHPort,
		SSHUsername:       input.SSHUsername,
		SSHAuthMethod:     input.SSHAuthMethod,
		SSHPassword:       input.SSHPassword,
		SSHPrivateKeyPath: input.SSHPrivateKeyPath,
		SSHPassphrase:     input.SSHPassphrase,
		SSLEnabled:        input.SSLEnabled,
		SSLCAPath:         input.SSLCAPath,
		SSLCertPath:       input.SSLCertPath,
		SSLKeyPath:        input.SSLKeyPath,
		SSLSkipVerify:     input.SSLSkipVerify,
	}

	// 使用 api 包中的测试逻辑
	return api.TestConnection(req)
}

// ConnectionOutput 返回给前端的连接对象
type ConnectionOutput struct {
	ID         string  `json:"id"`
	Name       string  `json:"name"`
	DbType     string  `json:"db_type"`
	Host       string  `json:"host"`
	Port       int     `json:"port"`
	Username   string  `json:"username"`
	Database   *string `json:"database,omitempty"`
	GroupID    *string `json:"group_id,omitempty"`
	Color      *string `json:"color,omitempty"`
	Status     string  `json:"status"`
	SSHEnabled bool    `json:"ssh_enabled"`
	SSLEnabled bool    `json:"ssl_enabled"`
}

// GetConnections 获取所有连接
func (a *App) GetConnections() ([]ConnectionOutput, error) {
	conns, err := a.storage.GetConnections()
	if err != nil {
		return nil, err
	}

	outputs := make([]ConnectionOutput, len(conns))
	for i, conn := range conns {
		outputs[i] = ConnectionOutput{
			ID:         conn.ID,
			Name:       conn.Name,
			DbType:     conn.DbType,
			Host:       conn.Host,
			Port:       conn.Port,
			Username:   conn.Username,
			Database:   conn.Database,
			GroupID:    conn.GroupID,
			Color:      conn.Color,
			Status:     "disconnected",
			SSHEnabled: conn.SSHHost != nil,
			SSLEnabled: conn.SSLEnabled != nil && *conn.SSLEnabled == "true",
		}
	}
	return outputs, nil
}

// SaveConnectionInput 保存连接输入
type SaveConnectionInput struct {
	ID                string  `json:"id,omitempty"`
	Name              string  `json:"name"`
	DbType            string  `json:"db_type"`
	Host              string  `json:"host"`
	Port              int     `json:"port"`
	Username          string  `json:"username"`
	Password          *string `json:"password,omitempty"`
	Database          *string `json:"database,omitempty"`
	GroupID           *string `json:"group_id,omitempty"`
	Color             *string `json:"color,omitempty"`
	SSHEnabled        bool    `json:"ssh_enabled,omitempty"`
	SSHHost           *string `json:"ssh_host,omitempty"`
	SSHPort           *int    `json:"ssh_port,omitempty"`
	SSHUsername       *string `json:"ssh_username,omitempty"`
	SSHAuthMethod     *string `json:"ssh_auth_method,omitempty"`
	SSHPassword       *string `json:"ssh_password,omitempty"`
	SSHPrivateKeyPath *string `json:"ssh_private_key_path,omitempty"`
	SSHPassphrase     *string `json:"ssh_passphrase,omitempty"`
	SSLEnabled        bool    `json:"ssl_enabled,omitempty"`
	SSLCAPath         *string `json:"ssl_ca_path,omitempty"`
	SSLCertPath       *string `json:"ssl_cert_path,omitempty"`
	SSLKeyPath        *string `json:"ssl_key_path,omitempty"`
	SSLSkipVerify     bool    `json:"ssl_skip_verify,omitempty"`
}

// SaveConnection 保存连接
func (a *App) SaveConnection(input SaveConnectionInput) (*ConnectionOutput, error) {
	var sshHost, sshPort, sshUsername, sshAuthMethod, sshPrivateKeyPath *string
	if input.SSHEnabled {
		sshHost = input.SSHHost
		if input.SSHPort != nil {
			port := fmt.Sprintf("%d", *input.SSHPort)
			sshPort = &port
		}
		sshUsername = input.SSHUsername
		sshAuthMethod = input.SSHAuthMethod
		sshPrivateKeyPath = input.SSHPrivateKeyPath
	}

	var sslEnabled, sslCAPath, sslCertPath, sslKeyPath, sslSkipVerify *string
	if input.SSLEnabled {
		t := "true"
		sslEnabled = &t
		sslCAPath = input.SSLCAPath
		sslCertPath = input.SSLCertPath
		sslKeyPath = input.SSLKeyPath
		if input.SSLSkipVerify {
			v := "true"
			sslSkipVerify = &v
		}
	}

	conn := &localdb.DbConnection{
		ID:                input.ID,
		Name:              input.Name,
		DbType:            input.DbType,
		Host:              input.Host,
		Port:              input.Port,
		Username:          input.Username,
		Database:          input.Database,
		GroupID:           input.GroupID,
		Color:             input.Color,
		SSHHost:           sshHost,
		SSHPort:           sshPort,
		SSHUsername:       sshUsername,
		SSHAuthMethod:     sshAuthMethod,
		SSHPrivateKeyPath: sshPrivateKeyPath,
		SSLEnabled:        sslEnabled,
		SSLCAPath:         sslCAPath,
		SSLCertPath:       sslCertPath,
		SSLKeyPath:        sslKeyPath,
		SSLSkipVerify:     sslSkipVerify,
	}

	if err := a.storage.SaveConnection(conn, input.Password); err != nil {
		return nil, err
	}

	return &ConnectionOutput{
		ID:         conn.ID,
		Name:       conn.Name,
		DbType:     conn.DbType,
		Host:       conn.Host,
		Port:       conn.Port,
		Username:   conn.Username,
		Database:   conn.Database,
		GroupID:    conn.GroupID,
		Color:      conn.Color,
		Status:     "disconnected",
		SSHEnabled: input.SSHEnabled,
		SSLEnabled: input.SSLEnabled,
	}, nil
}

// DeleteConnection 删除连接
func (a *App) DeleteConnection(id string) error {
	return a.storage.DeleteConnection(id)
}

// UpdateConnectionPassword 更新连接密码
func (a *App) UpdateConnectionPassword(id string, password string) error {
	return a.storage.UpdateConnectionPassword(id, password)
}

// GroupOutput 分组输出
type GroupOutput struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Icon     string  `json:"icon"`
	Color    string  `json:"color"`
	ParentID *string `json:"parent_id,omitempty"`
}

// GetGroups 获取所有分组
func (a *App) GetGroups() ([]GroupOutput, error) {
	groups, err := a.storage.GetGroups()
	if err != nil {
		return nil, err
	}

	outputs := make([]GroupOutput, len(groups))
	for i, g := range groups {
		outputs[i] = GroupOutput{
			ID:       g.ID,
			Name:     g.Name,
			Icon:     g.Icon,
			Color:    g.Color,
			ParentID: g.ParentID,
		}
	}
	return outputs, nil
}

// SaveGroup 保存分组
func (a *App) SaveGroup(input GroupOutput) (*GroupOutput, error) {
	group := &localdb.ConnectionGroup{
		ID:       input.ID,
		Name:     input.Name,
		Icon:     input.Icon,
		Color:    input.Color,
		ParentID: input.ParentID,
	}
	if err := a.storage.SaveGroup(group); err != nil {
		return nil, err
	}
	return &GroupOutput{
		ID:       group.ID,
		Name:     group.Name,
		Icon:     group.Icon,
		Color:    group.Color,
		ParentID: group.ParentID,
	}, nil
}

// DeleteGroup 删除分组
func (a *App) DeleteGroup(id string) error {
	return a.storage.DeleteGroup(id)
}
```

- [ ] **Step 3: 添加数据库操作绑定方法**

在 `backend/app.go` 中继续追加数据库操作方法：

```go
// === 数据库操作 ===

// ConnectDatabase 连接数据库
func (a *App) ConnectDatabase(connectionID string) error {
	conn, password, err := a.storage.GetConnectionWithPassword(connectionID)
	if err != nil {
		return err
	}
	if conn == nil {
		return fmt.Errorf("connection not found: %s", connectionID)
	}

	var pwd string
	if password != nil {
		pwd = *password
	}

	req := models.ConnectRequest{
		ConnectionID:      connectionID,
		DbType:            conn.DbType,
		Host:              conn.Host,
		Port:              conn.Port,
		Username:          conn.Username,
		Password:          pwd,
		Database:          conn.Database,
		SSHEnabled:        conn.SSHHost != nil,
		SSHHost:           deref(conn.SSHHost),
		SSHPort:           parsePort(conn.SSHPort),
		SSHUsername:       deref(conn.SSHUsername),
		SSHAuthMethod:     deref(conn.SSHAuthMethod),
		SSHPassword:       "", // 不在此传递
		SSHPrivateKeyPath: deref(conn.SSHPrivateKeyPath),
		SSLEnabled:        conn.SSLEnabled != nil && *conn.SSLEnabled == "true",
		SSLCAPath:         deref(conn.SSLCAPath),
		SSLCertPath:       deref(conn.SSLCertPath),
		SSLKeyPath:        deref(conn.SSLKeyPath),
		SSLSkipVerify:     conn.SSLSkipVerify != nil && *conn.SSLSkipVerify == "true",
	}

	return a.dbManager.Connect(req)
}

// DisconnectDatabase 断开数据库连接
func (a *App) DisconnectDatabase(connectionID string) error {
	return a.dbManager.Disconnect(connectionID)
}

// ExecuteQueryInput 查询输入
type ExecuteQueryInput struct {
	ConnectionID string `json:"connectionId"`
	SQL          string `json:"sql"`
	Database     string `json:"database,omitempty"`
}

// ExecuteQuery 执行 SQL 查询
func (a *App) ExecuteQuery(input ExecuteQueryInput) (*models.QueryResult, error) {
	exec, err := a.dbManager.GetExecutor(input.ConnectionID, input.Database)
	if err != nil {
		return nil, err
	}

	return api.ExecuteQuery(exec, input.SQL)
}

// GetDatabasesInput 获取数据库列表输入
type GetDatabasesInput struct {
	ConnectionID string `json:"connectionId"`
}

// GetDatabases 获取数据库列表
func (a *App) GetDatabases(input GetDatabasesInput) ([]string, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetDatabases(exec, dbType)
}

// GetTablesInput 获取表列表输入
type GetTablesInput struct {
	ConnectionID string  `json:"connectionId"`
	Database     *string `json:"database,omitempty"`
}

// GetTables 获取表列表
func (a *App) GetTables(input GetTablesInput) ([]models.TableInfo, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetTables(exec, dbType, input.Database)
}

// GetTablesCategorizedInput 获取分类表列表输入
type GetTablesCategorizedInput struct {
	ConnectionID string  `json:"connectionId"`
	Database     *string `json:"database,omitempty"`
	Search       *string `json:"search,omitempty"`
}

// GetTablesCategorized 获取分类的表和视图
func (a *App) GetTablesCategorized(input GetTablesCategorizedInput) (*models.TablesResult, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetTablesCategorized(exec, dbType, input.Database, input.Search)
}

// GetTableStructureInput 获取表结构输入
type GetTableStructureInput struct {
	ConnectionID string `json:"connectionId"`
	TableName    string `json:"tableName"`
	Database     string `json:"database,omitempty"`
}

// GetTableStructure 获取表结构
func (a *App) GetTableStructure(input GetTableStructureInput) (*models.TableStructure, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetTableStructure(exec, dbType, input.TableName, input.Database)
}

// GetColumnsInput 获取列信息输入
type GetColumnsInput struct {
	ConnectionID string `json:"connectionId"`
	TableName    string `json:"tableName"`
	Database     string `json:"database,omitempty"`
}

// GetColumns 获取列信息
func (a *App) GetColumns(input GetColumnsInput) ([]models.ColumnInfo, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetColumns(exec, dbType, input.TableName, input.Database)
}

// GetAllColumnsInput 获取所有列信息输入
type GetAllColumnsInput struct {
	ConnectionID string  `json:"connectionId"`
	Database     *string `json:"database,omitempty"`
}

// GetAllColumns 获取所有表的列信息
func (a *App) GetAllColumns(input GetAllColumnsInput) (*models.AllColumnsResult, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetAllColumns(exec, dbType, input.Database)
}

// GetIndexesInput 获取索引输入
type GetIndexesInput struct {
	ConnectionID string `json:"connectionId"`
	TableName    string `json:"tableName"`
	Database     string `json:"database,omitempty"`
}

// GetIndexes 获取索引
func (a *App) GetIndexes(input GetIndexesInput) ([]models.IndexInfo, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetIndexes(exec, dbType, input.TableName, input.Database)
}

// GetForeignKeysInput 获取外键输入
type GetForeignKeysInput struct {
	ConnectionID string `json:"connectionId"`
	TableName    string `json:"tableName"`
	Database     string `json:"database,omitempty"`
}

// GetForeignKeys 获取外键
func (a *App) GetForeignKeys(input GetForeignKeysInput) ([]models.ForeignKeyInfo, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetForeignKeys(exec, dbType, input.TableName, input.Database)
}

// GetProceduresInput 获取存储过程输入
type GetProceduresInput struct {
	ConnectionID string  `json:"connectionId"`
	Database     *string `json:"database,omitempty"`
}

// GetProcedures 获取存储过程
func (a *App) GetProcedures(input GetProceduresInput) ([]string, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetProcedures(exec, dbType, input.Database)
}

// GetFunctionsInput 获取函数输入
type GetFunctionsInput struct {
	ConnectionID string  `json:"connectionId"`
	Database     *string `json:"database,omitempty"`
}

// GetFunctions 获取函数
func (a *App) GetFunctions(input GetFunctionsInput) ([]string, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetFunctions(exec, dbType, input.Database)
}

// GetProcedureBodyInput 获取存储过程体输入
type GetProcedureBodyInput struct {
	ConnectionID   string  `json:"connectionId"`
	ProcedureName  string  `json:"procedureName"`
	Database       *string `json:"database,omitempty"`
}

// GetProcedureBody 获取存储过程体
func (a *App) GetProcedureBody(input GetProcedureBodyInput) (string, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return "", err
	}
	return api.GetProcedureBody(exec, dbType, input.ProcedureName, input.Database)
}

// GetFunctionBodyInput 获取函数体输入
type GetFunctionBodyInput struct {
	ConnectionID string  `json:"connectionId"`
	FunctionName string  `json:"functionName"`
	Database     *string `json:"database,omitempty"`
}

// GetFunctionBody 获取函数体
func (a *App) GetFunctionBody(input GetFunctionBodyInput) (string, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return "", err
	}
	return api.GetFunctionBody(exec, dbType, input.FunctionName, input.Database)
}

// ExecuteDDLInput DDL 执行输入
type ExecuteDDLInput struct {
	ConnectionID string `json:"connectionId"`
	SQL          string `json:"sql"`
	Database     string `json:"database,omitempty"`
}

// ExecuteDDL 执行 DDL
func (a *App) ExecuteDDL(input ExecuteDDLInput) error {
	exec, _, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return err
	}
	return api.ExecuteDDL(exec, input.SQL)
}

// TruncateTableInput 截断表输入
type TruncateTableInput struct {
	ConnectionID string `json:"connectionId"`
	TableName    string `json:"tableName"`
	Database     string `json:"database,omitempty"`
}

// TruncateTable 截断表
func (a *App) TruncateTable(input TruncateTableInput) error {
	exec, _, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return err
	}
	return api.TruncateTable(exec, input.TableName)
}

// DropTableInput 删除表输入
type DropTableInput struct {
	ConnectionID string `json:"connectionId"`
	TableName    string `json:"tableName"`
	Database     string `json:"database,omitempty"`
}

// DropTable 删除表
func (a *App) DropTable(input DropTableInput) error {
	exec, _, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return err
	}
	return api.DropTable(exec, input.TableName)
}

// DropViewInput 删除视图输入
type DropViewInput struct {
	ConnectionID string `json:"connectionId"`
	ViewName     string `json:"viewName"`
	Database     string `json:"database,omitempty"`
}

// DropView 删除视图
func (a *App) DropView(input DropViewInput) error {
	exec, _, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return err
	}
	return api.DropView(exec, input.ViewName)
}

// RenameTableInput 重命名表输入
type RenameTableInput struct {
	ConnectionID string `json:"connectionId"`
	OldName      string `json:"oldName"`
	NewName      string `json:"newName"`
	Database     string `json:"database,omitempty"`
}

// RenameTable 重命名表
func (a *App) RenameTable(input RenameTableInput) error {
	exec, _, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return err
	}
	return api.RenameTable(exec, input.OldName, input.NewName)
}

// MaintainTableInput 维护表输入
type MaintainTableInput struct {
	ConnectionID string `json:"connectionId"`
	TableName    string `json:"tableName"`
	Operation    string `json:"operation"`
	Database     string `json:"database,omitempty"`
}

// MaintainTable 维护表
func (a *App) MaintainTable(input MaintainTableInput) error {
	exec, _, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return err
	}
	return api.MaintainTable(exec, input.TableName, input.Operation)
}

// BeginTransaction 开始事务
func (a *App) BeginTransaction(connectionID string) error {
	exec, _, err := a.getConnAndType(connectionID)
	if err != nil {
		return err
	}
	return api.BeginTransaction(exec)
}

// CommitTransaction 提交事务
func (a *App) CommitTransaction(connectionID string) error {
	exec, _, err := a.getConnAndType(connectionID)
	if err != nil {
		return err
	}
	return api.CommitTransaction(exec)
}

// RollbackTransaction 回滚事务
func (a *App) RollbackTransaction(connectionID string) error {
	exec, _, err := a.getConnAndType(connectionID)
	if err != nil {
		return err
	}
	return api.RollbackTransaction(exec)
}

// GetTransactionStatus 获取事务状态
func (a *App) GetTransactionStatus(connectionID string) (bool, error) {
	exec, _, err := a.getConnAndType(connectionID)
	if err != nil {
		return false, err
	}
	return api.GetTransactionStatus(exec)
}

// GetServerInfoInput 获取服务器信息输入
type GetServerInfoInput struct {
	ConnectionID string  `json:"connectionId"`
	Database     *string `json:"database,omitempty"`
}

// GetServerInfo 获取服务器信息
func (a *App) GetServerInfo(input GetServerInfoInput) (map[string]interface{}, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetServerInfo(exec, dbType, input.Database)
}

// GetTableDDLInput 获取表 DDL 输入
type GetTableDDLInput struct {
	ConnectionID string `json:"connectionId"`
	TableName    string `json:"tableName"`
	Database     string `json:"database,omitempty"`
}

// GetTableDDL 获取表 DDL
func (a *App) GetTableDDL(input GetTableDDLInput) ([]string, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetTableDDL(exec, dbType, input.TableName, input.Database)
}

// GetTriggersInput 获取触发器输入
type GetTriggersInput struct {
	ConnectionID string  `json:"connectionId"`
	Database     *string `json:"database,omitempty"`
}

// GetTriggers 获取触发器
func (a *App) GetTriggers(input GetTriggersInput) ([]models.TriggerInfo, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetTriggers(exec, dbType, input.Database)
}

// GetEventsInput 获取事件输入
type GetEventsInput struct {
	ConnectionID string  `json:"connectionId"`
	Database     *string `json:"database,omitempty"`
}

// GetEvents 获取事件
func (a *App) GetEvents(input GetEventsInput) ([]models.EventInfo, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetEvents(exec, dbType, input.Database)
}

// StreamExportInput 流式导出输入
type StreamExportInput struct {
	ConnectionID string `json:"connectionId"`
	TableName    string `json:"tableName"`
	Database     string `json:"database,omitempty"`
	BatchSize    int    `json:"batchSize"`
}

// StreamExportTable 流式导出表
func (a *App) StreamExportTable(input StreamExportInput) (*models.QueryResult, error) {
	exec, _, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.StreamExportTable(exec, input.TableName, input.BatchSize)
}

// CheckBackupTool 检查备份工具
func (a *App) CheckBackupTool(dbType string) (map[string]interface{}, error) {
	return api.CheckBackupTool(dbType)
}

// BackupInput 备份输入
type BackupInput struct {
	ConnectionID     string   `json:"connectionId"`
	Database         string   `json:"database"`
	Tables           []string `json:"tables,omitempty"`
	IncludeStructure bool     `json:"includeStructure"`
	IncludeData      bool     `json:"includeData"`
	FilePath         string   `json:"filePath"`
}

// BackupDatabase 备份数据库
func (a *App) BackupDatabase(input BackupInput) (map[string]interface{}, error) {
	return api.BackupDatabase(input.DbType, input.ConnectionID, input.Database, input.Tables, input.IncludeStructure, input.IncludeData, input.FilePath)
}

// RestoreInput 恢复输入
type RestoreInput struct {
	ConnectionID string `json:"connectionId"`
	Database     string `json:"database"`
	FilePath     string `json:"filePath"`
}

// RestoreDatabase 恢复数据库
func (a *App) RestoreDatabase(input RestoreInput) (map[string]interface{}, error) {
	return api.RestoreDatabase(input.ConnectionID, input.Database, input.FilePath)
}

// GetUsersInput 获取用户输入
type GetUsersInput struct {
	ConnectionID string  `json:"connectionId"`
	Database     *string `json:"database,omitempty"`
}

// GetUsers 获取用户
func (a *App) GetUsers(input GetUsersInput) (interface{}, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetUsers(exec, dbType, input.Database)
}

// GetUserPrivilegesInput 获取用户权限输入
type GetUserPrivilegesInput struct {
	ConnectionID string  `json:"connectionId"`
	Username     string  `json:"username"`
	Host         string  `json:"host"`
	Database     *string `json:"database,omitempty"`
}

// GetUserPrivileges 获取用户权限
func (a *App) GetUserPrivileges(input GetUserPrivilegesInput) (interface{}, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetUserPrivileges(exec, dbType, input.Username, input.Host, input.Database)
}

// GetTablePrivilegesInput 获取表权限输入
type GetTablePrivilegesInput struct {
	ConnectionID string  `json:"connectionId"`
	Username     string  `json:"username"`
	Host         string  `json:"host"`
	Database     *string `json:"database,omitempty"`
}

// GetTablePrivileges 获取表权限
func (a *App) GetTablePrivileges(input GetTablePrivilegesInput) (interface{}, error) {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.GetTablePrivileges(exec, dbType, input.Username, input.Host, input.Database)
}

// CreateUserInput 创建用户输入
type CreateUserInput struct {
	ConnectionID string  `json:"connectionId"`
	Username     string  `json:"username"`
	Password     string  `json:"password"`
	Host         string  `json:"host"`
	Database     *string `json:"database,omitempty"`
}

// CreateUser 创建用户
func (a *App) CreateUser(input CreateUserInput) error {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return err
	}
	return api.CreateUser(exec, dbType, input.Username, input.Password, input.Host, input.Database)
}

// DropUserInput 删除用户输入
type DropUserInput struct {
	ConnectionID string  `json:"connectionId"`
	Username     string  `json:"username"`
	Host         string  `json:"host"`
	Database     *string `json:"database,omitempty"`
}

// DropUser 删除用户
func (a *App) DropUser(input DropUserInput) error {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return err
	}
	return api.DropUser(exec, dbType, input.Username, input.Host, input.Database)
}

// GrantPrivilegeInput 授权输入
type GrantPrivilegeInput struct {
	ConnectionID string   `json:"connectionId"`
	Username     string   `json:"username"`
	Host         string   `json:"host"`
	Privileges   []string `json:"privileges"`
	DatabaseAll  bool     `json:"databaseAll"`
	Database     *string  `json:"database,omitempty"`
	Table        *string  `json:"table,omitempty"`
}

// GrantPrivilege 授权
func (a *App) GrantPrivilege(input GrantPrivilegeInput) error {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return err
	}
	return api.GrantPrivilege(exec, dbType, input.Username, input.Host, input.Privileges, input.DatabaseAll, input.Database, input.Table)
}

// RevokePrivilegeInput 撤销权限输入
type RevokePrivilegeInput struct {
	ConnectionID string   `json:"connectionId"`
	Username     string   `json:"username"`
	Host         string   `json:"host"`
	Privileges   []string `json:"privileges"`
	DatabaseAll  bool     `json:"databaseAll"`
	Database     *string  `json:"database,omitempty"`
	Table        *string  `json:"table,omitempty"`
}

// RevokePrivilege 撤销权限
func (a *App) RevokePrivilege(input RevokePrivilegeInput) error {
	exec, dbType, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return err
	}
	return api.RevokePrivilege(exec, dbType, input.Username, input.Host, input.Privileges, input.DatabaseAll, input.Database, input.Table)
}

// CompareSchemaInput 比较结构输入
type CompareSchemaInput struct {
	SourceConnectionID string `json:"sourceConnectionId"`
	SourceDatabase     string `json:"sourceDatabase"`
	TargetConnectionID string `json:"targetConnectionId"`
	TargetDatabase     string `json:"targetDatabase"`
	TableName          string `json:"tableName,omitempty"`
}

// CompareSchema 比较结构
func (a *App) CompareSchema(input CompareSchemaInput) (interface{}, error) {
	sourceExec, sourceType, err := a.getConnAndType(input.SourceConnectionID)
	if err != nil {
		return nil, err
	}
	targetExec, targetType, err := a.getConnAndType(input.TargetConnectionID)
	if err != nil {
		return nil, err
	}
	return api.CompareSchema(sourceExec, sourceType, input.SourceDatabase, targetExec, targetType, input.TargetDatabase, input.TableName)
}

// BatchImportInput 批量导入输入
type BatchImportInput struct {
	ConnectionID string                   `json:"connectionId"`
	Database     string                   `json:"database,omitempty"`
	TableName    string                   `json:"tableName"`
	Mode         string                   `json:"mode"`
	PrimaryKey   string                   `json:"primaryKey,omitempty"`
	Rows         []map[string]interface{} `json:"rows"`
}

// BatchImport 批量导入
func (a *App) BatchImport(input BatchImportInput) (*models.BatchImportResponse, error) {
	exec, _, err := a.getConnAndType(input.ConnectionID)
	if err != nil {
		return nil, err
	}
	return api.BatchImport(exec, input.Database, input.TableName, input.Mode, input.PrimaryKey, input.Rows)
}

// SaveSnippetInput 保存代码片段输入
type SaveSnippetInput struct {
	ID        string  `json:"id,omitempty"`
	Name      string  `json:"name"`
	SQLText   string  `json:"sql_text"`
	DbType    *string `json:"db_type,omitempty"`
	Category  *string `json:"category,omitempty"`
	Tags      *string `json:"tags,omitempty"`
	IsPrivate bool    `json:"is_private,omitempty"`
}

// SaveSnippet 保存代码片段
func (a *App) SaveSnippet(input SaveSnippetInput) (string, error) {
	snippet := &localdb.Snippet{
		ID:        input.ID,
		Name:      input.Name,
		SQLText:   input.SQLText,
		DbType:    input.DbType,
		Category:  input.Category,
		Tags:      input.Tags,
		IsPrivate: input.IsPrivate,
	}
	if err := a.storage.SaveSnippet(snippet); err != nil {
		return "", err
	}
	return snippet.ID, nil
}

// GetSnippets 获取所有代码片段
func (a *App) GetSnippets() ([]localdb.Snippet, error) {
	return a.storage.GetSnippets()
}

// DeleteSnippet 删除代码片段
func (a *App) DeleteSnippet(id string) error {
	return a.storage.DeleteSnippet(id)
}

// QuitApp 退出应用
func (a *App) QuitApp() {
	runtime.Quit(a.ctx)
}

// === 辅助函数 ===

func (a *App) getConnAndType(connectionID string) (db.Executor, string, error) {
	exec, err := a.dbManager.GetExecutor(connectionID, "")
	if err != nil {
		return nil, "", err
	}
	dbType, err := a.dbManager.GetDBType(connectionID)
	if err != nil {
		return nil, "", err
	}
	return exec, dbType, nil
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func parsePort(s *string) int {
	if s == nil {
		return 0
	}
	var port int
	fmt.Sscanf(*s, "%d", &port)
	return port
}
```

- [ ] **Step 4: 创建 Wails 主入口**

Create `backend/main.go`:
```go
package main

import (
	"context"
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:     "iDBLink",
		Width:     1600,
		Height:    900,
		MinWidth:  1000,
		MinHeight: 700,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		Menu:             createMenu(app),
		BackgroundColour: &options.RGBA{R: 255, G: 255, B: 255, A: 1},
		OnStartup:        app.Startup,
		OnShutdown:       app.Shutdown,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}

func createMenu(app *App) *menu.Menu {
	AppMenu := menu.NewMenu()

	// 文件菜单
	fileMenu := AppMenu.AddSubmenu("文件")
	fileMenu.AddText("新建连接", keys.CmdOrCtrl("n"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "new-connection")
	})
	fileMenu.AddText("打开连接", keys.CmdOrCtrl("o"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "open-connection")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("保存", keys.CmdOrCtrl("s"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "save-connection")
	})
	fileMenu.AddText("另存为...", keys.ShiftCmdOrCtrl("s"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "save-as")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("导入", keys.CmdOrCtrl("i"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "import")
	})
	fileMenu.AddText("导出", keys.CmdOrCtrl("e"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "export")
	})
	fileMenu.AddSeparator()
	fileMenu.AddText("退出", keys.CmdOrCtrl("q"), func(cd *menu.CallbackData) {
		runtime.Quit(app.ctx)
	})

	// 编辑菜单
	editMenu := AppMenu.AddSubmenu("编辑")
	editMenu.AddText("撤销", keys.CmdOrCtrl("z"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "undo")
	})
	editMenu.AddText("重做", keys.ShiftCmdOrCtrl("z"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "redo")
	})
	editMenu.AddSeparator()
	editMenu.AddText("剪切", keys.CmdOrCtrl("x"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "cut")
	})
	editMenu.AddText("复制", keys.CmdOrCtrl("c"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "copy")
	})
	editMenu.AddText("粘贴", keys.CmdOrCtrl("v"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "paste")
	})
	editMenu.AddSeparator()
	editMenu.AddText("全选", keys.CmdOrCtrl("a"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "select-all")
	})
	editMenu.AddSeparator()
	editMenu.AddText("查找/替换...", keys.CmdOrCtrl("f"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "find-replace")
	})

	// 查看菜单
	viewMenu := AppMenu.AddSubmenu("查看")
	viewMenu.AddText("刷新", keys.Key("f5"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "refresh")
	})
	viewMenu.AddSeparator()
	viewMenu.AddText("放大", keys.CmdOrCtrl("plus"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "zoom-in")
	})
	viewMenu.AddText("缩小", keys.CmdOrCtrl("minus"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "zoom-out")
	})
	viewMenu.AddText("实际大小", keys.CmdOrCtrl("0"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "zoom-reset")
	})
	viewMenu.AddSeparator()
	viewMenu.AddText("全屏切换", keys.Key("f11"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "toggle-fullscreen")
	})

	// 连接菜单
	connMenu := AppMenu.AddSubmenu("连接")
	connMenu.AddText("连接所选", keys.ShiftCmdOrCtrl("c"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "connect-selected")
	})
	connMenu.AddText("断开连接", nil, func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "disconnect")
	})
	connMenu.AddSeparator()
	connMenu.AddText("新建查询", keys.CmdOrCtrl("q"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "new-query")
	})
	connMenu.AddText("执行查询", keys.CmdOrCtrl("return"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "execute-query")
	})
	connMenu.AddSeparator()
	connMenu.AddText("关闭所有连接", nil, func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "close-all")
	})

	// 工具菜单
	toolsMenu := AppMenu.AddSubmenu("工具")
	toolsMenu.AddText("选项/设置...", keys.CmdOrCtrl(","), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "settings")
	})
	toolsMenu.AddSeparator()
	toolsMenu.AddText("数据同步...", nil, func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "data-sync")
	})
	toolsMenu.AddText("备份数据库...", nil, func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "backup")
	})
	toolsMenu.AddText("恢复数据库...", nil, func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "restore")
	})
	toolsMenu.AddSeparator()
	toolsMenu.AddText("模型设计器...", nil, func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "model-designer")
	})

	// 窗口菜单
	windowMenu := AppMenu.AddSubmenu("窗口")
	windowMenu.AddText("新建标签页", keys.CmdOrCtrl("t"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "new-tab")
	})
	windowMenu.AddText("关闭标签页", keys.CmdOrCtrl("w"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "close-tab")
	})
	windowMenu.AddSeparator()
	windowMenu.AddText("切换到下一个标签页", keys.CmdOrCtrl("tab"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "next-tab")
	})
	windowMenu.AddText("切换到上一个标签页", keys.ShiftCmdOrCtrl("tab"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "previous-tab")
	})
	windowMenu.AddSeparator()
	windowMenu.AddText("层叠", nil, func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "cascade")
	})
	windowMenu.AddText("水平平铺", nil, func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "tile-horizontally")
	})
	windowMenu.AddText("垂直平铺", nil, func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "tile-vertically")
	})

	// 帮助菜单
	helpMenu := AppMenu.AddSubmenu("帮助")
	helpMenu.AddText("文档", keys.Key("f1"), func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "contents")
	})
	helpMenu.AddText("搜索...", nil, func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "search-help")
	})
	helpMenu.AddSeparator()
	helpMenu.AddText("检查更新...", nil, func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "check-updates")
	})
	helpMenu.AddSeparator()
	helpMenu.AddText("关于 i-dblink", nil, func(cd *menu.CallbackData) {
		runtime.EventsEmit(app.ctx, "menu-action", "about")
	})

	return AppMenu
}
```

- [ ] **Step 5: 编译验证**

```bash
go build ./backend/main.go
```

Expected: 编译成功

- [ ] **Step 6: Commit**

```bash
git add backend/app.go backend/main.go
git commit -m "feat: add Wails app with menu system and bindings"
```

---

## Phase 3: 前端改造

### Task 8: 重写前端 API 层

**Files:**
- Delete: `frontend/src/api/index.ts`
- Create: `frontend/src/api/index.ts`（新 Wails 版本）

- [ ] **Step 1: 创建新的 API 层**

Create `frontend/src/api/index.ts`:

```typescript
// Wails 自动生成的绑定将在 wailsjs/go/backend/App.ts 中
// 这里提供统一的 API 接口，保持与旧代码兼容

import {
  TestConnection,
  ConnectDatabase,
  DisconnectDatabase,
  GetConnections,
  SaveConnection,
  DeleteConnection,
  UpdateConnectionPassword,
  GetGroups,
  SaveGroup,
  DeleteGroup,
  GetDatabases,
  GetTables,
  GetTablesCategorized,
  GetTableStructure,
  GetColumns,
  GetAllColumns,
  GetIndexes,
  GetForeignKeys,
  GetProcedures,
  GetFunctions,
  GetProcedureBody,
  GetFunctionBody,
  ExecuteQuery,
  ExecuteDDL,
  TruncateTable,
  DropTable,
  DropView,
  RenameTable,
  MaintainTable,
  BeginTransaction,
  CommitTransaction,
  RollbackTransaction,
  GetTransactionStatus,
  GetServerInfo,
  GetTableDDL,
  GetTriggers,
  GetEvents,
  SaveSnippet,
  GetSnippets,
  DeleteSnippet,
  StreamExportTable,
  CheckBackupTool,
  BackupDatabase,
  RestoreDatabase,
  GetUsers,
  GetUserPrivileges,
  GetTablePrivileges,
  CreateUser,
  DropUser,
  GrantPrivilege,
  RevokePrivilege,
  CompareSchema,
  BatchImport,
  QuitApp,
} from '../../wailsjs/go/backend/App';

import type {
  ConnectionInput,
  ConnectionOutput,
  GroupInput,
  GroupOutput,
  TableInfo,
  ColumnInfo,
  IndexInfo,
  ForeignKeyInfo,
  QueryResult,
} from '../types/api';

export interface TablesResult {
  tables: TableInfo[];
  views: TableInfo[];
}

export interface TableStructure {
  columns: ColumnInfo[];
  indexes: IndexInfo[];
  foreign_keys: ForeignKeyInfo[];
}

export const api = {
  async testConnection(
    dbType: string,
    host: string,
    port: number,
    username: string,
    password: string,
    database?: string,
    sshConfig?: {
      ssh_enabled?: boolean;
      ssh_host?: string;
      ssh_port?: number;
      ssh_username?: string;
      ssh_auth_method?: 'password' | 'key';
      ssh_password?: string;
      ssh_private_key_path?: string;
      ssh_passphrase?: string;
    },
    sslConfig?: {
      ssl_enabled?: boolean;
      ssl_ca_path?: string;
      ssl_cert_path?: string;
      ssl_key_path?: string;
      ssl_skip_verify?: boolean;
    }
  ): Promise<boolean> {
    try {
      await TestConnection({
        DbType: dbType,
        Host: host,
        Port: port,
        Username: username,
        Password: password,
        Database: database,
        SSHEnabled: sshConfig?.ssh_enabled || false,
        SSHHost: sshConfig?.ssh_host,
        SSHPort: sshConfig?.ssh_port,
        SSHUsername: sshConfig?.ssh_username,
        SSHAuthMethod: sshConfig?.ssh_auth_method,
        SSHPassword: sshConfig?.ssh_password,
        SSHPrivateKeyPath: sshConfig?.ssh_private_key_path,
        SSHPassphrase: sshConfig?.ssh_passphrase,
        SSLEnabled: sslConfig?.ssl_enabled || false,
        SSLCAPath: sslConfig?.ssl_ca_path,
        SSLCertPath: sslConfig?.ssl_cert_path,
        SSLKeyPath: sslConfig?.ssl_key_path,
        SSLSkipVerify: sslConfig?.ssl_skip_verify || false,
      });
      return true;
    } catch (error) {
      console.error('Test connection failed:', error);
      throw error;
    }
  },

  async connectConnection(connectionId: string): Promise<boolean> {
    await ConnectDatabase(connectionId);
    return true;
  },

  async disconnectConnection(connectionId: string): Promise<boolean> {
    await DisconnectDatabase(connectionId);
    return true;
  },

  async getConnections(): Promise<ConnectionOutput[]> {
    return await GetConnections();
  },

  async saveConnection(input: ConnectionInput): Promise<ConnectionOutput> {
    return await SaveConnection({
      ID: input.id,
      Name: input.name,
      DbType: input.db_type,
      Host: input.host,
      Port: input.port,
      Username: input.username,
      Password: input.password,
      Database: input.database,
      GroupID: input.group_id,
      Color: input.color,
      SSHEnabled: input.ssh_enabled,
      SSHHost: input.ssh_host,
      SSHPort: input.ssh_port,
      SSHUsername: input.ssh_username,
      SSHAuthMethod: input.ssh_auth_method,
      SSHPassword: input.ssh_password,
      SSHPrivateKeyPath: input.ssh_private_key_path,
      SSHPassphrase: input.ssh_passphrase,
      SSLEnabled: input.ssl_enabled,
      SSLCAPath: input.ssl_ca_path,
      SSLCertPath: input.ssl_cert_path,
      SSLKeyPath: input.ssl_key_path,
      SSLSkipVerify: input.ssl_skip_verify,
    });
  },

  async updateConnectionPassword(connectionId: string, password: string): Promise<void> {
    await UpdateConnectionPassword(connectionId, password);
  },

  async deleteConnection(id: string): Promise<void> {
    await DeleteConnection(id);
  },

  async getGroups(): Promise<GroupOutput[]> {
    return await GetGroups();
  },

  async saveGroup(input: GroupInput): Promise<GroupOutput> {
    return await SaveGroup({
      ID: input.id || '',
      Name: input.name,
      Icon: input.icon,
      Color: input.color,
      ParentID: input.parent_id,
    });
  },

  async deleteGroup(id: string): Promise<void> {
    await DeleteGroup(id);
  },

  async getDatabases(connectionId: string): Promise<string[]> {
    return await GetDatabases({ ConnectionID: connectionId });
  },

  async getTables(connectionId: string, database?: string): Promise<TableInfo[]> {
    return await GetTables({ ConnectionID: connectionId, Database: database || undefined });
  },

  async getTablesCategorized(
    connectionId: string,
    database?: string,
    search?: string
  ): Promise<TablesResult> {
    return await GetTablesCategorized({
      ConnectionID: connectionId,
      Database: database || undefined,
      Search: search || undefined,
    });
  },

  async getTableStructure(
    connectionId: string,
    tableName: string,
    database?: string
  ): Promise<TableStructure> {
    return await GetTableStructure({
      ConnectionID: connectionId,
      TableName: tableName,
      Database: database,
    });
  },

  async getColumns(
    connectionId: string,
    tableName: string,
    database?: string
  ): Promise<ColumnInfo[]> {
    return await GetColumns({
      ConnectionID: connectionId,
      TableName: tableName,
      Database: database,
    });
  },

  async getAllColumns(
    connectionId: string,
    database?: string
  ): Promise<Record<string, ColumnInfo[]>> {
    const result = await GetAllColumns({
      ConnectionID: connectionId,
      Database: database || undefined,
    });
    return result.Tables;
  },

  async getIndexes(
    connectionId: string,
    tableName: string,
    database?: string
  ): Promise<IndexInfo[]> {
    return await GetIndexes({
      ConnectionID: connectionId,
      TableName: tableName,
      Database: database,
    });
  },

  async getForeignKeys(
    connectionId: string,
    tableName: string,
    database?: string
  ): Promise<ForeignKeyInfo[]> {
    return await GetForeignKeys({
      ConnectionID: connectionId,
      TableName: tableName,
      Database: database,
    });
  },

  async getProcedures(connectionId: string, database?: string): Promise<string[]> {
    return await GetProcedures({ ConnectionID: connectionId, Database: database || undefined });
  },

  async getFunctions(connectionId: string, database?: string): Promise<string[]> {
    return await GetFunctions({ ConnectionID: connectionId, Database: database || undefined });
  },

  async getProcedureBody(
    connectionId: string,
    procedureName: string,
    database?: string
  ): Promise<string> {
    return await GetProcedureBody({
      ConnectionID: connectionId,
      ProcedureName: procedureName,
      Database: database || undefined,
    });
  },

  async getFunctionBody(
    connectionId: string,
    functionName: string,
    database?: string
  ): Promise<string> {
    return await GetFunctionBody({
      ConnectionID: connectionId,
      FunctionName: functionName,
      Database: database || undefined,
    });
  },

  async executeQuery(
    connectionId: string,
    sql: string,
    database?: string,
    options?: { stream?: boolean }
  ): Promise<QueryResult> {
    return await ExecuteQuery({
      ConnectionID: connectionId,
      SQL: sql,
      Database: database,
    });
  },

  async executeDDL(connectionId: string, sql: string, database?: string): Promise<void> {
    await ExecuteDDL({ ConnectionID: connectionId, SQL: sql, Database: database });
  },

  async truncateTable(connectionId: string, tableName: string, database?: string): Promise<void> {
    await TruncateTable({ ConnectionID: connectionId, TableName: tableName, Database: database });
  },

  async dropTable(connectionId: string, tableName: string, database?: string): Promise<void> {
    await DropTable({ ConnectionID: connectionId, TableName: tableName, Database: database });
  },

  async dropView(connectionId: string, viewName: string, database?: string): Promise<void> {
    await DropView({ ConnectionID: connectionId, ViewName: viewName, Database: database });
  },

  async renameTable(
    connectionId: string,
    oldName: string,
    newName: string,
    database?: string
  ): Promise<void> {
    await RenameTable({
      ConnectionID: connectionId,
      OldName: oldName,
      NewName: newName,
      Database: database,
    });
  },

  async maintainTable(
    connectionId: string,
    tableName: string,
    operation: string,
    database?: string
  ): Promise<void> {
    await MaintainTable({
      ConnectionID: connectionId,
      TableName: tableName,
      Operation: operation,
      Database: database,
    });
  },

  async beginTransaction(connectionId: string): Promise<void> {
    await BeginTransaction(connectionId);
  },

  async commitTransaction(connectionId: string): Promise<void> {
    await CommitTransaction(connectionId);
  },

  async rollbackTransaction(connectionId: string): Promise<void> {
    await RollbackTransaction(connectionId);
  },

  async getTransactionStatus(connectionId: string): Promise<boolean> {
    return await GetTransactionStatus(connectionId);
  },

  async getServerInfo(connectionId: string, database?: string): Promise<{
    version?: string;
    server_type?: string;
    character_set?: string;
    collation?: string;
    uptime?: string;
    max_connections?: number;
  }> {
    return await GetServerInfo({ ConnectionID: connectionId, Database: database || undefined });
  },

  async getTableDDL(connectionId: string, tableName: string, database?: string): Promise<string[]> {
    return await GetTableDDL({
      ConnectionID: connectionId,
      TableName: tableName,
      Database: database,
    });
  },

  async getTriggers(connectionId: string, database?: string): Promise<any[]> {
    return await GetTriggers({ ConnectionID: connectionId, Database: database || undefined });
  },

  async getEvents(connectionId: string, database?: string): Promise<any[]> {
    return await GetEvents({ ConnectionID: connectionId, Database: database || undefined });
  },

  async saveSnippet(params: {
    id?: string;
    name: string;
    sql_text: string;
    db_type?: string;
    category?: string;
    tags?: string;
    is_private?: boolean;
  }): Promise<string> {
    return await SaveSnippet({
      ID: params.id,
      Name: params.name,
      SQLText: params.sql_text,
      DbType: params.db_type,
      Category: params.category,
      Tags: params.tags,
      IsPrivate: params.is_private || false,
    });
  },

  async getSnippets(): Promise<any[]> {
    return await GetSnippets();
  },

  async deleteSnippet(id: string): Promise<void> {
    await DeleteSnippet(id);
  },

  async streamExportTable(
    connectionId: string,
    tableName: string,
    database?: string,
    batchSize?: number
  ): Promise<any> {
    return await StreamExportTable({
      ConnectionID: connectionId,
      TableName: tableName,
      Database: database,
      BatchSize: batchSize || 1000,
    });
  },

  async checkBackupTool(
    dbType: string
  ): Promise<{ available: boolean; path?: string; error?: string }> {
    return await CheckBackupTool(dbType);
  },

  async backup(params: {
    connectionId: string;
    database: string;
    tables?: string[];
    includeStructure: boolean;
    includeData: boolean;
    filePath: string;
  }): Promise<{ file_path?: string; error?: string }> {
    return await BackupDatabase(params);
  },

  async restore(params: {
    connectionId: string;
    database: string;
    filePath: string;
  }): Promise<{ error?: string }> {
    return await RestoreDatabase(params);
  },

  async getUsers(connectionId: string, database?: string): Promise<any> {
    return await GetUsers({ ConnectionID: connectionId, Database: database || undefined });
  },

  async getUserPrivileges(
    connectionId: string,
    username: string,
    host: string,
    database?: string
  ): Promise<any> {
    return await GetUserPrivileges({
      ConnectionID: connectionId,
      Username: username,
      Host: host,
      Database: database || undefined,
    });
  },

  async getTablePrivileges(
    connectionId: string,
    username: string,
    host: string,
    database?: string
  ): Promise<any[]> {
    return await GetTablePrivileges({
      ConnectionID: connectionId,
      Username: username,
      Host: host,
      Database: database || undefined,
    });
  },

  async createUser(params: {
    connectionId: string;
    username: string;
    password: string;
    host: string;
    database?: string;
  }): Promise<void> {
    await CreateUser(params);
  },

  async dropUser(params: {
    connectionId: string;
    username: string;
    host: string;
    database?: string;
  }): Promise<void> {
    await DropUser(params);
  },

  async grantPrivilege(params: {
    connectionId: string;
    username: string;
    host: string;
    privileges: string[];
    databaseAll: boolean;
    database?: string;
    table?: string;
  }): Promise<void> {
    await GrantPrivilege(params);
  },

  async revokePrivilege(params: {
    connectionId: string;
    username: string;
    host: string;
    privileges: string[];
    databaseAll: boolean;
    database?: string;
    table?: string;
  }): Promise<void> {
    await RevokePrivilege(params);
  },

  async compareSchema(params: {
    sourceConnectionId: string;
    sourceDatabase: string;
    targetConnectionId: string;
    targetDatabase: string;
    tableName?: string;
  }): Promise<any> {
    return await CompareSchema(params);
  },

  async batchImport(params: {
    connectionId: string;
    database?: string;
    tableName: string;
    mode: 'append' | 'replace' | 'update';
    primaryKey?: string;
    rows: Record<string, any>[];
  }): Promise<{
    success_count: number;
    failed_count: number;
    total_count: number;
    last_error?: string;
  }> {
    return await BatchImport({
      ConnectionID: params.connectionId,
      Database: params.database,
      TableName: params.tableName,
      Mode: params.mode,
      PrimaryKey: params.primaryKey,
      Rows: params.rows,
    });
  },

  async quitApp(): Promise<void> {
    await QuitApp();
  },
};
```

- [ ] **Step 2: 更新菜单事件监听**

修改 `frontend/src/hooks/useMenuShortcuts.ts`（或相关文件），替换 Tauri 事件监听：

```typescript
// 旧代码
import { listen } from '@tauri-apps/api/event';

// 新代码
import { EventsOn } from '../../wailsjs/runtime';

// 使用方式
EventsOn('menu-action', (data: string) => {
  // 处理菜单事件
});
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/index.ts
git commit -m "feat: rewrite frontend API layer for Wails"
```

---

## Phase 4: 测试与验证

### Task 9: 功能测试

- [ ] **Step 1: 运行 Go 测试**

```bash
cd backend && go test ./... -v
```

Expected: 所有测试通过

- [ ] **Step 2: 运行前端测试**

```bash
cd frontend && pnpm test
```

Expected: 测试通过（可能需要更新 mocks）

- [ ] **Step 3: 开发环境启动测试**

```bash
wails dev
```

Expected: 
- 应用窗口正常打开
- 前端页面正常加载
- 能添加测试数据库连接
- 能执行查询

- [ ] **Step 4: Commit**

```bash
git commit -m "test: verify Wails migration functionality"
```

---

## Phase 5: 清理与收尾

### Task 10: 删除 Tauri 相关代码

**Files:**
- Delete: `src-tauri/` 整个目录
- Delete: `scripts/build-sidecar-release.js`
- Delete: `scripts/build-sidecar.js`（如果存在）
- Update: `README.md`
- Update: `.github/workflows/`（如果有 CI 配置）

- [ ] **Step 1: 删除 Tauri 目录和构建脚本**

```bash
# 删除 Tauri 目录
rm -rf src-tauri/

# 删除 sidecar 构建脚本
rm -f scripts/build-sidecar-release.js
rm -f scripts/build-sidecar.js
```

- [ ] **Step 2: 更新 README**

更新 `README.md` 中的构建说明：

```markdown
## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
wails dev

# 构建生产版本
wails build
```

## 测试

```bash
# 前端测试
pnpm test

# Go 后端测试
cd backend && go test ./...
```
```

- [ ] **Step 3: 更新 package.json 脚本**

更新根目录 `package.json`：
```json
{
  "scripts": {
    "dev": "wails dev",
    "build": "wails build",
    "test": "cd frontend && pnpm test",
    "test:go": "cd backend && go test ./...",
    "lint": "cd frontend && pnpm lint",
    "format": "cd frontend && pnpm format"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove Tauri and update build configuration"
```

---

## 回滚计划

如果在任何时候需要回滚：
1. `src-tauri/` 目录在删除前已通过 git 历史保留
2. 只需 `git checkout HEAD~N -- src-tauri/` 即可恢复
3. 或者从之前的 commit 创建新分支继续 Tauri 开发

---

## 验收检查清单

- [ ] `wails dev` 能正常启动应用
- [ ] 能添加、编辑、删除数据库连接
- [ ] 能连接 MySQL/PostgreSQL/SQLite 并执行查询
- [ ] 能浏览表结构、索引、外键
- [ ] 菜单系统正常工作（快捷键、事件转发）
- [ ] 生产构建 `wails build` 成功
- [ ] 构建产物能在 macOS 上运行
- [ ] 前端测试通过
- [ ] Go 后端测试通过
- [ ] 无 Tauri 相关残留代码
