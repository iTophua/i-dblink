/**
 * 结果集编辑用到的纯函数：从 SQL 里认出被查询的那张表、拼出带限定符的表引用。
 * 抽出来便于单独测试（ResultGrid 组件本身依赖网格，不好直接测）。
 */
import { getDialect } from '../../utils/sqlDialects';
import type { DatabaseType } from '../../types/api';

/** FROM 后表名的一段。name 已去掉引号并还原了转义的引号 */
export interface TableRefPart {
  name: string;
  quoted: boolean;
}

// 表名之后只允许：直接结束，或（可选的别名后）这几个子句关键字
const TABLE_TAIL =
  /^(?:\s+(?:AS\s+)?[\w$]+)?(?:\s*$|\s+(?:WHERE|ORDER|GROUP|HAVING|LIMIT|OFFSET)\b)/i;

function readIdentifier(rest: string): { name: string; quoted: boolean; rest: string } | null {
  const ch = rest[0];
  if (ch === '`' || ch === '"') {
    // 引号成对出现表示转义
    const match = rest.match(new RegExp(`${ch}((?:[^${ch}]|${ch}${ch})*)${ch}`));
    if (!match) return null;
    return {
      name: match[1].split(ch + ch).join(ch),
      quoted: true,
      rest: rest.slice(match[0].length),
    };
  }
  if (ch === '[') {
    const match = rest.match(/^\[((?:[^\]]|\]\])*)\]/);
    if (!match) return null;
    return {
      name: match[1].split(']]').join(']'),
      quoted: true,
      rest: rest.slice(match[0].length),
    };
  }
  const match = rest.match(/^[\w$]+/);
  if (!match) return null;
  return { name: match[0], quoted: false, rest: rest.slice(match[0].length) };
}

/**
 * 从单表查询里取出 FROM 后的表引用，含限定部分（`db`.`table`、"schema"."table"、[db].[dbo].[table]）。
 *
 * 定位不到唯一的一张表就返回 null，结果集按只读处理：多表（JOIN / 逗号）、UNION、子查询、CTE，
 * 或表名后面跟着别的子句（PARTITION、FOR UPDATE …）。
 */
export function extractTableRefParts(sql: string): TableRefPart[] | null {
  const clean = sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/--.*$/gm, '')
    .replace(/;\s*$/, '')
    .trim();
  if (/\bJOIN\b|\bUNION\b|\bINTO\b|(?:\()\s*SELECT\b/i.test(clean)) return null;

  // 逐个 FROM 试：字符串字面量里也可能出现 from（SELECT 'x from y' … FROM t）
  for (const from of clean.matchAll(/\bFROM\s+/gi)) {
    let rest = clean.slice(from.index! + from[0].length);
    const parts: TableRefPart[] = [];
    for (;;) {
      const part = readIdentifier(rest);
      if (!part) break;
      parts.push({ name: part.name, quoted: part.quoted });
      rest = part.rest;
      if (rest[0] !== '.') break;
      if (parts.length >= 4) break;
      rest = rest.slice(1);
    }
    if (parts.length === 0 || parts.length >= 4) continue;
    if (TABLE_TAIL.test(rest)) return parts;
  }
  return null;
}

const pgFamily: readonly string[] = ['postgresql', 'kingbase', 'highgo', 'vastbase'];

/**
 * 名字的规范写法。PG 系把不带引号的名字折叠成小写：`FROM Users` 指的是 users，
 * 加引号写回时必须按 users 写，否则找不到表
 */
function canonicalPart(part: TableRefPart, dbType?: DatabaseType): string {
  if (part.quoted || !dbType || !pgFamily.includes(dbType)) return part.name;
  return part.name.toLowerCase();
}

/** 表引用在「取列信息」接口里的写法：`库.表` / `schema.表`，由后端按库类型定位 */
export function tableLookupName(parts: TableRefPart[], dbType?: DatabaseType): string {
  return parts.map((part) => canonicalPart(part, dbType)).join('.');
}

/**
 * 结果集编辑写回时用的表引用。SQL 里带了限定部分的照原样带上——只写表名的话，
 * `SELECT * FROM b.t` 生成的 UPDATE / DELETE 会落到当前库（或搜索路径）里的同名表上。
 * 没带限定的沿用标签页选中的库。
 */
export function buildResultSetTableRef(
  parts: TableRefPart[],
  database: string | undefined,
  dbType?: DatabaseType
): string {
  const dialect = getDialect(dbType);
  const names = parts.map((part) => canonicalPart(part, dbType));
  if (names.length > 1) return names.map((name) => dialect.escapeIdentifier(name)).join('.');
  return dialect.buildTableRef(names[0], database);
}
