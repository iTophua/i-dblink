/**
 * 结构比较的「执行同步」：从后端给的同步 SQL 里挑出真正可执行的语句。
 *
 * 后端只把新增类改动（补列 / 建索引 / 加外键）写成语句；删除类和两边定义不同的项只以
 * 注释列出，由人看过后自己决定。这里把纯注释的条目丢掉，把「注释 + 语句」混在一起的拆开。
 */

/** 后端返回的同步 SQL 是一个数组：每个元素是一条语句，或一段（可多行的）说明注释 */
export function syncStatements(alterSql: string[] | undefined | null): string[] {
  const out: string[] = [];
  for (const entry of alterSql ?? []) {
    const lines = (entry ?? '')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('--'))
      .join('\n')
      .trim();
    if (lines) out.push(lines.replace(/;\s*$/, ''));
  }
  return out;
}
