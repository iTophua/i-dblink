# AGENTS.md — iDBLink

**Last verified:** 2026-05-03

## Quick commands

```bash
pnpm install                          # Install deps
pnpm tauri dev                        # Dev mode (Vite + Tauri window; auto-builds Go sidecar)
pnpm tauri build                      # Production build → src-tauri/target/release/bundle/
pnpm test                             # Vitest (jsdom env)
pnpm lint                             # ESLint (ignores src-tauri/)
pnpm lint:fix
pnpm format                           # Prettier write
pnpm exec tsc --noEmit                # Type check
```

## Architecture (what actually exists)

Three-layer architecture: **React frontend → Tauri v2 Rust shell → Go sidecar**

```
src/                          # Frontend (React 18 + TS + Vite)
  api/index.ts                # Tauri invoke wrappers (create/update/delete/query connections, DB ops)
  types/api.ts                # Core types: DatabaseType, ConnectionInput, QueryResult (referenced everywhere)
  stores/                     # Zustand stores: appStore, settingsStore, workspaceStore
  hooks/                      # useApi (CRUD + TTL cache), useMenuShortcuts, useTableScrollHeight, useThemeColors, useViewStats
  components/                 # ~35 React components (MainLayout, SQLEditor, DataTable, ConnectionDialog, DatabaseProperties, ViewDefinition, etc.)

src-tauri/src/
  main.rs                     # Rust entry, Tauri setup, menu
  sidecar.rs                  # Go sidecar process lifecycle (start/stop)
  commands.rs                 # Tauri commands → HTTP → Go sidecar (1156 lines, NEEDS REFACTORING)
  security.rs                 # System keychain password storage (keyring crate)
  storage.rs                  # Local SQLite for connection/group configs (sqlx)
  db/                         # Models, pool, migrations, repository (local DB config only)

go-backend/                   # Go sidecar (database engine — NOT in Rust)
  db/                         # Drivers: MySQL, PostgreSQL, SQLite, Dameng(达梦), Kingbase, Highgo, VastBase
  api/                        # HTTP handlers: connection, query, metadata, DDL, transactions
  models/models.go            # Shared structs (JSON contract with Rust)
```

**Key fact:** All database drivers live in `go-backend/`, NOT in Rust. Rust `commands.rs` forwards HTTP requests to the Go sidecar. The old docs mentioning `src-tauri/src/drivers/` are stale — that directory does not exist.

## Communication patterns

- **Frontend → Rust:** `src/api/index.ts` wraps Tauri `invoke()` calls
- **Rust → Go:** HTTP/JSON to localhost (port determined by Go sidecar)
- **Rust → Frontend:** `window.emit("menu-action", ...)` / frontend `listen()`

## Configuration facts

- **Vite port:** 5100 (configured in `vite.config.ts`)
- **Tauri CLI:** `@tauri-apps/cli@^2.10.1` (NOT v1.x)
- **Ant Design:** v6 (not v5)
- **ESLint:** `eslint.config.mjs` (flat config, ignores `src-tauri/`)
- **Prettier:** `.prettierrc.json` (semi, singleQuote, printWidth 100)
- **EditorConfig:** `.editorconfig` (2-space indent, LF, UTF-8)
- **Go deps:** `go-backend/go.mod` — uses `dm` (达梦), `gokb` (Kingbase), `modernc/sqlite`
- **Dev data:** `.dev-data/` (gitignored, contains `connections.db`)
- **Build artifacts:** `go-backend/go-backend`, `src-tauri/target/` (gitignored)

## Gotchas

1. **`commands.rs` is 1156 lines** with repetitive switch logic. Refactor into modules when touching DB commands.
2. **Go sidecar must exist** for DB operations. Vite plugin auto-builds it from `go-backend/` on dev startup. If `go-backend/` is missing, sidecar features are unavailable but Vite still starts.
3. **Production build:** `scripts/build-sidecar-release.js` compiles Go sidecar into `sidecars/` directory. Tauri bundler picks it up.
4. **Three Zustand stores:** `appStore`, `settingsStore`, `workspaceStore` — not just one.
5. **Four hooks:** `useApi`, `useMenuShortcuts`, `useTableScrollHeight`, `useThemeColors` — not just two.
6. **Test setup:** `src/__tests__/setupTests.ts` required by vitest. Environment is `jsdom`.
7. **P0/P1 completed:** All P0 (experience fixes) and P1 (interaction enhancements) tasks are implemented. See `doc/DEVELOPMENT_PLAN.md` for status.

## Database support (via Go sidecar)

| Database | Status |
|----------|--------|
| MySQL | ✅ |
| PostgreSQL | ✅ |
| SQLite | ✅ |
| Dameng (达梦) | ✅ |
| Kingbase (人大金仓) | ✅ |
| Highgo (瀚高) | ✅ |
| VastBase (人大金仓衍生) | ✅ |
| SQL Server | ⏳ Planned |
| Oracle | ⏳ Planned |
| MariaDB | ⏳ Planned |

## Files to check when stuck

- Frontend API: `src/api/index.ts`
- Types: `src/types/api.ts`
- DB commands: `src-tauri/src/commands.rs`
- Sidecar lifecycle: `src-tauri/src/sidecar.rs`
- Go DB drivers: `go-backend/db/`
- Go HTTP handlers: `go-backend/api/`
- Tests: `src/__tests__/`
