import { useEffect } from 'react';
import type { Connection } from '../../../stores/appStore';
import { isBaseTable } from '../utils/tableTypeHelpers';

/**
 * Auto-expand tree nodes when search text matches databases/tables.
 */
export function useSearchExpand(
  searchText: string,
  filteredConnections: Connection[],
  connectionDatabases: Record<string, any[]>,
  expandedKeysRef: React.MutableRefObject<string[]>,
  onExpandKeys: (keys: string[]) => void
) {
  useEffect(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return;

    const expandSet = new Set<string>();

    for (const conn of filteredConnections) {
      const dbList = connectionDatabases[conn.id] || [];
      for (const db of dbList) {
        if (db.database.toLowerCase().includes(q)) {
          expandSet.add(`db::${conn.id}::${db.database}`);
        }

        if (db.loaded && db.tables.length > 0) {
          for (const table of db.tables) {
            const tableName = table.table_name.toLowerCase();
            if (tableName.includes(q)) {
              if (table.schema) {
                const sk = `schema::${conn.id}::${db.database}::${table.schema}`;
                const tfk = isBaseTable(table.table_type)
                  ? `tables::${conn.id}::${db.database}::${table.schema}`
                  : `views::${conn.id}::${db.database}::${table.schema}`;
                expandSet.add(`db::${conn.id}::${db.database}`);
                expandSet.add(sk);
                expandSet.add(tfk);
              } else {
                expandSet.add(`db::${conn.id}::${db.database}`);
                if (isBaseTable(table.table_type)) {
                  expandSet.add(`tables::${conn.id}::${db.database}`);
                } else {
                  expandSet.add(`views::${conn.id}::${db.database}`);
                }
              }
            }
          }
        }
      }
    }

    if (expandSet.size > 0) {
      const merged = new Set(expandedKeysRef.current);
      for (const k of expandSet) merged.add(k);
      onExpandKeys(Array.from(merged));
    }
  }, [searchText, filteredConnections, connectionDatabases, onExpandKeys, expandedKeysRef]);
}
