import type { DatabaseType } from '../types/api';
import { getDialect } from './sqlDialects';

/**
 * 数据库标识符转义 - 根据数据库类型选择合适的引号
 * @param name 标识符名称
 * @param dbType 数据库类型
 * @returns 转义后的标识符
 */
export function escapeSqlIdentifier(name: string, dbType?: string): string {
  return getDialect(dbType).escapeIdentifier(name);
}

/**
 * SQL 值转义 - 防止 SQL 注入
 * @param value 任意值
 * @returns 转义后的 SQL 值字符串
 */
export function escapeSqlValue(value: unknown, dbType?: string): string {
  return getDialect(dbType).escapeValue(value);
}

/**
 * 智能分割 SQL 语句，忽略字符串和注释中的分号
 * @param sql SQL 字符串
 * @returns SQL 语句数组
 */
export function splitSqlStatements(sql: string): string[] {
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
      if (char === '\n') {
        inLineComment = false;
      }
      current += char;
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        current += char;
        current += nextChar;
        i++;
        continue;
      }
      current += char;
      continue;
    }

    if (inString) {
      if (char === '\\' && nextChar) {
        current += char;
        current += nextChar;
        i++;
        continue;
      }
      if (char === stringChar) {
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
      current += char;
      current += nextChar;
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
      if (trimmed) {
        statements.push(trimmed);
      }
      current = '';
      continue;
    }

    current += char;
  }

  const trimmed = current.trim();
  if (trimmed) {
    statements.push(trimmed);
  }

  return statements;
}
