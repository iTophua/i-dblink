# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

iDBLink is a cross-platform database management tool (like Navicat Premium) built with Tauri v2 (Rust backend) + React 18 + TypeScript frontend. Supports MySQL, PostgreSQL, SQLite, SQL Server, Oracle, MariaDB, and 达梦 databases.

## Commands

```bash
# Install dependencies
pnpm install

# Development mode (starts Vite dev server + Tauri window)
pnpm tauri dev

# Build production version
pnpm tauri build

# Run tests
pnpm test

# Lint frontend
pnpm lint

# Format frontend code
pnpm format

# TypeScript type check
pnpm exec tsc --noEmit
```

## Architecture

### Frontend (src/)
- **React 18 + TypeScript + Vite** frontend
- **Ant Design 5** for UI components
- **Zustand** for state management (`src/stores/appStore.ts`)
- **Monaco Editor** for SQL editing
- **AG Grid** for data tables
- API calls unified through `src/api/index.ts` using Tauri `invoke`

### Backend (src-tauri/)
- **Tauri v2** with **Rust** backend
- **sqlx** for database connectivity (MySQL, PostgreSQL, SQLite)
- **tokio** for async runtime
- Connection pooling via `drivers/db_pool.rs`
- Driver pattern: `mysql_driver.rs`, `pg_driver.rs`, `sqlite_driver.rs` implement unified interface
- Password storage via system keychain (`security.rs`)
- Connection config persisted to local SQLite (`storage.rs`)

### Key Modules

| Module | Purpose |
|--------|---------|
| `src-tauri/src/commands.rs` | Tauri command handlers (1151 lines - needs refactoring) |
| `src-tauri/src/drivers/` | Database driver implementations (MySQL, PostgreSQL, SQLite) |
| `src-tauri/src/db/` | Database models, pool, repository, migrations |
| `src-tauri/src/storage.rs` | Local SQLite storage for connection configs |
| `src-tauri/src/security.rs` | System keychain password management |
| `src/api/index.ts` | Frontend API wrapper for Tauri invoke calls |
| `src/stores/appStore.ts` | Zustand global state store |

### Frontend-Backend Communication
- Frontend calls Rust via Tauri `invoke` through `src/api/index.ts`
- Menu events emitted from Rust via `window.emit("menu-action", ...)` and received in React via `listen()`

## Database Driver Pattern

Each database driver implements these functions via `drivers/mod.rs` dispatcher:
- `connect_by_type()` - Create connection pool
- `get_tables_by_type()` / `get_tables_categorized_by_type()` - List tables/views
- `get_columns_by_type()` - Column metadata
- `get_indexes_by_type()` / `get_foreign_keys_by_type()` - Indexes and FKs
- `execute_query_by_type()` - SQL execution
- `get_databases_by_type()` - List databases/schemas
- `get_table_structure_by_type()` - Full table structure (columns + indexes + FKs)

## Known Issues / Anti-Patterns

1. `commands.rs` is 1151 lines with highly repetitive MySQL/PostgreSQL/SQLite switch logic
2. Several files exceed 500 lines and need refactoring
3. Empty预留 directories: `commands/`, `drivers/`, `models/`, `utils/`
4. Connection pool management via `RwLock<HashMap<String, DbPool>>` in `ActiveConnections`

## Development Data

- **Dev mode**: Data stored in `.dev-data/` at project root
- **Production**: Data in system app data directory
- **Dev database path**: `src-tauri/.dev-data/connections.db`
