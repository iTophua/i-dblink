# AGENTS.md — iDBLink

**Last verified:** 2026-05-17

## Quick commands

```bash
pnpm install                          # Install deps
pnpm tauri dev                        # Dev mode (Vite + Tauri window; auto-builds Go sidecar)
pnpm tauri build                      # Production build → src-tauri/target/release/bundle/
pnpm test                             # Vitest (jsdom env)
pnpm test:unit                        # Unit tests only
pnpm test:rust                        # Rust tests (cd src-tauri && cargo test)
pnpm test:go                          # Go tests (cd go-backend && go test ./...)
pnpm lint                             # ESLint (flat config, ignores src-tauri/)
pnpm lint:fix
pnpm format                           # Prettier write
pnpm exec tsc --noEmit                # Type check
```

## Architecture (what actually exists)

Three-layer architecture: **React frontend → Tauri v2 Rust shell → Go sidecar**

```
src/                          # Frontend (React 19 + TS + Vite)
  api/index.ts                # Tauri invoke wrappers (12 commands)
  types/api.ts                # Core types: DatabaseType, ConnectionInput, QueryResult
  stores/                     # Zustand: appStore, settingsStore, workspaceStore
  hooks/                      # 5 hooks: useApi, useMenuShortcuts, useTableScrollHeight, useThemeColors, useViewStats
  components/                 # ~39 React components (~7,500 total lines)

src-tauri/src/
  main.rs                     # Rust entry, Tauri setup, menu system
  commands/mod.rs             # 1980 lines, 54 Tauri commands → HTTP → Go sidecar
  sidecar.rs                  # Go sidecar process lifecycle (start/stop)
  security.rs                 # System keychain password storage (keyring crate)
  storage.rs                  # Local SQLite for connection/group configs (sqlx)
  db/                         # Models, pool, migrations, repository (local config only)

go-backend/                   # Go sidecar (database engine — NOT in Rust)
  db/                         # 10 database drivers
  api/                        # HTTP handlers
  models/models.go            # Shared structs (JSON contract with Rust)
```

**Key fact:** All database drivers live in `go-backend/`, NOT in Rust. Rust `commands/mod.rs` forwards HTTP requests to the Go sidecar.

## Communication patterns

- **Frontend → Rust:** `src/api/index.ts` wraps Tauri `invoke()` calls
- **Rust → Go:** HTTP/JSON to localhost (port determined by Go sidecar)
- **Rust → Frontend:** `window.emit("menu-action", ...)` / frontend `listen()`

## Configuration facts

- **Vite port:** 5100 (strictPort, `vite.config.ts`)
- **Tauri CLI:** `@tauri-apps/cli@^2.10.1`
- **React:** v19 (not 18)
- **Ant Design:** v6 (not v5)
- **ESLint:** Flat config (`eslint.config.mjs`), ignores `src-tauri/` and `dist/`
- **Prettier:** `.prettierrc.json` (semi, singleQuote, printWidth 100, tabWidth 2)
- **EditorConfig:** 2-space indent, LF, UTF-8
- **Go version:** 1.25.7 (`go-backend/go.mod`)
- **Go drivers:** `dm` (达梦), `gokb` (Kingbase), `modernc/sqlite`, `go-mssqldb`, `go-ora`
- **Dev data:** `.dev-data/` (gitignored, contains `connections.db`)
- **Build artifacts:** `go-backend/go-backend`, `src-tauri/target/` (gitignored)

## Gotchas

1. **`commands/mod.rs` is 1980 lines** — was recently refactored from `commands.rs` into a module. Further modularization still needed.
2. **Go sidecar auto-build** — Vite plugin (`vite.config.ts:buildSidecarPlugin`) rebuilds `go-backend/go-backend` on dev startup if Go source is newer than binary. If `go-backend/` is missing, Vite starts but DB operations fail.
3. **Production sidecar** — `scripts/build-sidecar-release.js` compiles Go binary into `sidecars/` for Tauri bundler.
4. **Three Zustand stores** — `appStore`, `settingsStore`, `workspaceStore`.
5. **Five hooks** — `useApi`, `useMenuShortcuts`, `useTableScrollHeight`, `useThemeColors`, `useViewStats`.
6. **Test setup** — `src/__tests__/setupTests.ts` extends vitest with `@testing-library/jest-dom`. Environment: `jsdom`.
7. **Tab state persistence** — `workspaceStore` saves/restores opened tabs. SQL tab keys are regenerated on restore to avoid timestamp collisions.
8. **i18n not started** — All UI text is hardcoded Chinese. See `doc/I18N_ISSUES.md`.

## Database support (via Go sidecar)

| Database | Status |
|----------|--------|
| MySQL | ✅ |
| PostgreSQL | ✅ |
| SQLite | ✅ |
| SQL Server | ✅ |
| Oracle | ✅ |
| MariaDB | ✅ |
| Dameng (达梦) | ✅ |
| Kingbase (人大金仓) | ✅ |
| Highgo (瀚高) | ✅ |
| VastBase | ✅ |

## Files to check when stuck

- Frontend API: `src/api/index.ts`
- Types: `src/types/api.ts`
- DB commands: `src-tauri/src/commands/mod.rs`
- Sidecar lifecycle: `src-tauri/src/sidecar.rs`
- Go DB drivers: `go-backend/db/`
- Go HTTP handlers: `go-backend/api/`
- Tests: `src/__tests__/`

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **i-dblink** (5269 symbols, 9447 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

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
