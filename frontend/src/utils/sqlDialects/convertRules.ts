/**
 * SQL 方言规则转换引擎（Free 功能）
 *
 * 通过正则/模式匹配将 SQL 从一种方言转换为另一种方言。
 * 覆盖引号、LIMIT、函数名、数据类型、注释等高频差异。
 */

import type { DatabaseType } from '../../types/api';

// ── 类型定义 ──────────────────────────────────────────────────────────────

export interface VersionConstraint {
  min?: string;
  max?: string;
}

export interface ConvertContext {
  sourceDialect: DatabaseType;
  targetDialect: DatabaseType;
  sourceVersion?: string;
  targetVersion?: string;
}

export interface ConversionRule {
  id: string;
  name: string;
  description: string;
  sourceDialects: DatabaseType[];
  targetDialects: DatabaseType[];
  sourceVersion?: VersionConstraint;
  targetVersion?: VersionConstraint;
  detect: (sql: string) => boolean;
  convert: (sql: string, ctx: ConvertContext) => string;
  priority: number;
}

// ── 工具函数 ──────────────────────────────────────────────────────────────

/** 检查方言是否在列表中（包含兼容方言） */
function matchesDialect(dialect: DatabaseType, list: DatabaseType[]): boolean {
  const compatMap: Record<string, string[]> = {
    mysql: ['mysql', 'mariadb'],
    mariadb: ['mysql', 'mariadb'],
    postgresql: ['postgresql', 'kingbase', 'highgo', 'vastbase'],
    kingbase: ['postgresql', 'kingbase'],
    highgo: ['postgresql', 'highgo'],
    vastbase: ['postgresql', 'vastbase'],
    oracle: ['oracle', 'dameng'],
    dameng: ['oracle', 'dameng'],
    sqlite: ['sqlite'],
    sqlserver: ['sqlserver'],
  };
  const expanded = compatMap[dialect] ?? [dialect];
  return expanded.some((d) => list.includes(d as DatabaseType));
}

/** 检查规则是否适用于给定的源/目标方言 */
function isRuleApplicable(rule: ConversionRule, ctx: ConvertContext): boolean {
  return matchesDialect(ctx.sourceDialect, rule.sourceDialects) && matchesDialect(ctx.targetDialect, rule.targetDialects);
}

// ── P0 规则实现 ───────────────────────────────────────────────────────────

const rules: ConversionRule[] = [
  // 1. 反引号 → 双引号 (MySQL → PG/Oracle)
  {
    id: 'backtick-to-dquote',
    name: '反引号→双引号',
    description: '将 MySQL/MariaDB 的反引号标识符转为双引号标识符',
    sourceDialects: ['mysql', 'mariadb'],
    targetDialects: ['postgresql', 'oracle', 'dameng', 'kingbase', 'highgo', 'vastbase', 'sqlite'],
    detect: (sql) => /`[a-zA-Z_]\w*`/.test(sql),
    convert: (sql) => sql.replace(/`([a-zA-Z_]\w*)`/g, '"$1"'),
    priority: 1,
  },

  // 2. 双引号 → 反引号 (PG/Oracle → MySQL)
  // 注意：只匹配标识符（字母/下划线开头），不匹配字符串字面量
  {
    id: 'dquote-to-backtick',
    name: '双引号→反引号',
    description: '将双引号标识符转为 MySQL 反引号标识符',
    sourceDialects: ['postgresql', 'oracle', 'dameng', 'kingbase', 'highgo', 'vastbase'],
    targetDialects: ['mysql', 'mariadb'],
    detect: (sql) => /(?<!["\w])"[a-zA-Z_]\w*"(?!\s*[,;)\s=<>!])/.test(sql),
    convert: (sql) => sql.replace(/(?<!["\w])"([a-zA-Z_]\w*)"(?!\s*[,;)\s=<>!])/g, '`$1`'),
    priority: 1,
  },

  // 3. 方括号 → 反引号 (SQL Server → MySQL)
  {
    id: 'bracket-to-backtick',
    name: '方括号→反引号',
    description: '将 SQL Server 方括号标识符转为 MySQL 反引号',
    sourceDialects: ['sqlserver'],
    targetDialects: ['mysql', 'mariadb'],
    detect: (sql) => /\[[a-zA-Z_]\w*\]/.test(sql),
    convert: (sql) => sql.replace(/\[([a-zA-Z_]\w*)\]/g, '`$1`'),
    priority: 1,
  },

  // 4. 方括号 → 双引号 (SQL Server → PG/Oracle)
  {
    id: 'bracket-to-dquote',
    name: '方括号→双引号',
    description: '将 SQL Server 方括号标识符转为双引号',
    sourceDialects: ['sqlserver'],
    targetDialects: ['postgresql', 'oracle', 'dameng', 'kingbase', 'highgo', 'vastbase', 'sqlite'],
    detect: (sql) => /\[[a-zA-Z_]\w*\]/.test(sql),
    convert: (sql) => sql.replace(/\[([a-zA-Z_]\w*)\]/g, '"$1"'),
    priority: 1,
  },

  // 5. LIMIT → FETCH (MySQL/PG/SQLite → Oracle/SQL Server)
  {
    id: 'limit-to-fetch',
    name: 'LIMIT→FETCH',
    description: '将 LIMIT/OFFSET 分页转为 OFFSET/FETCH NEXT 语法',
    sourceDialects: ['mysql', 'mariadb', 'postgresql', 'sqlite', 'kingbase', 'highgo', 'vastbase'],
    targetDialects: ['oracle', 'dameng', 'sqlserver'],
    detect: (sql) => /\bLIMIT\s+\d+/i.test(sql),
    convert: (sql) => {
      // LIMIT n OFFSET m → OFFSET m ROWS FETCH NEXT n ROWS ONLY
      // LIMIT n → OFFSET 0 ROWS FETCH NEXT n ROWS ONLY
      return sql.replace(
        /\bLIMIT\s+(\d+)\s*(?:OFFSET\s+(\d+))?/gi,
        (_match, limit, offset) => {
          const off = offset ?? '0';
          return `OFFSET ${off} ROWS FETCH NEXT ${limit} ROWS ONLY`;
        },
      );
    },
    priority: 5,
  },

  // 6. ROWNUM → LIMIT (Oracle → MySQL/PG/SQLite)
  {
    id: 'rownum-to-limit',
    name: 'ROWNUM→LIMIT',
    description: '将 Oracle ROWNUM 分页转为 LIMIT 语法',
    sourceDialects: ['oracle', 'dameng'],
    targetDialects: ['mysql', 'mariadb', 'postgresql', 'sqlite', 'kingbase', 'highgo', 'vastbase'],
    detect: (sql) => /\bROWNUM\b/i.test(sql),
    convert: (sql) => {
      // WHERE ROWNUM <= n → LIMIT n (简化处理)
      let result = sql.replace(/\bWHERE\s+ROWNUM\s*<=\s*(\d+)/gi, 'LIMIT $1');
      result = result.replace(/\bROWNUM\s*<=\s*(\d+)/gi, 'LIMIT $1');
      return result;
    },
    priority: 6,
  },

  // 7. FETCH → LIMIT (Oracle/SQL Server → MySQL/PG/SQLite)
  {
    id: 'fetch-to-limit',
    name: 'FETCH→LIMIT',
    description: '将 OFFSET/FETCH NEXT 分页转为 LIMIT/OFFSET 语法',
    sourceDialects: ['oracle', 'dameng', 'sqlserver'],
    targetDialects: ['mysql', 'mariadb', 'postgresql', 'sqlite', 'kingbase', 'highgo', 'vastbase'],
    detect: (sql) => /\bFETCH\s+NEXT\s+\d+\s+ROWS\s+ONLY/i.test(sql),
    convert: (sql) => {
      // OFFSET m ROWS FETCH NEXT n ROWS ONLY → LIMIT n OFFSET m
      return sql.replace(
        /\bOFFSET\s+(\d+)\s+ROWS\s+FETCH\s+NEXT\s+(\d+)\s+ROWS\s+ONLY/gi,
        (_match, offset, limit) => {
          if (offset === '0') {
            return `LIMIT ${limit}`;
          }
          return `LIMIT ${limit} OFFSET ${offset}`;
        },
      );
    },
    priority: 7,
  },

  // 8. CONCAT → || (MySQL/SQL Server → PG/Oracle/SQLite)
  {
    id: 'concat-to-pipe',
    name: 'CONCAT→||',
    description: '将 CONCAT() 函数转为 || 连接操作符',
    sourceDialects: ['mysql', 'mariadb', 'sqlserver'],
    targetDialects: ['postgresql', 'oracle', 'dameng', 'sqlite', 'kingbase', 'highgo', 'vastbase'],
    detect: (sql) => /\bCONCAT\s*\(/i.test(sql),
    convert: (sql) => {
      // 简单情况：CONCAT(a, b) → a || b
      // 递归处理嵌套括号
      let result = sql;
      let changed = true;
      while (changed) {
        changed = false;
        const replaced = result.replace(
          /\bCONCAT\s*\(([^()]*?)\)/gi,
          (_match, args: string) => {
            const parts = splitArgs(args);
            return parts.join(' || ');
          },
        );
        if (replaced !== result) {
          result = replaced;
          changed = true;
        }
      }
      return result;
    },
    priority: 8,
  },

  // 9. || → CONCAT (PG/Oracle/SQLite → MySQL/SQL Server)
  {
    id: 'pipe-to-concat',
    name: '||→CONCAT',
    description: '将 || 连接操作符转为 CONCAT() 函数',
    sourceDialects: ['postgresql', 'oracle', 'dameng', 'sqlite', 'kingbase', 'highgo', 'vastbase'],
    targetDialects: ['mysql', 'mariadb', 'sqlserver'],
    detect: (sql) => /\|\|/.test(sql) && !/:=\s*\|\|/.test(sql),
    convert: (sql) => {
      // 按行处理，跳过字符串和赋值
      return sql
        .split('\n')
        .map((line) => {
          // 跳过包含赋值操作符的行
          if (/:=/.test(line)) return line;
          // 匹配行内简单的 || 连接：identifier/literal || identifier/literal
          return line.replace(
            /(?<=[)\]\w'"`])\s*\|\|\s*(?=[)\]\w'"`])/g,
            () => ', ',
          );
        })
        .join('\n');
    },
    priority: 9,
  },

  // 10. IFNULL → COALESCE (MySQL/SQLite → 其他)
  {
    id: 'ifnull-to-coalesce',
    name: 'IFNULL→COALESCE',
    description: '将 IFNULL() 转为标准 COALESCE()',
    sourceDialects: ['mysql', 'mariadb', 'sqlite'],
    targetDialects: ['postgresql', 'oracle', 'dameng', 'sqlserver', 'kingbase', 'highgo', 'vastbase'],
    detect: (sql) => /\bIFNULL\s*\(/i.test(sql),
    convert: (sql) => sql.replace(/\bIFNULL\s*\(/gi, 'COALESCE('),
    priority: 10,
  },

  // 11. ISNULL → COALESCE (SQL Server → 其他)
  {
    id: 'isnull-to-coalesce',
    name: 'ISNULL→COALESCE',
    description: '将 SQL Server ISNULL() 转为标准 COALESCE()',
    sourceDialects: ['sqlserver'],
    targetDialects: ['mysql', 'mariadb', 'postgresql', 'oracle', 'dameng', 'sqlite', 'kingbase', 'highgo', 'vastbase'],
    detect: (sql) => /\bISNULL\s*\(/i.test(sql),
    convert: (sql) => sql.replace(/\bISNULL\s*\(/gi, 'COALESCE('),
    priority: 11,
  },

  // 12. NVL → COALESCE (Oracle/达梦 → 其他)
  {
    id: 'nvl-to-coalesce',
    name: 'NVL→COALESCE',
    description: '将 NVL() 转为标准 COALESCE()',
    sourceDialects: ['oracle', 'dameng'],
    targetDialects: ['mysql', 'mariadb', 'postgresql', 'sqlite', 'sqlserver', 'kingbase', 'highgo', 'vastbase'],
    detect: (sql) => /\bNVL\s*\(/i.test(sql),
    convert: (sql) => sql.replace(/\bNVL\s*\(/gi, 'COALESCE('),
    priority: 12,
  },

  // 13. AUTO_INCREMENT → GENERATED AS IDENTITY (MySQL → PG)
  {
    id: 'auto-inc-to-identity',
    name: 'AUTO_INCREMENT→IDENTITY',
    description: '将 MySQL AUTO_INCREMENT 转为 GENERATED ALWAYS AS IDENTITY',
    sourceDialects: ['mysql', 'mariadb'],
    targetDialects: ['postgresql', 'oracle', 'dameng', 'kingbase', 'highgo', 'vastbase'],
    detect: (sql) => /\bAUTO_INCREMENT\b/i.test(sql),
    convert: (sql) => sql.replace(/\bAUTO_INCREMENT\b/gi, 'GENERATED ALWAYS AS IDENTITY'),
    priority: 13,
  },

  // 14. # 注释 → -- 注释 (MySQL → 其他)
  {
    id: 'hash-to-line-comment',
    name: '#注释→--注释',
    description: '将 MySQL # 单行注释转为标准 -- 注释',
    sourceDialects: ['mysql', 'mariadb'],
    targetDialects: ['postgresql', 'oracle', 'dameng', 'sqlite', 'sqlserver', 'kingbase', 'highgo', 'vastbase'],
    detect: (sql) => /(?<=^|\s)#[^!]/m.test(sql),
    convert: (sql) => sql.replace(/(^|\s)#([^!].*?)(?=$|\n)/gm, '$1-- $2'),
    priority: 14,
  },

  // 15. GETDATE() → NOW() (SQL Server → MySQL/PG)
  {
    id: 'getdate-to-now',
    name: 'GETDATE→NOW()',
    description: '将 SQL Server GETDATE() 转为 NOW()',
    sourceDialects: ['sqlserver'],
    targetDialects: ['mysql', 'mariadb', 'postgresql', 'sqlite', 'kingbase', 'highgo', 'vastbase'],
    detect: (sql) => /\bGETDATE\s*\(\s*\)/i.test(sql),
    convert: (sql) => sql.replace(/\bGETDATE\s*\(\s*\)/gi, 'NOW()'),
    priority: 15,
  },

  // 16. SYSDATE → NOW() (Oracle/达梦 → MySQL/PG)
  {
    id: 'sysdate-to-now',
    name: 'SYSDATE→NOW()',
    description: '将 Oracle SYSDATE 转为 NOW()',
    sourceDialects: ['oracle', 'dameng'],
    targetDialects: ['mysql', 'mariadb', 'postgresql', 'sqlite', 'kingbase', 'highgo', 'vastbase'],
    detect: (sql) => /\bSYSDATE\b/i.test(sql),
    convert: (sql) => sql.replace(/\bSYSDATE\b/gi, 'NOW()'),
    priority: 16,
  },

  // 17. NOW() → 目标函数 (MySQL/PG → Oracle/SQL Server)
  {
    id: 'now-to-target',
    name: 'NOW()→目标函数',
    description: '将 NOW() 转为目标方言的当前时间函数',
    sourceDialects: ['mysql', 'mariadb', 'postgresql', 'sqlite', 'kingbase', 'highgo', 'vastbase'],
    targetDialects: ['oracle', 'dameng', 'sqlserver'],
    detect: (sql) => /\bNOW\s*\(\s*\)/i.test(sql),
    convert: (sql, ctx) => {
      const targetFn = matchesDialect(ctx.targetDialect, ['oracle', 'dameng']) ? 'SYSDATE' : 'GETDATE()';
      return sql.replace(/\bNOW\s*\(\s*\)/gi, targetFn);
    },
    priority: 17,
  },
];

// ── 辅助函数 ──────────────────────────────────────────────────────────────

/** 按逗号拆分参数（忽略括号和字符串内的逗号） */
function splitArgs(args: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString: string | null = null; // 当前包围的引号字符
  let current = '';
  for (let i = 0; i < args.length; i++) {
    const ch = args[i];
    const prev = i > 0 ? args[i - 1] : '';
    // 字符串状态切换
    if ((ch === "'" || ch === '"') && prev !== '\\') {
      if (inString === ch) {
        inString = null; // 字符串结束
      } else if (!inString) {
        inString = ch; // 字符串开始
      }
    }
    if (inString) {
      current += ch;
      continue;
    }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) {
    parts.push(current.trim());
  }
  return parts;
}

// ── 公开 API ──────────────────────────────────────────────────────────────

/**
 * 获取所有已注册的转换规则
 */
export function getConversionRules(): ConversionRule[] {
  return [...rules].sort((a, b) => a.priority - b.priority);
}

/**
 * 获取适用于给定源/目标方言的规则
 */
export function getApplicableRules(ctx: ConvertContext): ConversionRule[] {
  return rules
    .filter((r) => isRuleApplicable(r, ctx))
    .sort((a, b) => a.priority - b.priority);
}

/**
 * 使用规则引擎转换 SQL。
 * 按优先级依次应用所有匹配的规则。
 *
 * @param sql 原始 SQL
 * @param ctx 转换上下文（源/目标方言）
 * @returns 转换后的 SQL
 */
export function convertByRules(sql: string, ctx: ConvertContext): string {
  let result = sql;
  const applicable = rules
    .filter((r) => isRuleApplicable(r, ctx))
    .sort((a, b) => a.priority - b.priority);

  for (const rule of applicable) {
    if (rule.detect(result)) {
      result = rule.convert(result, ctx);
    }
  }
  return result;
}
