import { useEffect, useRef } from 'react';
import type { Connection } from '../../../stores/appStore';
import { isBaseTable } from '../utils/tableTypeHelpers';

/**
 * 搜索时自动展开命中节点的父级；搜索清空后恢复搜索前的展开状态。
 * 快照在"无搜索词 → 有搜索词"的切换时刻拍下，避免把搜索期间自动展开的节点也存进去。
 */
export function useSearchExpand(
  searchText: string,
  filteredConnections: Connection[],
  connectionDatabases: Record<string, any[]>,
  expandedKeysRef: React.MutableRefObject<string[]>,
  onExpandKeys: (keys: string[]) => void
) {
  const preSearchKeysRef = useRef<string[] | null>(null);

  useEffect(() => {
    const q = searchText.trim().toLowerCase();

    // 搜索结束：恢复搜索前的展开状态（仅当搜索期间拍过快照）
    if (!q) {
      const snapshot = preSearchKeysRef.current;
      if (snapshot) {
        preSearchKeysRef.current = null;
        onExpandKeys(snapshot);
      }
      return;
    }

    if (preSearchKeysRef.current == null) {
      preSearchKeysRef.current = [...expandedKeysRef.current];
    }

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
