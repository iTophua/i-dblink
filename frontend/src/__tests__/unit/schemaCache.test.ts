import { describe, it, expect, beforeEach, vi } from 'vitest';

interface SchemaCompletionEntry {
  tables: Map<string, string[]>;
  views: Map<string, string[]>;
  timestamp: number;
}

class SchemaCompletionCache {
  private cache = new Map<string, SchemaCompletionEntry>();
  private ttl = 10 * 60 * 1000;
  private pendingPromises = new Map<string, Promise<SchemaCompletionEntry>>();

  private makeKey(connectionId: string, database: string): string {
    return `${connectionId}::${database}`;
  }

  async get(
    connectionId: string,
    database: string,
    getTables: () => Promise<Array<{ table_name: string; table_type?: string }>>,
    getColumns: (tableName: string) => Promise<Array<{ column_name: string }>>
  ): Promise<SchemaCompletionEntry> {
    const key = this.makeKey(connectionId, database);
    const entry = this.cache.get(key);

    if (entry && Date.now() - entry.timestamp < this.ttl) {
      return entry;
    }

    const pending = this.pendingPromises.get(key);
    if (pending) {
      return pending;
    }

    const promise = (async () => {
      const tablesResult = await getTables();
      const tablesMap = new Map<string, string[]>();
      const viewsMap = new Map<string, string[]>();

      for (const table of tablesResult) {
        const tableType = (table.table_type || '').toUpperCase().trim();
        const isView =
          tableType === 'VIEW' || tableType === 'SYSTEM VIEW' || tableType === 'MATERIALIZED VIEW';
        const targetMap = isView ? viewsMap : tablesMap;

        try {
          const columns = await getColumns(table.table_name);
          targetMap.set(
            table.table_name,
            columns.map((c) => c.column_name)
          );
        } catch {
          targetMap.set(table.table_name, []);
        }
      }

      const entry: SchemaCompletionEntry = {
        tables: tablesMap,
        views: viewsMap,
        timestamp: Date.now(),
      };

      this.cache.set(key, entry);
      this.pendingPromises.delete(key);
      return entry;
    })();

    this.pendingPromises.set(key, promise);
    return promise;
  }

  invalidate(connectionId: string, database?: string): void {
    if (database) {
      this.cache.delete(this.makeKey(connectionId, database));
    } else {
      for (const key of this.cache.keys()) {
        if (key.startsWith(`${connectionId}::`)) {
          this.cache.delete(key);
        }
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

const schemaCompletionCache = new SchemaCompletionCache();

describe('SchemaCompletionCache', () => {
  let cache: SchemaCompletionCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new SchemaCompletionCache();
  });

  describe('get', () => {
    it('returns cached entry within TTL', async () => {
      const mockTables = [
        { table_name: 'users', table_type: 'BASE TABLE' },
        { table_name: 'roles', table_type: 'BASE TABLE' },
        { table_name: 'v_active', table_type: 'VIEW' },
      ];
      const mockColumns = (tableName: string) =>
        Promise.resolve([{ column_name: 'id' }, { column_name: 'name' }]);

      const result1 = await cache.get(
        'conn1',
        'db1',
        () => Promise.resolve(mockTables),
        mockColumns
      );
      expect(result1.tables.size).toBe(2);
      expect(result1.views.size).toBe(1);
      expect(result1.tables.get('users')).toEqual(['id', 'name']);
      expect(result1.views.get('v_active')).toEqual(['id', 'name']);

      const result2 = await cache.get('conn1', 'db1', () => Promise.resolve([]), mockColumns);
      expect(result2).toBe(result1);
    });

    it('returns null for expired entry', async () => {
      const mockTables = [{ table_name: 'users', table_type: 'BASE TABLE' }];
      const mockColumns = () => Promise.resolve([{ column_name: 'id' }]);

      await cache.get('conn1', 'db1', () => Promise.resolve(mockTables), mockColumns);

      vi.advanceTimersByTime(11 * 60 * 1000);

      const result = await cache.get(
        'conn1',
        'db1',
        () => Promise.resolve(mockTables),
        mockColumns
      );
      expect(result.tables.size).toBe(1);
    });

    it('deduplicates concurrent requests', async () => {
      let resolveFn: (value: Array<{ table_name: string; table_type?: string }>) => void;
      const tablePromise = new Promise<Array<{ table_name: string; table_type?: string }>>(
        (resolve) => {
          resolveFn = resolve;
        }
      );
      const mockColumns = () => Promise.resolve([{ column_name: 'id' }]);

      const result1 = cache.get('conn1', 'db1', () => tablePromise, mockColumns);
      const result2 = cache.get('conn1', 'db1', () => tablePromise, mockColumns);
      const result3 = cache.get('conn1', 'db1', () => tablePromise, mockColumns);

      resolveFn!([{ table_name: 'users', table_type: 'BASE TABLE' }]);

      const [r1, r2, r3] = await Promise.all([result1, result2, result3]);
      expect(r1).toBe(r2);
      expect(r2).toBe(r3);
    });

    it('handles getColumns failure gracefully', async () => {
      const mockTables = [
        { table_name: 'users', table_type: 'BASE TABLE' },
        { table_name: 'broken', table_type: 'BASE TABLE' },
      ];
      const mockColumns = (tableName: string) => {
        if (tableName === 'broken') return Promise.reject(new Error('Fail'));
        return Promise.resolve([{ column_name: 'id' }]);
      };

      const result = await cache.get(
        'conn1',
        'db1',
        () => Promise.resolve(mockTables),
        mockColumns
      );
      expect(result.tables.get('users')).toEqual(['id']);
      expect(result.tables.get('broken')).toEqual([]);
    });

    it('distinguishes tables from views', async () => {
      const mockTables = [
        { table_name: 'users', table_type: 'BASE TABLE' },
        { table_name: 'v_active', table_type: 'VIEW' },
        { table_name: 'v_summary', table_type: 'MATERIALIZED VIEW' },
        { table_name: 'sys_tables', table_type: 'SYSTEM VIEW' },
      ];
      const mockColumns = () => Promise.resolve([{ column_name: 'id' }]);

      const result = await cache.get(
        'conn1',
        'db1',
        () => Promise.resolve(mockTables),
        mockColumns
      );
      expect(result.tables.size).toBe(1);
      expect(result.views.size).toBe(3);
      expect(result.tables.has('users')).toBe(true);
      expect(result.views.has('v_active')).toBe(true);
      expect(result.views.has('v_summary')).toBe(true);
      expect(result.views.has('sys_tables')).toBe(true);
    });
  });

  describe('invalidate', () => {
    it('invalidates specific database', async () => {
      const mockTables = [{ table_name: 'users', table_type: 'BASE TABLE' }];
      const mockColumns = () => Promise.resolve([{ column_name: 'id' }]);

      await cache.get('conn1', 'db1', () => Promise.resolve(mockTables), mockColumns);
      await cache.get('conn1', 'db2', () => Promise.resolve(mockTables), mockColumns);
      expect(cache.size).toBe(2);

      cache.invalidate('conn1', 'db1');
      expect(cache.size).toBe(1);
    });

    it('invalidates all databases for a connection', async () => {
      const mockTables = [{ table_name: 'users', table_type: 'BASE TABLE' }];
      const mockColumns = () => Promise.resolve([{ column_name: 'id' }]);

      await cache.get('conn1', 'db1', () => Promise.resolve(mockTables), mockColumns);
      await cache.get('conn1', 'db2', () => Promise.resolve(mockTables), mockColumns);
      await cache.get('conn2', 'db1', () => Promise.resolve(mockTables), mockColumns);
      expect(cache.size).toBe(3);

      cache.invalidate('conn1');
      expect(cache.size).toBe(1);
    });

    it('does nothing for non-existent entry', () => {
      cache.invalidate('nonexistent');
      expect(cache.size).toBe(0);
    });
  });

  describe('clear', () => {
    it('removes all entries', async () => {
      const mockTables = [{ table_name: 'users', table_type: 'BASE TABLE' }];
      const mockColumns = () => Promise.resolve([{ column_name: 'id' }]);

      await cache.get('conn1', 'db1', () => Promise.resolve(mockTables), mockColumns);
      await cache.get('conn2', 'db2', () => Promise.resolve(mockTables), mockColumns);
      expect(cache.size).toBe(2);

      cache.clear();
      expect(cache.size).toBe(0);
    });
  });
});
