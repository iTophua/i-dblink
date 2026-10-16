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
 * 智能分割 SQL 语句，忽略字符串和注释中的分号。
 * 支持 MySQL 客户端 DELIMITER 指令：`delimiter //` 之后以 `//` 作为语句结束符
 * （存储过程/函数/触发器体内的分号不再切分语句），`delimiter ;` 恢复。
 * 指令行本身不产生语句；切出的语句文本不含结束符。
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
  let delimiter = ';';
  // 只在语句边界（开头/上一条语句结束后）识别 DELIMITER 指令；
  // 穿过空白与注释仍视为边界，直到出现真正的语句代码
  let atBoundary = true;

  const flush = () => {
    const trimmed = current.trim();
    if (trimmed) {
      statements.push(trimmed);
    }
    current = '';
    atBoundary = true;
  };

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
      atBoundary = false;
      continue;
    }

    // 默认 ';' 结束符；自定义结束符（如 //、$$）在引号/注释外任意位置命中即切分，
    // 允许紧贴语句结尾书写（END//、END$$）
    if (delimiter === ';' ? char === ';' : sql.startsWith(delimiter, i)) {
      flush();
      if (delimiter !== ';') {
        i += delimiter.length - 1;
      }
      continue;
    }

    current += char;
    if (!/\s/.test(char)) {
      atBoundary = false;
    }
  }

  flush();

  return statements;
}
