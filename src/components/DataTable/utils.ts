import type { ColumnInfo } from '../../types/api';
import { escapeSqlIdentifier, escapeSqlValue } from '../../utils/sqlUtils';

export interface FilterCondition {
  id: string;
  field: string;
  operator: string;
  value: string;
  logic: 'AND' | 'OR';
  isGroupStart?: boolean;
  isGroupEnd?: boolean;
  level?: number;
}

export interface RowData {
  [key: string]: any;
  __row_id__?: string;
  __status__?: 'new' | 'modified' | 'deleted';
  __original_data__?: Record<string, any>;
}

export interface DataTableProps {
  connectionId: string;
  tableName: string;
  database?: string;
  pageSize?: number;
  onDirtyChange?: (isDirty: boolean) => void;
}

export function buildSingleCondition(cond: FilterCondition, dbType?: string): string {
  const field = escapeSqlIdentifier(cond.field, dbType);
  const escapedValue = cond.value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "''")
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
  const quotedValue = `'${escapedValue}'`;
  let clause = '';

  switch (cond.operator) {
    case 'equals':
      clause = `${field} = ${quotedValue}`;
      break;
    case 'notEquals':
      clause = `${field} != ${quotedValue}`;
      break;
    case 'contains':
      clause = `${field} LIKE '%${escapedValue}%'`;
      break;
    case 'notContains':
      clause = `${field} NOT LIKE '%${escapedValue}%'`;
      break;
    case 'startsWith':
      clause = `${field} LIKE '${escapedValue}%'`;
      break;
    case 'endsWith':
      clause = `${field} LIKE '%${escapedValue}'`;
      break;
    case 'isNull':
      clause = `${field} IS NULL`;
      break;
    case 'isNotNull':
      clause = `${field} IS NOT NULL`;
      break;
    case 'in':
      clause = `${field} IN (${escapedValue
        .split(',')
        .map((v) => `'${v.trim()}'`)
        .join(', ')})`;
      break;
    case 'notIn':
      clause = `${field} NOT IN (${escapedValue
        .split(',')
        .map((v) => `'${v.trim()}'`)
        .join(', ')})`;
      break;
    default:
      clause = `${field} LIKE '%${escapedValue}%'`;
  }

  return clause;
}

export function buildWhereClause(conditions: FilterCondition[], dbType?: string): string {
  const validConditions = conditions.filter((c) => c.field && c.operator);

  if (validConditions.length === 0) return '';

  let result = '';

  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i];

    if (cond.isGroupStart) {
      result += '(';
      continue;
    }

    if (cond.isGroupEnd) {
      const slice = conditions
        .slice(lastValidIndex(i, conditions), i)
        .filter((c) => c.field && c.operator);
      if (slice.length > 0) {
        const subClauses = slice
          .map((c, idx) => {
            const clause = buildSingleCondition(c, dbType);
            if (idx === 0) return clause;
            return `${c.logic} ${clause}`;
          })
          .join(' ');
        result += ` ${subClauses})`;
      }
      continue;
    }

    if (!cond.field || !cond.operator) continue;

    const prevCond = i > 0 ? conditions[i - 1] : null;
    const needLogic =
      prevCond &&
      !prevCond.isGroupStart &&
      !prevCond.isGroupEnd &&
      prevCond.field &&
      prevCond.operator;

    if (needLogic) {
      result += ` ${cond.logic} ${buildSingleCondition(cond, dbType)}`;
    } else {
      result += buildSingleCondition(cond, dbType);
    }
  }

  return result.trim().replace(/\s+/g, ' ');

  function lastValidIndex(endIdx: number, conds: FilterCondition[]): number {
    for (let j = endIdx - 1; j >= 0; j--) {
      if (conds[j].field && conds[j].operator) return j + 1;
      if (conds[j].isGroupStart) return j + 1;
    }
    return 0;
  }
}

export function buildQuery(
  page: number,
  size: number,
  tableName: string,
  database: string | undefined,
  dbType: string | undefined,
  sort: { colId: string; sort: 'asc' | 'desc' }[] | undefined,
  whereClause: string,
  orderByClause: string,
  overrideWhere?: string,
  overrideOrderBy?: string
): string {
  const offset = (page - 1) * size;
  const tableRef = database
    ? `${escapeSqlIdentifier(database, dbType)}.${escapeSqlIdentifier(tableName, dbType)}`
    : `${escapeSqlIdentifier(tableName, dbType)}`;
  let query = `SELECT * FROM ${tableRef}`;

  const whereToUse = overrideWhere !== undefined ? overrideWhere : whereClause;
  const orderByToUse = overrideOrderBy !== undefined ? overrideOrderBy : orderByClause;

  if (whereToUse) {
    query += ` WHERE ${whereToUse}`;
  }

  if (orderByToUse) {
    query += ` ORDER BY ${orderByToUse}`;
  } else if (sort && sort.length > 0) {
    const orderClauses = sort
      .map((s) => `${escapeSqlIdentifier(s.colId, dbType)} ${s.sort.toUpperCase()}`)
      .join(', ');
    query += ` ORDER BY ${orderClauses}`;
  }

  query += ` LIMIT ${size} OFFSET ${offset}`;
  return query;
}

export function buildCountQuery(
  tableName: string,
  database: string | undefined,
  dbType: string | undefined,
  whereClause: string,
  overrideWhere?: string
): string {
  const tableRef = database
    ? `${escapeSqlIdentifier(database, dbType)}.${escapeSqlIdentifier(tableName, dbType)}`
    : `${escapeSqlIdentifier(tableName, dbType)}`;
  const whereToUse = overrideWhere !== undefined ? overrideWhere : whereClause;
  let query = `SELECT COUNT(*) AS cnt FROM ${tableRef}`;
  if (whereToUse) {
    query += ` WHERE ${whereToUse}`;
  }
  return query;
}
