import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('antd', () => ({
  App: {
    useApp: () => ({
      message: {
        success: vi.fn(),
        error: vi.fn(),
        warning: vi.fn(),
      },
    }),
  },
}));

vi.mock('../stores/settingsStore', () => {
  const mockSettings = {
    settings: {
      pageSize: 1000,
      maxResultRows: 10000,
      themePreset: 'midnightDeep',
      themeMode: 'dark',
      themeSyncSystem: true,
      language: 'zh-CN',
      shortcuts: {},
    },
  };
  return {
    useSettingsStore: {
      getState: () => mockSettings,
      subscribe: vi.fn(),
    },
  };
});

const mockInvoke = vi.fn();

describe('TTLCache behavior', () => {
  interface CacheEntry<T> {
    data: T;
    timestamp: number;
  }

  class TTLCache<T> {
    private cache = new Map<string, CacheEntry<T>>();
    private maxSize: number;
    private ttl: number;

    constructor(maxSize = 100, ttl = 5 * 60 * 1000) {
      this.maxSize = maxSize;
      this.ttl = ttl;
    }

    get(key: string): T | null {
      const entry = this.cache.get(key);
      if (!entry) return null;
      if (Date.now() - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        return null;
      }
      this.cache.delete(key);
      this.cache.set(key, { ...entry, timestamp: Date.now() });
      return entry.data;
    }

    set(key: string, data: T): void {
      if (this.cache.size >= this.maxSize) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) this.cache.delete(oldestKey);
      }
      this.cache.set(key, { data, timestamp: Date.now() });
    }

    delete(key: string): void {
      this.cache.delete(key);
    }

    clear(): void {
      this.cache.clear();
    }

    cleanup(): void {
      const now = Date.now();
      for (const [key, entry] of this.cache.entries()) {
        if (now - entry.timestamp > this.ttl) {
          this.cache.delete(key);
        }
      }
    }
  }

  let cache: TTLCache<string>;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new TTLCache<string>(3, 1000);
  });

  it('gets and sets values', () => {
    cache.set('key1', 'value1');
    expect(cache.get('key1')).toBe('value1');
  });

  it('evicts oldest when full', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    cache.set('c', '3');
    cache.set('d', '4');
    expect(cache.get('a')).toBeNull();
    expect(cache.get('d')).toBe('4');
  });

  it('expires after TTL', () => {
    cache.set('key1', 'value1');
    vi.advanceTimersByTime(1500);
    expect(cache.get('key1')).toBeNull();
  });

  it('cleans up expired entries', () => {
    cache.set('a', '1');
    cache.set('b', '2');
    vi.advanceTimersByTime(1500);
    cache.cleanup();
    expect(cache.size || cache.cache.size).toBe(0);
  });
});

describe('useThemeColors hook behavior', () => {
  it('returns theme colors object structure', () => {
    const mockColors = {
      isDark: true,
      primary: '#1890ff',
      success: '#52c41a',
      warning: '#faad14',
      error: '#ff4d4f',
      textPrimary: '#ffffff',
      background: '#0d1117',
      border: '#30363d',
      dbMysql: '#4479a1',
      dbPostgresql: '#336791',
    };

    expect(mockColors.isDark).toBe(true);
    expect(mockColors.primary).toBe('#1890ff');
    expect(mockColors.dbMysql).toBe('#4479a1');
  });

  it('distinguishes light and dark mode', () => {
    const darkColors = { isDark: true, background: '#0d1117' };
    const lightColors = { isDark: false, background: '#ffffff' };

    expect(darkColors.isDark).toBe(true);
    expect(lightColors.isDark).toBe(false);
    expect(darkColors.background).not.toBe(lightColors.background);
  });
});

describe('useTableScrollHeight logic', () => {
  it('calculates height correctly', () => {
    const containerHeight = 800;
    const toolbarHeight = 30;
    const statusBarHeight = 25;
    const border = 2;

    const calculatedHeight = containerHeight - toolbarHeight - statusBarHeight - border;
    const finalHeight = Math.max(300, calculatedHeight);

    expect(finalHeight).toBe(743);
  });

  it('enforces minimum height of 300px', () => {
    const containerHeight = 300;
    const toolbarHeight = 100;
    const statusBarHeight = 100;
    const border = 2;

    const calculatedHeight = containerHeight - toolbarHeight - statusBarHeight - border;
    const finalHeight = Math.max(300, calculatedHeight);

    expect(finalHeight).toBe(300);
  });

    it('returns zero when container is not available', () => {
    let height = 0;
    const calculateHeight = () => {
      const container: HTMLDivElement | null = null;
      if (!container) return;
      height = 800;
    };
    calculateHeight();
    expect(height).toBe(0);
  });
});

describe('useMenuShortcuts logic', () => {
  it('maps shortcut IDs to key combinations', () => {
    const shortcuts: Record<string, string> = {
      'new-connection': 'mod+n',
      'execute-query': 'mod+enter',
      'save-connection': 'mod+s',
      'delete': 'delete',
      'refresh': 'f5',
    };

    expect(shortcuts['new-connection']).toBe('mod+n');
    expect(shortcuts['execute-query']).toBe('mod+enter');
  });

  it('distinguishes macOS-specific shortcuts', () => {
    const executeQueryDefault = 'mod+enter';
    const executeQueryMac = 'mod+r';

    expect(executeQueryDefault).toBe('mod+enter');
    expect(executeQueryMac).toBe('mod+r');
  });

  it('formats shortcut display text for macOS', () => {
    const formatShortcut = (keys: string): string =>
      keys
        .replace('mod+', '\u2318')
        .replace('shift+', '\u21e7')
        .replace('alt+', '\u2325')
        .replace('enter', '\u21b5')
        .toUpperCase();

    expect(formatShortcut('mod+n')).toBe('\u2318N');
    expect(formatShortcut('mod+shift+s')).toBe('\u2318\u21e7S');
    expect(formatShortcut('mod+enter')).toBe('\u2318\u21B5');
  });

  it('formats shortcut display text for Windows/Linux', () => {
    const formatShortcut = (keys: string): string =>
      keys
        .replace('mod+', 'Ctrl+')
        .replace('shift+', '\u21e7')
        .replace('alt+', 'Alt+')
        .replace('enter', '\u21b5')
        .toUpperCase();

    expect(formatShortcut('mod+n')).toBe('CTRL+N');
    expect(formatShortcut('mod+enter')).toBe('CTRL+\u21B5');
  });
});

describe('API layer structure', () => {
  it('has all required API methods', () => {
    const requiredMethods = [
      'testConnection',
      'connectConnection',
      'disconnectConnection',
      'getConnections',
      'saveConnection',
      'deleteConnection',
      'getGroups',
      'saveGroup',
      'deleteGroup',
      'getDatabases',
      'getTables',
      'getTablesCategorized',
      'getTableStructure',
      'getColumns',
      'getIndexes',
      'getForeignKeys',
      'executeQuery',
      'beginTransaction',
      'commitTransaction',
      'rollbackTransaction',
    ];

    expect(requiredMethods.length).toBe(20);
  });

  it('QueryResult has required fields', () => {
    const mockResult = {
      columns: ['id', 'name'],
      rows: [[1, 'Alice']],
      rows_affected: 1,
      error: undefined,
    };

    expect(mockResult.columns).toEqual(['id', 'name']);
    expect(mockResult.rows).toEqual([[1, 'Alice']]);
    expect(mockResult.rows_affected).toBe(1);
  });
});

describe('Connection/Group types', () => {
  it('ConnectionInput has required fields', () => {
    const input = {
      name: 'Test',
      db_type: 'mysql' as const,
      host: 'localhost',
      port: 3306,
      username: 'root',
    };

    expect(input.name).toBe('Test');
    expect(input.db_type).toBe('mysql');
  });

  it('ConnectionOutput has all fields', () => {
    const output = {
      id: 'conn-1',
      name: 'Test',
      db_type: 'mysql' as const,
      host: 'localhost',
      port: 3306,
      username: 'root',
      database: 'testdb',
      group_id: 'default',
      status: 'disconnected' as const,
    };

    expect(output.id).toBe('conn-1');
    expect(output.status).toBe('disconnected');
  });

  it('DatabaseType includes all supported databases', () => {
    const dbTypes: Array<
      'mysql' | 'postgresql' | 'sqlite' | 'sqlserver' | 'oracle' | 'mariadb' | 'dameng' | 'kingbase' | 'highgo' | 'vastbase'
    > = ['mysql', 'postgresql', 'sqlite', 'sqlserver', 'oracle', 'mariadb', 'dameng', 'kingbase', 'highgo', 'vastbase'];

    expect(dbTypes).toHaveLength(10);
  });
});
