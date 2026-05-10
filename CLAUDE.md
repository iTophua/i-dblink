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

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **i-dblink** (4857 symbols, 8596 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/i-dblink/context` | Codebase overview, check index freshness |
| `gitnexus://repo/i-dblink/clusters` | All functional areas |
| `gitnexus://repo/i-dblink/processes` | All execution flows |
| `gitnexus://repo/i-dblink/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
