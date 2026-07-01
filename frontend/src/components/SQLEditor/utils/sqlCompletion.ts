// ========== SQL 智能补全上下文分析器 ==========

/**
 * 提取当前 SQL 语句（从上一个 ; 到光标位置）
 */
export function getCurrentStatement(text: string, cursorOffset: number): string {
  const beforeCursor = text.slice(0, cursorOffset);
  const lastSemicolon = beforeCursor.lastIndexOf(';');
  return beforeCursor.slice(lastSemicolon + 1);
}

/**
 * 检查位置是否在字符串或注释中（简化版）
 */
export function isInStringOrComment(text: string, offset: number): boolean {
  let inString: string | null = null;
  let inComment = false;
  let i = 0;
  while (i < offset) {
    const ch = text[i];
    const next = text[i + 1];
    if (inComment) {
      if (ch === '\n') inComment = false;
      i++;
      continue;
    }
    if (inString) {
      if (ch === '\\') { i += 2; continue; }
      if (ch === inString) inString = null;
      i++;
      continue;
    }
    if (ch === '-' && next === '-') { inComment = true; i += 2; continue; }
    if (ch === '/' && next === '*') {
      const end = text.indexOf('*/', i + 2);
      if (end !== -1 && end < offset) { i = end + 2; continue; }
      return true;
    }
    if (ch === "'" || ch === '"' || ch === '`') inString = ch;
    i++;
  }
  return inString !== null || inComment;
}

/** 语句类型 */
export type SqlStmtType = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'CREATE' | 'ALTER' | 'DROP' | 'UNKNOWN';

export function detectStatementType(stmt: string): SqlStmtType {
  const trimmed = stmt.trim().toUpperCase();
  if (trimmed.startsWith('SELECT')) return 'SELECT';
  if (trimmed.startsWith('INSERT')) return 'INSERT';
  if (trimmed.startsWith('UPDATE')) return 'UPDATE';
  if (trimmed.startsWith('DELETE')) return 'DELETE';
  if (trimmed.startsWith('CREATE')) return 'CREATE';
  if (trimmed.startsWith('ALTER')) return 'ALTER';
  if (trimmed.startsWith('DROP')) return 'DROP';
  return 'UNKNOWN';
}

/** 当前光标所在的关键字上下文 */
export interface SqlContext {
  stmtType: SqlStmtType;
  isAfterFrom: boolean;
  isAfterJoin: boolean;
  isAfterSelect: boolean;
  isAfterWhere: boolean;
  isAfterOrderBy: boolean;
  isAfterGroupBy: boolean;
  isAfterHaving: boolean;
  isAfterSet: boolean;
  isAfterInsertInto: boolean;
  isAfterValues: boolean;
  isAfterUpdateTable: boolean;
  isAfterDeleteFrom: boolean;
  isAfterCreateTable: boolean;
  isAfterAlterTable: boolean;
  isAfterDrop: boolean;
  lastKeyword: string | null;
  tableRefs: string[]; // 当前语句中引用的表名（简单提取）
}

export function analyzeSqlContext(textBeforeCursor: string): SqlContext {
  const upper = textBeforeCursor.toUpperCase();
  const ctx: SqlContext = {
    stmtType: detectStatementType(textBeforeCursor),
    isAfterFrom: false,
    isAfterJoin: false,
    isAfterSelect: false,
    isAfterWhere: false,
    isAfterOrderBy: false,
    isAfterGroupBy: false,
    isAfterHaving: false,
    isAfterSet: false,
    isAfterInsertInto: false,
    isAfterValues: false,
    isAfterUpdateTable: false,
    isAfterDeleteFrom: false,
    isAfterCreateTable: false,
    isAfterAlterTable: false,
    isAfterDrop: false,
    lastKeyword: null,
    tableRefs: [],
  };

  // 提取最后的关键字位置（使用反向搜索，避免子查询干扰）
  const keywords = [
    'FROM', 'JOIN', 'SELECT', 'WHERE', 'ORDER BY', 'GROUP BY', 'HAVING',
    'SET', 'INSERT INTO', 'VALUES', 'UPDATE', 'DELETE FROM',
    'CREATE TABLE', 'ALTER TABLE', 'DROP',
  ];

  let lastPos = -1;
  for (const kw of keywords) {
    const pos = upper.lastIndexOf(kw);
    if (pos > lastPos) {
      lastPos = pos;
      ctx.lastKeyword = kw;
    }
  }

  // 简单提取表引用（FROM 和 JOIN 后的表名）
  const fromMatches = textBeforeCursor.match(/\bFROM\s+(\w+)/gi);
  if (fromMatches) {
    fromMatches.forEach(m => {
      const table = m.replace(/\bFROM\s+/i, '');
      if (!ctx.tableRefs.includes(table)) ctx.tableRefs.push(table);
    });
  }
  const joinMatches = textBeforeCursor.match(/\bJOIN\s+(\w+)/gi);
  if (joinMatches) {
    joinMatches.forEach(m => {
      const table = m.replace(/\bJOIN\s+/i, '');
      if (!ctx.tableRefs.includes(table)) ctx.tableRefs.push(table);
    });
  }

  // 判断上下文（基于最后关键字）
  switch (ctx.lastKeyword) {
    case 'FROM': ctx.isAfterFrom = true; break;
    case 'JOIN': ctx.isAfterJoin = true; break;
    case 'SELECT': ctx.isAfterSelect = true; break;
    case 'WHERE': ctx.isAfterWhere = true; break;
    case 'ORDER BY': ctx.isAfterOrderBy = true; break;
    case 'GROUP BY': ctx.isAfterGroupBy = true; break;
    case 'HAVING': ctx.isAfterHaving = true; break;
    case 'SET': ctx.isAfterSet = true; break;
    case 'INSERT INTO': ctx.isAfterInsertInto = true; break;
    case 'VALUES': ctx.isAfterValues = true; break;
    case 'UPDATE': ctx.isAfterUpdateTable = true; break;
    case 'DELETE FROM': ctx.isAfterDeleteFrom = true; break;
    case 'CREATE TABLE': ctx.isAfterCreateTable = true; break;
    case 'ALTER TABLE': ctx.isAfterAlterTable = true; break;
    case 'DROP': ctx.isAfterDrop = true; break;
  }

  return ctx;
}

/**
 * 判断是否需要列名建议
 */
export function shouldSuggestColumns(ctx: SqlContext): boolean {
  return ctx.isAfterSelect || ctx.isAfterWhere || ctx.isAfterOrderBy ||
         ctx.isAfterGroupBy || ctx.isAfterHaving || ctx.isAfterSet ||
         ctx.isAfterInsertInto || ctx.isAfterUpdateTable || ctx.isAfterDeleteFrom;
}

/**
 * 判断是否需要表名建议
 */
export function shouldSuggestTables(ctx: SqlContext): boolean {
  return ctx.isAfterFrom || ctx.isAfterJoin || ctx.isAfterInsertInto ||
         ctx.isAfterUpdateTable || ctx.isAfterDeleteFrom || ctx.isAfterAlterTable ||
         ctx.isAfterDrop;
}

/**
 * 获取数据库特定的数据类型建议
 */
export function getDbSpecificDataTypes(dbType: string | undefined): string[] {
  if (!dbType) return ['INT', 'VARCHAR(255)', 'TEXT', 'DECIMAL(10,2)', 'DATETIME', 'BOOLEAN'];

  switch (dbType) {
    case 'mysql':
    case 'mariadb':
      return [
        'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
        'VARCHAR(255)', 'TEXT', 'LONGTEXT',
        'DECIMAL(10,2)', 'FLOAT', 'DOUBLE',
        'DATETIME', 'TIMESTAMP', 'DATE', 'TIME',
        'BOOLEAN', 'JSON',
        'CHAR(1)', 'BINARY(16)', 'BLOB',
      ];
    case 'postgresql':
    case 'kingbase':
    case 'highgo':
    case 'vastbase':
      return [
        'INTEGER', 'BIGINT', 'SMALLINT', 'SERIAL', 'BIGSERIAL',
        'VARCHAR(255)', 'TEXT', 'CHAR(1)',
        'NUMERIC(10,2)', 'REAL', 'DOUBLE PRECISION',
        'TIMESTAMP', 'TIMESTAMPTZ', 'DATE', 'TIME',
        'BOOLEAN', 'JSON', 'JSONB', 'UUID',
        'BYTEA', 'ARRAY', 'INTERVAL',
      ];
    case 'sqlite':
      return [
        'INTEGER', 'REAL', 'TEXT', 'BLOB', 'NUMERIC',
        'BOOLEAN', 'DATETIME', 'DATE', 'TIME',
      ];
    case 'sqlserver':
      return [
        'INT', 'BIGINT', 'SMALLINT', 'TINYINT',
        'VARCHAR(255)', 'NVARCHAR(255)', 'TEXT', 'NTEXT',
        'DECIMAL(10,2)', 'FLOAT', 'REAL', 'MONEY',
        'DATETIME', 'DATETIME2', 'DATE', 'TIME',
        'BIT', 'UNIQUEIDENTIFIER', 'VARBINARY(MAX)',
        'XML', 'GEOGRAPHY',
      ];
    case 'oracle':
    case 'dameng':
      return [
        'NUMBER(10,2)', 'INTEGER', 'BINARY_INTEGER',
        'VARCHAR2(255)', 'NVARCHAR2(255)', 'CLOB', 'NCLOB',
        'DATE', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE',
        'BLOB', 'RAW(2000)', 'LONG RAW',
        'BOOLEAN', 'XMLTYPE',
      ];
    default:
      return ['INT', 'VARCHAR(255)', 'TEXT', 'DECIMAL(10,2)', 'DATETIME', 'BOOLEAN'];
  }
}

// 预编译的正则表达式（避免每次触发重新编译）
export const REGEX_PATTERNS = {
  fromOrJoin: /\b(FROM|JOIN|INTO|UPDATE|DELETE\s+FROM)\s*$/i,
  select: /\bSELECT\s+.*$/i,
  where: /\bWHERE\s+.*$/i,
  afterTableRef: /\b(FROM|JOIN)\s+(?:\w+\s*,\s*)*\w+\s*$/i,
  hasTableAlias: /\b(FROM|JOIN)\s+\w+\s+(?:AS\s+)?(\w+)\s*$/i,
};
