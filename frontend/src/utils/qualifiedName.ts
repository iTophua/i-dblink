/**
 * 表的完整名字。
 *
 * PG 系和 SQL Server 的表按 schema 分层，定位一张表要带上 schema，写成 `schema.表`。
 * 不带的话 PG 按 search_path 找同名表，可能落到别的 schema 的表上——数据页读的、改的
 * 就是另一张表。后端按这个形式拆出 schema 再查（表名里恰好一个点才算）。
 *
 * MySQL 的库是单独一个参数（database），不走这里；其余库没有 schema 这一层。
 */

const SCHEMA_QUALIFIED_TYPES = new Set([
  'postgresql',
  'kingbase',
  'highgo',
  'vastbase',
  'sqlserver',
]);

/** 这种库的表名里能不能带 schema */
export function supportsSchemaQualifier(dbType: string | null | undefined): boolean {
  return !!dbType && SCHEMA_QUALIFIED_TYPES.has(dbType);
}

/** 表的完整名字：认 schema 的库带上 schema，其余库就是表名本身 */
export function qualifiedTableName(
  tableName: string,
  schema: string | null | undefined,
  dbType: string | null | undefined
): string {
  if (!schema || tableName.includes('.') || !supportsSchemaQualifier(dbType)) {
    return tableName;
  }
  return `${schema}.${tableName}`;
}

/** 拆开「schema.表」。不是这个形式（或不认 schema 的库）返回 null */
export function splitSchemaQualifiedTable(
  name: string,
  dbType: string | null | undefined
): { schema: string; table: string } | null {
  if (!supportsSchemaQualifier(dbType)) return null;
  const dot = name.indexOf('.');
  if (dot <= 0 || dot === name.length - 1 || name.indexOf('.', dot + 1) >= 0) return null;
  return { schema: name.slice(0, dot), table: name.slice(dot + 1) };
}
