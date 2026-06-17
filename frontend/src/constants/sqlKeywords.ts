import type { DatabaseType } from '../types/api';

type DbGroup = 'mysql-like' | 'pg-like' | 'mssql-like' | 'oracle-like' | 'sqlite-like';

export const DB_GROUP_MAP: Record<DatabaseType, DbGroup> = {
  mysql: 'mysql-like',
  mariadb: 'mysql-like',
  postgresql: 'pg-like',
  sqlite: 'sqlite-like',
  sqlserver: 'mssql-like',
  oracle: 'oracle-like',
  dameng: 'oracle-like',
  kingbase: 'pg-like',
  highgo: 'pg-like',
  vastbase: 'pg-like',
};

export interface SqlKeyword {
  label: string;
  insertText: string;
  detail?: string;
  groups?: DbGroup[];
}

export const SQL_KEYWORDS: SqlKeyword[] = [
  { label: 'SELECT', insertText: 'SELECT ${1:*} FROM ${2:table}' },
  {
    label: 'INSERT INTO',
    insertText: 'INSERT INTO ${1:table} (${2:columns}) VALUES (${3:values})',
  },
  {
    label: 'UPDATE',
    insertText: 'UPDATE ${1:table} SET ${2:column} = ${3:value} WHERE ${4:condition}',
  },
  { label: 'DELETE FROM', insertText: 'DELETE FROM ${1:table} WHERE ${2:condition}' },
  { label: 'WHERE', insertText: 'WHERE ${1:condition}' },
  { label: 'ORDER BY', insertText: 'ORDER BY ${1:column} ${2:ASC}' },
  { label: 'GROUP BY', insertText: 'GROUP BY ${1:column}' },
  { label: 'HAVING', insertText: 'HAVING ${1:condition}' },
  { label: 'JOIN', insertText: 'JOIN ${1:table} ON ${2:condition}' },
  { label: 'LEFT JOIN', insertText: 'LEFT JOIN ${1:table} ON ${2:condition}' },
  { label: 'RIGHT JOIN', insertText: 'RIGHT JOIN ${1:table} ON ${2:condition}' },
  { label: 'INNER JOIN', insertText: 'INNER JOIN ${1:table} ON ${2:condition}' },
  { label: 'FULL OUTER JOIN', insertText: 'FULL OUTER JOIN ${1:table} ON ${2:condition}' },
  { label: 'CROSS JOIN', insertText: 'CROSS JOIN ${1:table}' },
  { label: 'UNION', insertText: 'UNION' },
  { label: 'UNION ALL', insertText: 'UNION ALL' },
  { label: 'DISTINCT', insertText: 'DISTINCT' },
  { label: 'EXISTS', insertText: 'EXISTS (${1:subquery})' },
  { label: 'BETWEEN', insertText: 'BETWEEN ${1:start} AND ${2:end}' },
  { label: 'LIKE', insertText: "LIKE '${1:%pattern%}'" },
  { label: 'IN', insertText: 'IN (${1:item1}, ${2:item2})' },
  { label: 'NOT IN', insertText: 'NOT IN (${1:item1}, ${2:item2})' },
  { label: 'IS NULL', insertText: 'IS NULL' },
  { label: 'IS NOT NULL', insertText: 'IS NOT NULL' },
  {
    label: 'CASE',
    insertText: 'CASE\n  WHEN ${1:condition} THEN ${2:result}\n  ELSE ${3:default}\nEND',
  },
  {
    label: 'WITH',
    insertText: 'WITH ${1:cte_name} AS (\n  ${2:query}\n)\nSELECT * FROM ${1:cte_name}',
  },
  {
    label: 'LIMIT',
    insertText: 'LIMIT ${1:100}',
    groups: ['mysql-like', 'pg-like', 'sqlite-like'],
  },
  {
    label: 'OFFSET',
    insertText: 'OFFSET ${1:0}',
    groups: ['mysql-like', 'pg-like', 'sqlite-like'],
  },
  { label: 'TOP', insertText: 'TOP ${1:100}', groups: ['mssql-like'] },
  { label: 'ROWNUM', insertText: 'ROWNUM <= ${1:100}', groups: ['oracle-like'] },
  { label: 'FETCH FIRST', insertText: 'FETCH FIRST ${1:100} ROWS ONLY', groups: ['oracle-like'] },
  { label: 'RETURNING', insertText: 'RETURNING ${1:*}', groups: ['pg-like'] },
  { label: 'ILIKE', insertText: "ILIKE '${1:%pattern%}'", groups: ['pg-like'] },
  { label: 'SHOW TABLES', insertText: 'SHOW TABLES', groups: ['mysql-like'] },
  { label: 'SHOW DATABASES', insertText: 'SHOW DATABASES', groups: ['mysql-like'] },
  { label: 'DESCRIBE', insertText: 'DESCRIBE ${1:table}', groups: ['mysql-like'] },
  { label: 'EXPLAIN', insertText: 'EXPLAIN ${1:query}', groups: ['mysql-like'] },
  { label: 'PRAGMA', insertText: 'PRAGMA ${1:table_info}(${2:table})', groups: ['sqlite-like'] },
];

export function filterKeywordsByDbType(
  items: SqlKeyword[],
  dbType: DatabaseType | undefined
): SqlKeyword[] {
  if (!dbType) return items;
  const group = DB_GROUP_MAP[dbType];
  return items.filter((item) => !item.groups || item.groups.includes(group));
}
