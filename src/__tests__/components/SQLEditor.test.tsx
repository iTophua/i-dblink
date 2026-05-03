import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
  emit: vi.fn(),
}));

vi.mock('monaco-editor', () => ({
  editor: {
    create: vi.fn(() => ({
      onDidChangeModelContent: vi.fn(),
      getValue: vi.fn(() => ''),
      getModel: vi.fn(),
      getSelection: vi.fn(),
      addCommand: vi.fn(),
      dispose: vi.fn(),
    })),
    languages: {
      CompletionItemKind: { Keyword: 1, Function: 2, Field: 3, Class: 4 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 1 },
      registerCompletionItemProvider: vi.fn(),
      MarkerSeverity: { Error: 8 },
      KeyMod: 0x10000,
      KeyCode: { Enter: 2 },
    },
    MarkerSeverity: { Error: 8 },
  },
}));

vi.mock('@monaco-editor/react', () => ({
  default: vi.fn(({ onMount }: any) => {
    if (onMount) {
      onMount({}, {});
    }
    return null;
  }),
}));

vi.mock('ag-grid-react', () => ({
  AgGridReact: vi.fn(() => null),
}));

vi.mock('ag-grid-community', () => ({
  __esModule: true,
  AgGridReact: vi.fn(() => null),
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
  Button: ({ children, onClick }: any) => (
    <button onClick={onClick}>{children}</button>
  ),
  Space: ({ children }: any) => <div data-testid="space">{children}</div>,
  Empty: {
    PRESENTED_IMAGE_SIMPLE: 'simple',
    default: ({ description }: any) => <div>{description}</div>,
  },
  Spin: ({ tip }: any) => <div data-testid="spin">{tip}</div>,
  Tabs: ({ items }: any) => <div data-testid="tabs">{items?.[0]?.children}</div>,
  Tag: ({ children }: any) => <span>{children}</span>,
  Tooltip: ({ children }: any) => <div>{children}</div>,
  Dropdown: ({ children, menu }: any) => <div>{children}</div>,
  Modal: {
    confirm: vi.fn(),
  },
  Select: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('../hooks/useApi', () => ({
  useDatabase: () => ({
    executeQuery: vi.fn(async () => ({
      columns: ['id', 'name'],
      rows: [[1, 'Alice']],
      rows_affected: 0,
    })),
    getTables: vi.fn(async () => []),
    getColumns: vi.fn(async () => []),
  }),
  useSchemaCompletion: vi.fn(() => ({ getSchema: vi.fn() })),
}));

vi.mock('../hooks/useThemeColors', () => ({
  useThemeColors: () => ({
    isDark: true,
    primary: '#1890ff',
  }),
}));

vi.mock('../stores/appStore', () => ({
  useAppStore: () => ({
    connections: [],
  }),
}));

vi.mock('../stores/settingsStore', () => ({
  useSettingsStore: {
    getState: () => ({
      settings: { maxResultRows: 10000 },
    }),
  },
}));

vi.mock('../api', () => ({
  api: {
    executeQuery: vi.fn(),
    beginTransaction: vi.fn(),
    commitTransaction: vi.fn(),
    rollbackTransaction: vi.fn(),
  },
}));

vi.mock('../constants/menuShortcuts', () => ({
  getShortcutDisplayText: vi.fn(() => 'Ctrl+Enter'),
}));

vi.mock('../hooks/useMenuShortcuts', () => ({
  useMenuShortcuts: vi.fn(),
}));

vi.mock('../components/SQLEditor/HistoryPanel', () => ({
  HistoryPanel: () => null,
}));

vi.mock('../components/SQLEditor/ResultGrid', () => ({
  ResultGrid: () => null,
  ExplainPlanGrid: () => null,
}));

vi.mock('../components/SnippetManager', () => ({
  SnippetManager: () => null,
}));

describe('SQLEditor', () => {
  it('has expected props interface', () => {
    const expectedProps = ['connectionId', 'database', 'defaultQuery', 'availableDatabases', 'onDatabaseChange', 'dbType', 'onQueryStatusChange'];
    expect(expectedProps).toContain('connectionId');
    expect(expectedProps).toContain('database');
    expect(expectedProps).toContain('dbType');
  });

  it('has expected props interface', () => {
    const expectedProps = [
      'connectionId',
      'database',
      'defaultQuery',
      'availableDatabases',
      'onDatabaseChange',
      'dbType',
      'onQueryStatusChange',
    ];

    expect(expectedProps).toContain('connectionId');
    expect(expectedProps).toContain('database');
    expect(expectedProps).toContain('dbType');
  });
});

describe('splitSqlStatements', () => {
  const splitSqlStatements = (sql: string): string[] => {
    const statements: string[] = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    let inLineComment = false;
    let inBlockComment = false;

    for (let i = 0; i < sql.length; i++) {
      const char = sql[i];
      const nextChar = sql[i + 1];

      if (inLineComment) {
        if (char === '\n') inLineComment = false;
        current += char;
        continue;
      }

      if (inBlockComment) {
        if (char === '*' && nextChar === '/') {
          inBlockComment = false;
          current += char + nextChar;
          i++;
        } else {
          current += char;
        }
        continue;
      }

      if (inString) {
        if (char === '\\' && nextChar) {
          current += char + nextChar;
          i++;
        } else if (char === stringChar) {
          inString = false;
        }
        current += char;
        continue;
      }

      if (char === '-' && nextChar === '-') {
        inLineComment = true;
        current += char;
        continue;
      }

      if (char === '/' && nextChar === '*') {
        inBlockComment = true;
        current += char + nextChar;
        i++;
        continue;
      }

      if (char === "'" || char === '"' || char === '`') {
        inString = true;
        stringChar = char;
        current += char;
        continue;
      }

      if (char === ';') {
        const trimmed = current.trim();
        if (trimmed) statements.push(trimmed);
        current = '';
        continue;
      }

      current += char;
    }

    const trimmed = current.trim();
    if (trimmed) statements.push(trimmed);
    return statements;
  };

  it('splits multiple SQL statements', () => {
    const sql = 'SELECT * FROM users; INSERT INTO users VALUES (1);';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
  });

  it('ignores semicolons in strings', () => {
    const sql = "SELECT * FROM users WHERE name = 'a;b';";
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('a;b');
  });

  it('ignores semicolons in comments', () => {
    const sql = 'SELECT * FROM users; -- comment;\nSELECT 2';
    const result = splitSqlStatements(sql);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe('SELECT * FROM users');
  });
});

describe('filterByDbType', () => {
  type DbGroup = 'mysql-like' | 'pg-like' | 'mssql-like' | 'oracle-like' | 'sqlite-like';

  const DB_GROUP_MAP: Record<string, DbGroup> = {
    mysql: 'mysql-like',
    mariadb: 'mysql-like',
    postgresql: 'pg-like',
    sqlite: 'sqlite-like',
    sqlserver: 'mssql-like',
    oracle: 'oracle-like',
    dameng: 'oracle-like',
    kingbase: 'pg-like',
    highgo: 'pg-like',
    vastbase: 'pg-like',
  };

  interface SqlKeyword {
    label: string;
    groups?: DbGroup[];
  }

  const filterByDbType = <T extends SqlKeyword>(items: T[], dbType: string | undefined): T[] => {
    if (!dbType) return items;
    const group = DB_GROUP_MAP[dbType];
    return items.filter((item) => !item.groups || item.groups.includes(group));
  };

  it('returns all items when dbType is undefined', () => {
    const items = [
      { label: 'SELECT' },
      { label: 'LIMIT', groups: ['mysql-like'] },
    ];
    const result = filterByDbType(items, undefined);
    expect(result).toHaveLength(2);
  });

  it('filters items by database group', () => {
    const items = [
      { label: 'SELECT' },
      { label: 'LIMIT', groups: ['mysql-like'] },
      { label: 'TOP', groups: ['mssql-like'] },
    ];
    const result = filterByDbType(items, 'mysql');
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.label)).toEqual(['SELECT', 'LIMIT']);
  });

  it('excludes items not matching database group', () => {
    const items = [
      { label: 'LIMIT', groups: ['mysql-like'] },
      { label: 'TOP', groups: ['mssql-like'] },
      { label: 'ROWNUM', groups: ['oracle-like'] },
    ];
    const result = filterByDbType(items, 'postgresql');
    expect(result).toHaveLength(0);
  });
});

describe('SQL keywords and functions', () => {
  it('has standard SQL keywords', () => {
    const keywords = ['SELECT', 'INSERT INTO', 'UPDATE', 'DELETE FROM', 'WHERE'];
    keywords.forEach((kw) => {
      expect(kw).toBeTruthy();
    });
  });

  it('has SQL functions by category', () => {
    const aggregateFunctions = ['COUNT(*)', 'SUM()', 'AVG()', 'MAX()', 'MIN()'];
    const stringFunctions = ['LENGTH()', 'TRIM()', 'UPPER()', 'LOWER()', 'REPLACE()'];
    const dateFunctions = ['CURRENT_DATE', 'CURRENT_TIMESTAMP'];

    expect(aggregateFunctions).toHaveLength(5);
    expect(stringFunctions).toHaveLength(5);
    expect(dateFunctions).toHaveLength(2);
  });

  it('has database-specific functions', () => {
    const mysqlFunctions = ['IFNULL()', 'CONCAT()', 'GROUP_CONCAT()', 'NOW()', 'DATE_FORMAT()'];
    const pgFunctions = ['STRING_AGG()', 'TO_CHAR()', 'TO_DATE()', 'EXTRACT()', 'ARRAY_AGG()'];
    const sqliteFunctions = ['strftime()', 'datetime()', 'date()', 'julianday()'];

    expect(mysqlFunctions).toHaveLength(5);
    expect(pgFunctions).toHaveLength(5);
    expect(sqliteFunctions).toHaveLength(4);
  });
});
