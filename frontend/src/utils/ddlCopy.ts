/**
 * 复制表时把建表 DDL 改写成目标表的 DDL。
 *
 * 只动两类标识符，列名、类型、注释、默认值一概不碰。此前是对整段 DDL 做子串替换：
 * 把 user 复制成 user_copy 时，列 user_name 也被改成 user_copy_name，注释里的 user 也被改掉。
 *
 *   - 表：出现在 TABLE / REFERENCES 等关键字之后，或作为 `表`.`列` 的前缀，且名字与源表相同的
 *     标识符 → 目标表名。库 / schema 限定部分保留（`db`.`order` → `db`.`order_copy`）
 *   - 对象名：CONSTRAINT / KEY / INDEX 之后的名字。约束和索引名在库（或 schema）内唯一，
 *     照搬会撞名，所以把名字里「按 _ 分段后等于源表名」的那一段换掉
 *     （order_pkey → order_copy_pkey、PK_order → PK_order_copy）；orders_pkey、fk_customer_user
 *     这类只是含有同样字母的不动
 */

interface DdlToken {
  text: string;
  /** 去掉引号后的标识符；非标识符为空串 */
  name: string;
  /** word：不带引号的词（关键字或不带引号的名字）；ident：带引号的标识符；
   *  punct：标点；skip：空白、注释、字符串字面量 */
  kind: 'word' | 'ident' | 'punct' | 'skip';
}

const TOKEN_RE =
  /--[^\n]*|\/\*[\s\S]*?\*\/|'(?:[^'\\]|\\.|'')*'|`(?:[^`]|``)*`|"(?:[^"]|"")*"|\[(?:[^\]]|\]\])*\]|[\w$]+|\s+|./g;

/** 这些关键字之后的标识符是表名（ONLY 是 pg_dump 风格的 ALTER TABLE ONLY schema.table；
 *  EXISTS / TRUNCATE 对应 CREATE TABLE IF NOT EXISTS t、TRUNCATE [TABLE] t） */
const TABLE_KEYWORDS = new Set([
  'TABLE',
  'REFERENCES',
  'ON',
  'INTO',
  'FROM',
  'UPDATE',
  'JOIN',
  'ONLY',
  'EXISTS',
  'TRUNCATE',
]);

/** 这些关键字之后的标识符是约束 / 索引的名字 */
const NAME_KEYWORDS = new Set(['CONSTRAINT', 'KEY', 'INDEX']);

function tokenizeDdl(ddl: string): DdlToken[] {
  return Array.from(ddl.matchAll(TOKEN_RE), (match) => {
    const text = match[0];
    if (text.startsWith('`') || text.startsWith('"')) {
      const quote = text[0];
      return {
        text,
        kind: 'ident',
        name: text
          .slice(1, -1)
          .split(quote + quote)
          .join(quote),
      };
    }
    if (text.startsWith('[')) {
      return { text, kind: 'ident', name: text.slice(1, -1).split(']]').join(']') };
    }
    if (/^[\w$]+$/.test(text) && !/^\d/.test(text)) {
      return { text, kind: 'word', name: text };
    }
    if (/^\s+$/.test(text) || /^(--|\/\*|')/.test(text)) {
      return { text, kind: 'skip', name: '' };
    }
    return { text, kind: 'punct', name: '' };
  });
}

/** 名字里是否有完整的一段（以 _、开头或结尾为界）等于源表名，不区分大小写 */
function tableWordPattern(sourceTable: string): RegExp {
  return new RegExp(`(^|_)${sourceTable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(_|$)`, 'i');
}

/** 把对象名里的源表名那一段换成目标表名 */
function renameObjectWord(name: string, sourceTable: string, targetTable: string): string {
  const word = new RegExp(sourceTable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return name.replace(word, targetTable);
}

/** 改名后的写法：带引号的保持原来的引号风格（引号转义），不带引号的直接写新名字 */
function renamed(token: DdlToken, name: string): string {
  if (token.kind !== 'ident') return name;
  const quote = token.text[0];
  if (quote === '[') return `[${name.replace(/]/g, ']]')}]`;
  return quote + name.split(quote).join(quote + quote) + quote;
}

export function rewriteDDLForCopy(ddl: string, sourceTable: string, targetTable: string): string {
  if (!sourceTable || sourceTable === targetTable) return ddl;

  const tokens = tokenizeDdl(ddl);
  // 参与上下文判断的 token（跳过空白、注释、字符串）
  const significant: number[] = [];
  tokens.forEach((token, i) => {
    if (token.kind !== 'skip') significant.push(i);
  });
  const at = (k: number): DdlToken | undefined =>
    k >= 0 && k < significant.length ? tokens[significant[k]] : undefined;
  const sourceLower = sourceTable.toLowerCase();

  for (let k = 0; k < significant.length; k++) {
    const index = significant[k];
    const token = tokens[index];
    if (token.kind === 'punct') continue;
    const prev = at(k - 1);
    const next = at(k + 1);
    const prevWord = prev?.kind === 'word' ? prev.text.toUpperCase() : '';

    if (NAME_KEYWORDS.has(prevWord)) {
      if (tableWordPattern(sourceTable).test(token.name)) {
        tokens[index] = {
          ...token,
          text: renamed(token, renameObjectWord(token.name, sourceTable, targetTable)),
        };
      }
      continue;
    }

    // 带引号的名字按原样比较，不带引号的名字不区分大小写
    const isSourceTable =
      token.kind === 'ident'
        ? token.name === sourceTable
        : token.name.toLowerCase() === sourceLower;
    if (!isSourceTable) continue;

    // `表`.`列` 的前缀
    if (next?.text === '.' && prev?.text !== '.') {
      tokens[index] = { ...token, text: renamed(token, targetTable) };
      continue;
    }
    // schema.表.列：夹在两个点中间
    if (prev?.text === '.' && next?.text === '.') {
      tokens[index] = { ...token, text: renamed(token, targetTable) };
      continue;
    }
    if (prev?.text === '.') {
      // 限定名的最后一段：回到整段限定名的开头，看它前面是不是 TABLE / REFERENCES 这类关键字
      let j = k;
      while (at(j - 1)?.text === '.') j -= 2;
      const head = at(j - 1);
      if (head?.kind === 'word' && TABLE_KEYWORDS.has(head.text.toUpperCase())) {
        tokens[index] = { ...token, text: renamed(token, targetTable) };
      }
      continue;
    }
    if (TABLE_KEYWORDS.has(prevWord)) {
      tokens[index] = { ...token, text: renamed(token, targetTable) };
    }
  }

  return tokens.map((token) => token.text).join('');
}
