# QWEN.md - iDBLink Project Context

## Project Overview

**iDBLink** is a cross-platform database management tool (similar to Navicat Premium) built with React 18 + TypeScript + Vite for the frontend and Tauri v2 (Rust) for the backend. It supports multiple database types including MySQL, PostgreSQL, SQLite, SQL Server, Oracle, MariaDB, and Dameng (达梦).

**Current Version**: v0.1.0 (Early development stage)

**Location**: `/Users/itophua/AI/AiProjects/i-dblink`

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 18 + TypeScript | UI framework |
| **Build Tool** | Vite 5 | Fast dev server & bundler |
| **UI Framework** | Ant Design 5 | Component library |
| **State Management** | Zustand 4 | Lightweight global state |
| **SQL Editor** | Monaco Editor | VS Code-like SQL editing |
| **Data Grid** | AG Grid 30 | High-performance table |
| **Desktop Framework** | Tauri v2 | Cross-platform desktop app |
| **Backend** | Rust 1.70+ | High-performance, safe backend |
| **Database Drivers** | sqlx 0.7 | Async SQL (MySQL, PG, SQLite) |
| **Connection Pool** | mobc 0.8 | Connection pooling |
| **Key Storage** | keyring 2.0 | System keychain for passwords |
| **Async Runtime** | Tokio 1.35 | Rust async runtime |

## Project Structure

```
i-dblink/
├── src/                          # Frontend source (TypeScript/React)
│   ├── api/                      # Tauri invoke API wrappers
│   ├── components/               # React components
│   │   ├── ConnectionTree/       # Connection tree component
│   │   ├── StatusBar/            # Status bar component
│   │   ├── TabPanel/             # Tab panel component
│   │   ├── Toolbar/              # Toolbar component
│   │   ├── ConnectionDialog.tsx  # Connection config dialog
│   │   ├── DataTable.tsx         # Data table view
│   │   ├── LogPanel.tsx          # Log panel
│   │   ├── MainLayout.tsx        # Main app layout
│   │   ├── SQLEditor.tsx         # SQL editor with Monaco
│   │   ├── TableList.tsx         # Table list view
│   │   ├── TableStructure.tsx    # Table structure view
│   │   └── Welcome.tsx           # Welcome screen
│   ├── hooks/                    # Custom React hooks
│   ├── stores/                   # Zustand stores (appStore.ts)
│   ├── types/                    # TypeScript type definitions
│   ├── utils/                    # Utility functions
│   ├── styles/                   # Global styles & theme
│   ├── constants/                # App constants
│   ├── __tests__/                # Test files
│   ├── App.tsx                   # Root React component
│   └── main.tsx                  # React entry point
├── src-tauri/                    # Rust backend
│   ├── src/
│   │   ├── commands/             # Tauri command modules
│   │   ├── db/                   # Database module (pool, models, migrations, queries, repos)
│   │   ├── drivers/              # Database driver implementations
│   │   ├── models/               # Data models
│   │   ├── utils/                # Utility functions
│   │   ├── commands.rs           # Tauri commands (legacy, needs refactoring)
│   │   ├── main.rs               # Rust entry point & menu setup
│   │   ├── security.rs           # Keychain password management
│   │   └── storage.rs            # Local JSON storage for connections
│   ├── icons/                    # App icons
│   ├── Cargo.toml                # Rust dependencies
│   └── tauri.conf.json           # Tauri app configuration
├── doc/                          # Project documentation
│   ├── 01-requirements.md        # Requirements specification
│   ├── 02-ui-design.md           # UI design & component specs
│   └── 03-interaction-design.md  # Interaction design & workflows
└── public/                       # Static assets
```

## Key Commands

### Development
```bash
# Start dev mode (Vite + Tauri)
pnpm tauri dev

# Start Vite dev server only
pnpm dev

# Preview production build
pnpm preview
```

### Building
```bash
# Build production version
pnpm tauri build

# Frontend build only
pnpm build
```

### Code Quality
```bash
# Run tests
pnpm test

# Lint code
pnpm lint

# Fix lint issues
pnpm lint:fix

# Format code
pnpm format

# Check formatting
pnpm format:check

# TypeScript type check
pnpm exec tsc --noEmit

# Rust lint (clippy)
cd src-tauri && cargo clippy
```

### Dependencies
```bash
# Install frontend dependencies
pnpm install
```

## Architecture

### Frontend Architecture
- **State Management**: Single Zustand store (`src/stores/appStore.ts`)
- **API Layer**: Unified Tauri invoke wrappers in `src/api/index.ts`
- **Type Definitions**: Centralized in `src/types/api.ts`
- **Theme**: Ant Design 5 theme with dark/light mode support (`src/styles/`)
- **Layout**: MainLayout with Navicat-style 3-column layout (connection tree, workspace, tabs)

### Backend Architecture
- **Tauri Commands**: Exposed via `invoke_handler` in `main.rs`
- **Database Layer**: Modular structure under `src/db/` with connection pooling
- **Storage**: Local JSON file storage for connection configs (`src/storage.rs`)
- **Security**: System keychain for password storage via `keyring` crate (`src/security.rs`)
- **Async**: Tokio runtime for all async operations

### Communication Pattern
Frontend calls backend via `@tauri-apps/api` invoke:
```typescript
// Frontend
import { invoke } from '@tauri-apps/api/core';
await invoke('connect_database', { id: 'conn-1' });

// Backend (Rust)
#[tauri::command]
async fn connect_database(id: String) -> Result<ConnectionOutput, String> { ... }
```

Backend emits events to frontend via Tauri event system:
```rust
// Backend
window.emit("menu-action", "new-connection");

// Frontend
import { listen } from '@tauri-apps/api/event';
listen('menu-action', (event) => { ... });
```

## Coding Conventions

### Frontend
- **Components**: PascalCase naming (`ConnectionDialog.tsx`)
- **Hooks**: camelCase naming (`useApi`, `useMenuShortcuts`)
- **Types**: Interfaces and types in `src/types/api.ts`
- **No inline styles**: Prefer CSS modules or styled-components
- **Strict TypeScript**: `strict: true` in tsconfig

### Backend
- **Modules**: snake_case naming (`db_pool.rs`, `connection_repo.rs`)
- **Error Handling**: `thiserror` for custom errors, `anyhow` for application errors
- **Async**: All database operations use tokio async runtime
- **Serialization**: serde with derive macros for JSON serialization

### General
- **ESLint**: Configured with TypeScript-ESLint + React Hooks rules
- **Prettier**: Code formatting with `.prettierrc.json`
- **Editor**: `.editorconfig` present for editor consistency
- **No test framework yet**: Vitest is configured but tests are minimal

## Database Support Status

| Database | Status | Driver |
|----------|--------|--------|
| MySQL | 🟢 In Development | sqlx |
| PostgreSQL | 🟢 In Development | sqlx |
| SQLite | 🟢 In Development | sqlx |
| SQL Server | 🟡 Planned | tiberius |
| Oracle | 🟡 Planned | rust-oracle / ODBC |
| MariaDB | 🟡 Planned | sqlx |
| Dameng (达梦) | 🔴 Under Evaluation | ODBC bridge |

## Development Roadmap

### Phase 1: MVP (8 weeks)
- [x] Project initialization
- [ ] Basic connection management
- [ ] MySQL/PostgreSQL/SQLite support
- [ ] Data browsing
- [ ] SQL editor basics

### Phase 2: Feature Complete (10 weeks)
- [ ] Full database object management
- [ ] Data import/export
- [ ] ER diagram generation
- [ ] SQL Server/Oracle/MariaDB support
- [ ] Dameng database support

### Phase 3: Advanced Features (8 weeks)
- [ ] Database synchronization
- [ ] Backup & restore
- [ ] Model designer
- [ ] Intelligent SQL assistance

### Phase 4: Release Preparation (4 weeks)
- [ ] Performance optimization
- [ ] Comprehensive testing
- [ ] Documentation completion
- [ ] Release preparation

## Important Notes

1. **Early Stage**: Project is in v0.1.0, many features are not yet implemented
2. **Password Storage**: Passwords are stored in system keychain, not plaintext
3. **Build Artifacts**: `src-tauri/target/` contains Rust build cache, do not modify manually
4. **Dev Port**: Vite runs on port 5100 (configured in `vite.config.ts`)
5. **Tauri Version**: Using Tauri v2 (latest), not v1.x
6. **No CI/CD**: No automated build/release pipeline yet
7. **Documentation**: Comprehensive docs in `doc/` folder (requirements, UI design, interaction design)

## Common Development Tasks

### Adding a New Tauri Command
1. Create command function in `src-tauri/src/commands/` or `commands.rs`
2. Register in `invoke_handler` in `main.rs`
3. Add frontend wrapper in `src/api/index.ts`
4. Add types in `src/types/api.ts`

### Adding a New React Component
1. Create component file in `src/components/`
2. Export from component file
3. Import and use in parent component
4. Add any necessary types to `src/types/api.ts`

### Adding a New Database Driver
1. Implement driver in `src-tauri/src/drivers/`
2. Update `DatabaseType` in `src/types/api.ts`
3. Update connection logic in commands
4. Update UI components to support new database type

## Known Issues & Technical Debt

1. **Large Files**: `commands.rs` is 1151+ lines, needs refactoring into modules
2. **Code Duplication**: MySQL/PostgreSQL/SQLite connection logic has repetitive code
3. **Empty Directories**: `commands/`, `drivers/`, `models/`, `utils/` in backend are reserved but empty
4. **Minimal Tests**: Test framework exists (Vitest) but coverage is minimal
5. **Inline Styles**: Some components (e.g., `MainLayout.tsx`) use inline styles
