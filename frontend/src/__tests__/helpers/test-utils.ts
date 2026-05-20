import { vi } from 'vitest';

/**
 * Mock Tauri invoke for testing
 */
export function mockTauriInvoke() {
  const invoke = vi.fn();

  vi.mock('@tauri-apps/api/core', () => ({
    invoke,
  }));

  return invoke;
}

/**
 * Mock antd App.useApp for testing
 */
export function mockAntdApp() {
  const message = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(),
  };

  const notification = {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  };

  const modal = {
    confirm: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  };

  vi.mock('antd', async () => {
    const actual = await vi.importActual('antd');
    return {
      ...actual,
      App: {
        useApp: () => ({ message, notification, modal }),
      },
    };
  });

  return { message, notification, modal };
}

/**
 * Create a mock QueryResult for testing
 */
export function createMockQueryResult(overrides = {}) {
  return {
    columns: ['id', 'name', 'email'],
    rows: [
      [1, 'Alice', 'alice@example.com'],
      [2, 'Bob', 'bob@example.com'],
    ],
    rows_affected: 2,
    error: undefined,
    ...overrides,
  };
}

/**
 * Create mock connection data for testing
 */
export function createMockConnection(overrides = {}) {
  return {
    id: 'conn-1',
    name: 'Test Connection',
    db_type: 'mysql',
    host: 'localhost',
    port: 3306,
    username: 'root',
    database: 'testdb',
    group_id: 'default',
    status: 'disconnected',
    color: '#1890ff',
    ...overrides,
  };
}

/**
 * Create mock table info for testing
 */
export function createMockTableInfo(overrides = {}) {
  return {
    table_name: 'users',
    table_type: 'BASE TABLE',
    row_count: 100,
    comment: 'Users table',
    engine: 'InnoDB',
    ...overrides,
  };
}

/**
 * Wait for a promise to resolve (useful for async tests)
 */
export function waitFor(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Suppress console errors during tests
 */
export function suppressConsole(
  methods: ('log' | 'error' | 'warn' | 'info')[] = ['error', 'warn']
) {
  const originals: Record<string, any> = {};

  beforeAll(() => {
    methods.forEach((method) => {
      originals[method] = console[method];
      console[method] = vi.fn();
    });
  });

  afterAll(() => {
    methods.forEach((method) => {
      console[method] = originals[method];
    });
  });
}
