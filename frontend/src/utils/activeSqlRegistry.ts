/** SQL 写入编辑器的方式：追加到末尾 / 替换全部内容 */
export type SqlInjectMode = 'append' | 'replace';

export interface SqlInjectDetail {
  mode: SqlInjectMode;
  sql: string;
  /** 目标 SQL tab key。编辑器只响应发给自己的注入，避免广播到所有已打开的 SQL 标签页 */
  tabKey?: string;
}

export const SQL_INJECT_EVENT = 'ai-sql-inject';

type SqlReader = () => { sql: string; selection: string };

/** tabKey → 读取器（由 SQLEditor 挂载时登记） */
const readers = new Map<string, SqlReader>();

/**
 * 登记某个 SQL tab 的文本读取器，返回注销函数。
 * 工作区内可能有多个已打开的 SQL 标签页，按 tabKey 区分，供 AI 面板读取「当前 SQL」。
 */
export function registerSqlReader(tabKey: string, reader: SqlReader): () => void {
  readers.set(tabKey, reader);
  return () => {
    if (readers.get(tabKey) === reader) readers.delete(tabKey);
  };
}

/** 读取指定 SQL tab 的全文与选区；tab 未挂载返回 null */
export function readSqlFromEditor(tabKey: string): { sql: string; selection: string } | null {
  return readers.get(tabKey)?.() ?? null;
}

export function injectSqlToEditor(detail: SqlInjectDetail): void {
  window.dispatchEvent(new CustomEvent(SQL_INJECT_EVENT, { detail }));
}
