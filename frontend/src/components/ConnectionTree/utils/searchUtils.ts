import type { Connection } from '../../../stores/appStore';

/**
 * 连接是否命中搜索词：匹配 名称 / 主机 / 用户名 / 数据库类型 / 默认库。
 * 统一树过滤与自动展开两处的匹配口径，避免"搜 host 时树不过滤但展开逻辑在跑"的割裂行为。
 * q 需已 toLowerCase；空串返回 true（不过滤）。
 */
export function matchesConnection(conn: Connection, q: string): boolean {
  if (!q) return true;
  return !!(
    conn.name?.toLowerCase().includes(q) ||
    conn.host?.toLowerCase().includes(q) ||
    conn.username?.toLowerCase().includes(q) ||
    conn.db_type?.toLowerCase().includes(q) ||
    conn.database?.toLowerCase().includes(q)
  );
}
