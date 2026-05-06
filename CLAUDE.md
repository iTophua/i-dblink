# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

iDBLink is a cross-platform database management tool (like Navicat Premium) built with **Tauri v2** (Rust shell + Go sidecar) and **React 18** TypeScript frontend. Supports MySQL, PostgreSQL, SQLite, SQL Server, Oracle, MariaDB, Dameng, Kingbase, Highgo, and Vastbase.

## Commands

```bash
# Install dependencies
pnpm install

# Development mode (starts Vite dev server + Tauri window)
pnpm tauri dev

# Build production version
pnpm tauri build

# Run tests
pnpm test                              # All Vitest tests
pnpm test:unit                         # Unit tests only
pnpm test:components                   # Component tests
pnpm test:hooks                        # Hook tests
pnpm test:api                          # API tests
pnpm test:integration                  # Integration tests
pnpm test:rust                         # Rust backend tests
pnpm test:go                           # Go sidecar tests
pnpm test:e2e                          # Playwright E2E tests

# Lint and format
pnpm lint                              # ESLint
pnpm lint:fix                          # ESLint with auto-fix
pnpm format                            # Prettier format
pnpm exec tsc --noEmit                 # TypeScript type check
```

## Architecture

### Three-Tier Process Architecture

```
┌─────────────────────────────────────────────────┐
│ Tauri App (Single Process)                       │
│                                                  │
│  ┌──────────────┐    ┌──────────────────────┐   │
│  │ React Frontend│    │ Rust Backend (Tauri) │   │
│  │ (Vite/React18)│   │ (main.rs + commands) │   │
│  │ Zustand Store │   │                      │   │
│  └──────┬───────┘    └──────────┬───────────┘   │
│         │ Tauri invoke          │ HTTP (localhost)│
└─────────┼───────────────────────┼────────────────┘
          │                       │
          ▼                       ▼
┌──────────────────────┐   ┌──────────────────────┐
│  Go Sidecar          │   │ Local SQLite DB      │
│  (go-backend/)       │   │ (connections.db)     │
│  - DB connections    │   │ - Connection configs │
│  - SQL execution     │   │ - Passwords (AES)    │
│  - CRUD operations   │   │ - Snippets           │
└──────────────────────┘   └──────────────────────┘
```

**Key design decision:** All database operations (connection, query, metadata) are delegated to a Go sidecar process running on localhost. The Rust backend manages the sidecar lifecycle, local storage, and security. The frontend communicates with Rust via Tauri `invoke`, and Rust communicates with the Go sidecar via HTTP.

### Frontend (src/)

| Layer | Files | Purpose |
|-------|-------|---------|
| API | `src/api/index.ts` | Tauri invoke wrappers for all backend commands |
| Stores | `src/stores/appStore.ts`, `settingsStore.ts`, `workspaceStore.ts` | Zustand state management (3 stores, persist enabled) |
| Hooks | `src/hooks/useApi.ts` (847 lines), `useMenuShortcuts.ts`, `useThemeColors.ts`, etc. | Core logic hooks, table caching, schema completion |
| Components | `src/components/MainLayout.tsx` (1165 lines), `DataTable.tsx` (2582 lines) | Primary UI components |
| Types | `src/types/api.ts` | TypeScript interfaces matching backend payloads |
| Utils | `src/utils/sqlUtils.ts`, `exportUtils.ts` | SQL identifier escaping, export utilities |

### Backend (src-tauri/src/)

| Module | Files | Purpose |
|--------|-------|---------|
| Entry | `main.rs` (431 lines) | Tauri app setup, menu, sidecar lifecycle |
| Commands | `commands/mod.rs` (1954 lines) | All Tauri command handlers |
| Sidecar | `sidecar.rs` (353 lines) | Go sidecar process management, HTTP client |
| Storage | `storage.rs` (199 lines) | Local SQLite storage for connections, groups, snippets |
| DB | `db/models.rs`, `db/pool.rs`, `db/repository.rs`, `db/migrations.rs` | Local SQLite schema for persistence |
| Security | `security.rs` (102 lines) | AES-256-GCM password encryption (machine-bound key) |

### Frontend-Backend Communication

1. **Frontend → Rust:** via Tauri `invoke` through `src/api/index.ts` → `src-tauri/src/commands/mod.rs`
2. **Rust → Go Sidecar:** via HTTP POST to `http://127.0.0.1:<port>` (e.g., `/query`, `/tables`, `/connect`)
3. **Rust → Frontend:** via `window.emit("menu-action", ...)` for menu events

### Command Flow

Every Tauri command in `commands/mod.rs` follows this pattern:
1. Check if Go sidecar is available (`SidecarState`)
2. Ensure connection is established via `ensure_connected()` (lazy connect on first use)
3. Build JSON request and POST to appropriate Go sidecar endpoint
4. Parse JSON response back to Rust types, return to frontend

## Key Files

| File | Lines | Notes |
|------|-------|-------|
| `src/components/DataTable.tsx` | ~2580 | Data grid with CRUD, filtering, export, undo |
| `src/hooks/useApi.ts` | ~847 | Core API hook with TTL cache, schema completion cache |
| `src-tauri/src/commands/mod.rs` | ~1954 | All backend commands (needs modularization) |
| `src/components/MainLayout.tsx` | ~1165 | Main app layout, tab management, state wiring |
| `src-tauri/src/main.rs` | ~431 | App bootstrap, menu, sidecar bootstrap |
| `src-tauri/src/sidecar.rs` | ~353 | Sidecar process spawn, health check, HTTP client |

## Testing

- **Frontend tests:** `src/__tests__/` — 20 files, 350 tests (Vitest + Testing Library)
  - Unit tests: `src/__tests__/unit/` — appStore, sqlUtils, exportUtils, TTLCache, schemaCache, etc.
  - Component tests: `src/__tests__/components/` — DataTable, ConnectionDialog, SQLEditor
  - Integration tests: `src/__tests__/integration/connection-flow.test.ts`
  - Mocks: `src/__tests__/mocks/`
- **Rust tests:** `src-tauri/src/commands/mod_test.rs`, `security_test.rs`, `sidecar_test.rs`, `storage_test.rs`
- **E2E:** Playwright (`pnpm test:e2e`)

## Development Data

- **Dev mode:** Data stored in `.dev-data/` at project root
- **Production:** Data in system app data directory
- **Dev database path:** `src-tauri/.dev-data/connections.db`

## Known Architecture Notes

1. **commands/mod.rs is 1954 lines** — highly repetitive pattern of: sidecar check → ensure_connected → build JSON → POST → parse response. Consider extracting a macro or helper function.
2. **DataTable.tsx is 2582 lines** — monolithic component with data grid, CRUD, filtering, export all in one file.
3. **useApi.ts is 847 lines** — `useDatabase` hook handles tables, columns, schema completion, table info, CREATE TABLE, query execution all in one hook.
4. **All database operations go through Go sidecar** — there are no Rust database drivers. The `src-tauri/Cargo.toml` uses `sqlx` only for the local SQLite storage database, not for user connections.
5. **Go sidecar lives in `go-backend/` directory** — outside the Tauri source tree. Build via `pnpm build:sidecar`.
6. **Password encryption is machine-bound** — key derived from hostname + username + app identifier. Cannot decrypt on a different machine.
