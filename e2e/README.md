# E2E Tests for iDBLink

This directory contains End-to-End tests using Playwright.

## Setup

```bash
pnpm add -D @playwright/test
npx playwright install
```

## Running Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run with UI
pnpm test:e2e:ui

# Run specific test file
npx playwright test e2e/smoke.test.ts
```

## Test Structure

### smoke.test.ts
- Application loads successfully
- Main layout renders
- Sidebar is visible
- SQL editor area is present

### connection-flow.test.ts
- Create a new database connection
- Fill in connection form
- Save connection
- Verify connection appears in tree
- Test connection success
- View databases and tables

### query-flow.test.ts
- Select a database connection
- Type SQL in editor
- Execute query
- Verify results display
- Export results to CSV
- Verify download

### settings-flow.test.ts
- Open settings dialog
- Change theme
- Verify theme change
- Change language
- Verify language change
- Reset settings

### regression.test.ts
- Full user journey: connect → query → export
- Multiple tabs management
- Transaction operations

## Configuration

Playwright configuration is in `playwright.config.ts`.

## CI Integration

Add to your CI pipeline:

```yaml
- name: Run E2E tests
  run: pnpm test:e2e
```
