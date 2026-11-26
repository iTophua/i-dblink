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

export interface SplitSqlOptions {
  /**
   * 字符串里的反斜杠是不是转义符。只有 MySQL 系（和 ClickHouse / TDengine）默认是；
   * PG（standard_conforming_strings）、SQLite、SQL Server、Oracle、达梦里反斜杠就是普通字符。
   * 不传时按「是」处理（沿用旧行为）。PG 的 E'…' 不受影响：那种写法里反斜杠始终是转义符
   */
  backslashEscapes?: boolean;
}

/**
 * 这种数据库的字符串里反斜杠是不是转义符。不认识的类型按「是」处理（沿用旧行为）
 */
export function stringBackslashIsEscape(dbType?: string): boolean {
  switch (dbType) {
    case 'postgresql':
    case 'kingbase':
    case 'highgo':
    case 'vastbase':
    case 'sqlite':
    case 'sqlserver':
    case 'oracle':
    case 'dameng':
      return false;
    default:
      return true;
  }
}

/** 引号前面是不是 PG 转义字符串的前缀 E（紧挨着标识符的 e 不算） */
function isEscapeStringPrefix(sql: string, quoteAt: number): boolean {
  const prev = sql[quoteAt - 1];
  if (prev !== 'E' && prev !== 'e') return false;
  return !/[A-Za-z0-9_$]/.test(sql[quoteAt - 2] ?? '');
}

/**
 * 智能分割 SQL 语句，忽略字符串和注释中的分号。
 * 支持 MySQL 客户端 DELIMITER 指令：`delimiter //` 之后以 `//` 作为语句结束符
 * （存储过程/函数/触发器体内的分号不再切分语句），`delimiter ;` 恢复。
 * 指令行本身不产生语句；切出的语句文本不含结束符。
 * @param sql SQL 字符串
 * @param options 反斜杠在字符串里是否是转义符（按目标库的方言传，见 stringBackslashIsEscape）
 * @returns SQL 语句数组
 */
export function splitSqlStatements(sql: string, options?: SplitSqlOptions): string[] {
  return getSqlStatementRanges(sql, options).map((r) => r.text);
}

export interface SqlStatementRange {
  /** 语句文本（已 trim，不含结束符与 DELIMITER 指令行） */
  text: string;
  /** 语句（trim 后首字符）在原文中的起始偏移 */
  startOffset: number;
  /** 语句 trim 后末字符的下一个偏移 */
  endOffset: number;
}

/**
 * 带原文偏移的语句切分，扫描规则与 splitSqlStatements 完全一致
 * （字符串/注释内的分号不切分、支持 DELIMITER 指令）。
 * 偏移指向 trim 后的语句体本身，供编辑器 gutter 定位语句起始行使用。
 */
export function getSqlStatementRanges(sql: string, options?: SplitSqlOptions): SqlStatementRange[] {
  const statements: SqlStatementRange[] = [];
  let start = -1; // 当前语句首字符偏移（-1 表示尚未出现代码）
  let inString = false;
  let stringChar = '';
  // 当前字符串里反斜杠是否转义：由方言决定，PG 的 E'…' 一律是
  let stringBackslash = options?.backslashEscapes !== false;
  let inLineComment = false;
  let inBlockComment = false;
  let delimiter = ';';
  // 只在语句边界（开头/上一条语句结束后）识别 DELIMITER 指令；
  // 穿过空白与注释仍视为边界，直到出现真正的语句代码
  let atBoundary = true;

  const flush = (endExclusive: number) => {
    if (start >= 0 && endExclusive > start) {
      const text = sql.slice(start, endExclusive).trim();
      if (text) {
        statements.push({ text, startOffset: start, endOffset: endExclusive });
      }
    }
    start = -1;
    atBoundary = true;
  };

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const nextChar = sql[i + 1];

    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if (inString) {
      if (stringBackslash && char === '\\' && nextChar) {
        i++;
        continue;
      }
      if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    // 语句边界处识别 DELIMITER 指令：整行消费、切换结束符，不产生语句
    if (atBoundary) {
      const m = /^delimiter[ \t]+(\S+)[^\n]*/i.exec(sql.slice(i));
      if (m) {
        delimiter = m[1];
        i += m[0].length - 1;
        continue;
      }
    }

    if (char === '-' && nextChar === '-') {
      if (start < 0) start = i;
      inLineComment = true;
      continue;
    }

    if (char === '/' && nextChar === '*') {
      if (start < 0) start = i;
      inBlockComment = true;
      i++;
      continue;
    }

    if (char === "'" || char === '"' || char === '`') {
      inString = true;
      stringChar = char;
      stringBackslash =
        options?.backslashEscapes !== false || (char === "'" && isEscapeStringPrefix(sql, i));
      if (start < 0) start = i;
      atBoundary = false;
      continue;
    }

    // 默认 ';' 结束符；自定义结束符（如 //、$$）在引号/注释外任意位置命中即切分，
    // 允许紧贴语句结尾书写（END//、END$$）
    if (delimiter === ';' ? char === ';' : sql.startsWith(delimiter, i)) {
      flush(i);
      if (delimiter !== ';') {
        i += delimiter.length - 1;
      }
      continue;
    }

    // 注释随语句保留（与 splitSqlStatements 原语义一致：注释视作语句段内容）
    if (start < 0 && !/\s/.test(char)) {
      start = i;
    }
    if (!/\s/.test(char)) {
      atBoundary = false;
    }
  }

  flush(sql.length);

  return statements;
}
