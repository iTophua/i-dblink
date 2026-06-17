/**
 * SQL 方言引擎 - 统一入口
 * 
 * 使用方式：
 * ```typescript
 * import { getDialect } from '@/utils/sqlDialects';
 * 
 * const dialect = getDialect('postgresql');
 * const sql = dialect.buildPaginationQuery('SELECT * FROM users', { offset: 0, limit: 10 });
 * ```
 */

import type { DatabaseType } from '../../types/api';
import type { SqlDialect } from './types';
import { mysqlDialect } from './mysql';
import { postgresDialect } from './postgres';
import { sqliteDialect } from './sqlite';
import { sqlserverDialect } from './sqlserver';
import { oracleDialect } from './oracle';

// 方言注册表
const dialectRegistry: Record<DatabaseType, SqlDialect> = {
  mysql: mysqlDialect,
  postgresql: postgresDialect,
  sqlite: sqliteDialect,
  sqlserver: sqlserverDialect,
  oracle: oracleDialect,
  mariadb: mysqlDialect, // MariaDB 兼容 MySQL
  dameng: oracleDialect, // Dameng 兼容 Oracle
  kingbase: postgresDialect, // Kingbase 兼容 PostgreSQL
  highgo: postgresDialect, // HighGo 兼容 PostgreSQL
  vastbase: postgresDialect, // VastBase 兼容 PostgreSQL
};

/**
 * 获取指定数据库类型的方言实例
 * @param dbType 数据库类型
 * @returns SQL 方言实例
 */
export function getDialect(dbType: DatabaseType | string | undefined): SqlDialect {
  const key = (dbType || 'mysql') as DatabaseType;
  const dialect = dialectRegistry[key];
  if (!dialect) {
    console.warn(`[sqlDialects] Unknown database type "${dbType}", falling back to mysql`);
    return mysqlDialect;
  }
  return dialect;
}

/**
 * 检查是否支持某种数据库类型
 * @param dbType 数据库类型
 */
export function isSupported(dbType: string): boolean {
  return dbType in dialectRegistry;
}

/**
 * 获取所有支持的数据库类型
 */
export function getSupportedTypes(): DatabaseType[] {
  return Object.keys(dialectRegistry) as DatabaseType[];
}

// 导出类型和具体方言
export type { SqlDialect } from './types';
export type {
  PaginationOptions,
  CreateTableOptions,
  AlterTableOptions,
  DialectColumn,
  DialectIndex,
  DialectForeignKey,
} from './types';

// 导出具体方言实例（用于测试或特殊需求）
export { mysqlDialect } from './mysql';
export { postgresDialect } from './postgres';
export { sqliteDialect } from './sqlite';
export { sqlserverDialect } from './sqlserver';
export { oracleDialect } from './oracle';
