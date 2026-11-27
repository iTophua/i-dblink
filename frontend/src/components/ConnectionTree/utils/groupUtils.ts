import type { Connection } from '../../../stores/appStore';

/** 后端「未分组」伪分组的 id（移到分组菜单里用它表示不分组） */
export const UNGROUPED_GROUP_ID = 'default';

/**
 * 连接是否「不分组」。未分组在后端存 NULL；会话里 / 旧数据里的连接还可能带伪分组 id
 * 'default'，两种都要算未分组——连接树只按这个口径归组，漏掉哪种都会让连接在树里不显示
 */
export function isUngroupedConnection(conn: Pick<Connection, 'group_id'>): boolean {
  return !conn.group_id || conn.group_id === UNGROUPED_GROUP_ID;
}
