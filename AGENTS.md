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
7. **P0/P1/P3 partially completed:** P0 (experience fixes), P1 (interaction enhancements) fully done. P3 (advanced features) partially done — structure compare, backup/restore, user management, SQL Server/Oracle drivers, query parameterization implemented. i18n not yet started. See `doc/DEVELOPMENT_PLAN.md` for status.

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
| SQL Server | ✅ |
| Oracle | ✅ |
| MariaDB | ✅ |

## Files to check when stuck

- Frontend API: `src/api/index.ts`
- Types: `src/types/api.ts`
- DB commands: `src-tauri/src/commands.rs`
- Sidecar lifecycle: `src-tauri/src/sidecar.rs`
- Go DB drivers: `go-backend/db/`
- Go HTTP handlers: `go-backend/api/`
- Tests: `src/__tests__/`

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
