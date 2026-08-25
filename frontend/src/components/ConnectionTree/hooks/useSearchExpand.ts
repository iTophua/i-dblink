import { useCallback, useEffect, useRef } from 'react';
import type { Connection } from '../../../stores/appStore';
import { isBaseTable } from '../utils/tableTypeHelpers';

/**
 * 搜索时自动展开命中节点的父级；搜索清空后做差量恢复：
 * 只收起搜索期间"自动展开"的键，搜索前已展开的键和用户在搜索期间的
 * 手动展开/收起全部保留（整体快照回滚会吞掉清空瞬间的用户手势，
 * 例如双击展开连接 → 清空搜索 → 快照恢复又把它收起）。
 */
export function useSearchExpand(
  searchText: string,
  filteredConnections: Connection[],
  connectionDatabases: Record<string, any[]>,
  expandedKeysRef: React.MutableRefObject<string[]>,
  onExpandKeys: (keys: string[]) => void
) {
  // 搜索前已展开的键（受保护，恢复时不收起）；null 表示当前无搜索
  const preSearchKeysRef = useRef<string[] | null>(null);
  // 搜索期间由自动展开新增的键（恢复时收起）
  const searchAddedKeysRef = useRef<Set<string>>(new Set());

  /**
   * 保护连接子树不被"清空搜索后的差量恢复"收起：
   * 用户主动展开的连接（含其所在分组、库、表目录等全部子键）应保持展开，
   * 即使这些键最初是搜索自动展开的。子键统一含 ::connId:: 分隔符（ID 为 UUID，无歧义）。
   */
  const protectConnectionKeys = useCallback((connId: string, groupKeys: string[] = []) => {
    const added = searchAddedKeysRef.current;
    if (added.size === 0) return;
    for (const k of Array.from(added)) {
      if (k === connId || k.includes(`::${connId}::`) || groupKeys.includes(k)) added.delete(k);
    }
  }, []);

  useEffect(() => {
    const q = searchText.trim().toLowerCase();

    // 搜索结束：差量恢复——收起搜索自动展开的键（搜索前就展开的除外）
    if (!q) {
      const snapshot = preSearchKeysRef.current;
      if (snapshot) {
        preSearchKeysRef.current = null;
        const added = searchAddedKeysRef.current;
        searchAddedKeysRef.current = new Set();
        onExpandKeys(
          expandedKeysRef.current.filter((k) => !added.has(k) || snapshot.includes(k))
        );
      }
      return;
    }

    if (preSearchKeysRef.current == null) {
      preSearchKeysRef.current = [...expandedKeysRef.current];
      searchAddedKeysRef.current = new Set();
    }

    const expandSet = new Set<string>();

    for (const conn of filteredConnections) {
      // 命中连接所在分组也要展开——分组折叠时子连接不可见，搜索结果无从点起
      if (conn.group_id && conn.group_id !== 'default') {
        expandSet.add(`group-${conn.group_id}`);
      }
      const dbList = connectionDatabases[conn.id] || [];
      for (const db of dbList) {
        if (db.database.toLowerCase().includes(q)) {
          // 连接节点也要展开，否则折叠状态下看不到命中的库
          expandSet.add(conn.id);
          expandSet.add(`db::${conn.id}::${db.database}`);
        }

        if (db.loaded && db.tables.length > 0) {
          for (const table of db.tables) {
            const tableName = table.table_name.toLowerCase();
            if (tableName.includes(q)) {
              expandSet.add(conn.id);
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
      // 只记录"新增"的键（已展开的不算搜索加的），恢复时才收起
      const currentSet = new Set(expandedKeysRef.current);
      for (const k of expandSet) {
        if (!currentSet.has(k)) searchAddedKeysRef.current.add(k);
      }
      const merged = new Set(expandedKeysRef.current);
      for (const k of expandSet) merged.add(k);
      onExpandKeys(Array.from(merged));
    }
  }, [searchText, filteredConnections, connectionDatabases, onExpandKeys, expandedKeysRef]);

  return { protectConnectionKeys };
}
