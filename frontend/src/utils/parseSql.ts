/**
 * 安全地切分 SQL 多语句，正确处理字符串字面量、引号标识符、注释中的分号。
 * 用于执行用户提供的多条 DDL/DML（如表设计器生成的 ALTER 序列）。
 */

export interface SqlParseStats {
  creates: number;
  inserts: number;
  updates: number;
  deletes: number;
  others: number;
}

export interface SqlParseResult {
  statements: string[];
  stats: SqlParseStats;
}

export function parseSqlStatements(sql: string): SqlParseResult {
  const statements: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inBacktick = false;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    // 行注释 --
    if (ch === '-' && next === '-' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    // 块注释 /* */
    if (ch === '/' && next === '*' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      i += 2;
      while (i < sql.length - 1 && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    if (ch === "'" && !inDoubleQuote && !inBacktick) {
      if (inSingleQuote && next === "'") {
        current += "''";
        i += 2;
        continue;
      }
      inSingleQuote = !inSingleQuote;
    } else if (ch === '"' && !inSingleQuote && !inBacktick) {
      inDoubleQuote = !inDoubleQuote;
    } else if (ch === '`' && !inSingleQuote && !inDoubleQuote) {
      inBacktick = !inBacktick;
    }

    if (ch === ';' && !inSingleQuote && !inDoubleQuote && !inBacktick) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const trimmed = current.trim();
  if (trimmed) statements.push(trimmed);

  const stats: SqlParseStats = { creates: 0, inserts: 0, updates: 0, deletes: 0, others: 0 };
  for (const s of statements) {
    const upper = s.trimStart().toUpperCase();
    if (upper.startsWith('CREATE')) stats.creates++;
    else if (upper.startsWith('INSERT')) stats.inserts++;
    else if (upper.startsWith('UPDATE')) stats.updates++;
    else if (upper.startsWith('DELETE')) stats.deletes++;
    else stats.others++;
  }

  return { statements, stats };
}
