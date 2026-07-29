import { api } from '../api';

/**
 * 并行拉取指定连接下多个数据库的所有表字段，格式化为表结构上下文字符串。
 * 表名带库前缀（db.table），支持跨库 JOIN 场景。
 *
 * 示例输出：
 * db_a.users (id INT, name VARCHAR(255), email VARCHAR(255))
 * db_b.orders (id INT, user_id INT, amount DECIMAL(10,2))
 */
export async function buildTableInfo(
  connectionId: string,
  databases: string[]
): Promise<string> {
  if (!connectionId || databases.length === 0) return '';

  const parts = await Promise.all(
    databases.map(async (db) => {
      try {
        const allColumns = await api.getAllColumns(connectionId, db);
        return Object.entries(allColumns)
          .map(([table, cols]) => {
            const colStr = cols.map((c) => `${c.column_name} ${c.data_type}`).join(', ');
            return `${db}.${table} (${colStr})`;
          })
          .join('\n');
      } catch {
        return '';
      }
    })
  );

  return parts.filter(Boolean).join('\n\n');
}
