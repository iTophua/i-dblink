import type { ColumnInfo } from '../../types/api';
import { getDialect } from '../../utils/sqlDialects';

export const DEFAULT_MARKER = Symbol('DEFAULT');

/**
 * 规范化比较两个编辑值是否"相同"——用于判断编辑后值是否真正变化。
 * 与撤销逻辑（DataTable onRestore / ResultGrid handleCellEdited）保持一致：
 *   - null / undefined 互相视为相等
 *   - DEFAULT_MARKER（Symbol）用引用比较（=== 已覆盖）
 *   - 其他值用 String() 规范化后比较（数字 5 与字符串 "5" 视为相等，
 *     兼容 glide 显示值字符串化 vs 存储值原始类型的不一致）
 */
export function isSameEditValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const aNull = a == null;
  const bNull = b == null;
  if (aNull && bNull) return true;
  if (aNull || bNull) return false;
  return String(a) === String(b);
}

export interface FilterCondition {
  id: string;
  field: string;
  operator: string;
  value: string;
  /** between / notBetween 的上限值 */
  value2?: string;
  logic: 'AND' | 'OR';
  /** false 时该条件停用：保留配置但不参与 WHERE 拼接（面板勾选框控制） */
  enabled?: boolean;
  isGroupStart?: boolean;
  isGroupEnd?: boolean;
  level?: number;
}

/** 操作符下拉选项（Navicat 风格，不含"自定义"） */
export const OPERATOR_OPTIONS: { label: string; value: string }[] = [
  { label: '=', value: 'equals' },
  { label: '!=', value: 'notEquals' },
  { label: '<', value: 'lessThan' },
  { label: '<=', value: 'lessOrEqual' },
  { label: '>', value: 'greaterThan' },
  { label: '>=', value: 'greaterOrEqual' },
  { label: '包含', value: 'contains' },
  { label: '不包含', value: 'notContains' },
  { label: '开头是', value: 'startsWith' },
  { label: '开头不是', value: 'notStartsWith' },
  { label: '结尾是', value: 'endsWith' },
  { label: '结尾不是', value: 'notEndsWith' },
  { label: '是 null', value: 'isNull' },
  { label: '不是 null', value: 'isNotNull' },
  { label: '是空的', value: 'isEmpty' },
  { label: '是非空的', value: 'isNotEmpty' },
  { label: '介于', value: 'between' },
  { label: '不介于', value: 'notBetween' },
  { label: '在列表', value: 'in' },
  { label: '不在列表', value: 'notIn' },
];

/** 不需要填写值的操作符 */
export const NO_VALUE_OPERATORS = ['isNull', 'isNotNull', 'isEmpty', 'isNotEmpty'];

/** 需要最小/最大两个值的操作符 */
export const RANGE_OPERATORS = ['between', 'notBetween'];

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
  const dialect = getDialect(dbType);
  const field = dialect.escapeIdentifier(cond.field);
  const value = dialect.escapeValue(cond.value);

  // 原始 pattern 只做字符串字面量转义（引号/反斜杠），% 和 _ 保留通配符语义
  const like = (pattern: string, negate = false) => {
    const { condition } = dialect.buildLikeCondition(cond.field, pattern, negate);
    return condition.replace('?', dialect.escapeValue(pattern));
  };

  switch (cond.operator) {
    case 'equals':
      return `${field} = ${value}`;
    case 'notEquals':
      return `${field} != ${value}`;
    case 'greaterThan':
      return `${field} > ${value}`;
    case 'lessThan':
      return `${field} < ${value}`;
    case 'greaterOrEqual':
      return `${field} >= ${value}`;
    case 'lessOrEqual':
      return `${field} <= ${value}`;
    case 'contains':
      return like(`%${cond.value}%`);
    case 'notContains':
      return like(`%${cond.value}%`, true);
    case 'startsWith':
      return like(`${cond.value}%`);
    case 'notStartsWith':
      return like(`${cond.value}%`, true);
    case 'endsWith':
      return like(`%${cond.value}`);
    case 'notEndsWith':
      return like(`%${cond.value}`, true);
    case 'isNull':
      return `${field} IS NULL`;
    case 'isNotNull':
      return `${field} IS NOT NULL`;
    case 'isEmpty':
      // Oracle 等方言空串即 NULL，此时与 IS NULL 同义
      return dialect.emptyStringIsNull() ? `${field} IS NULL` : `${field} = ''`;
    case 'isNotEmpty':
      return dialect.emptyStringIsNull() ? `${field} IS NOT NULL` : `${field} != ''`;
    case 'between':
    case 'notBetween': {
      const negate = cond.operator === 'notBetween';
      const hasMin = cond.value !== '';
      const hasMax = !!cond.value2;
      if (hasMin && hasMax) {
        return `${field} ${negate ? 'NOT ' : ''}BETWEEN ${value} AND ${dialect.escapeValue(cond.value2)}`;
      }
      // 单边退化：介于 min ~ ∞ 用 >=，不介于 min ~ ∞ 用 <
      if (hasMin) return `${field} ${negate ? '<' : '>='} ${value}`;
      return `${field} ${negate ? '>' : '<='} ${dialect.escapeValue(cond.value2 ?? '')}`;
    }
    case 'in': {
      const values = cond.value.split(',').map((v) => dialect.escapeValue(v.trim()));
      return `${field} IN (${values.join(', ')})`;
    }
    case 'notIn': {
      const values = cond.value.split(',').map((v) => dialect.escapeValue(v.trim()));
      return `${field} NOT IN (${values.join(', ')})`;
    }
    default:
      return `${field} = ${value}`;
  }
}

export function buildWhereClause(conditions: FilterCondition[], dbType?: string): string {
  // 停用（enabled === false）或未填写完整的条件保留在面板里，但不参与拼接
  const isActive = (c: FilterCondition) => !!c.field && !!c.operator && c.enabled !== false;

  const parts: string[] = [];
  let emitted = 0; // 已输出条件数，决定后续条件是否需要 AND/OR 连接词

  for (let i = 0; i < conditions.length; i++) {
    const cond = conditions[i];

    if (cond.isGroupStart) {
      // 并列的第二个分组：连接词取组内第一个有效条件自身的 logic
      if (emitted > 0 && parts.length > 0 && parts[parts.length - 1] !== '(') {
        const inner = conditions
          .slice(i + 1)
          .find((c) => !c.isGroupStart && !c.isGroupEnd && isActive(c));
        if (inner) parts.push(inner.logic);
      }
      parts.push('(');
      continue;
    }

    if (cond.isGroupEnd) {
      // 组内条件全部停用/无效时丢弃空括号，以及为其压入的悬空连接词
      if (parts.length > 0 && parts[parts.length - 1] === '(') {
        parts.pop();
        const prev = parts[parts.length - 1];
        if (prev === 'AND' || prev === 'OR') parts.pop();
      } else {
        parts.push(')');
      }
      continue;
    }

    if (!isActive(cond)) continue;

    const clause = buildSingleCondition(cond, dbType);
    const last = parts[parts.length - 1];
    if (emitted > 0 && last !== undefined && last !== '(') {
      parts.push(cond.logic);
    }
    parts.push(clause);
    emitted++;
  }

  return parts.join(' ').replace(/\s+/g, ' ').trim();
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
  const dialect = getDialect(dbType);
  const tableRef = dialect.buildTableRef(tableName, database);
  const offset = (page - 1) * size;

  const whereToUse = overrideWhere !== undefined ? overrideWhere : whereClause;
  const orderByToUse = overrideOrderBy !== undefined ? overrideOrderBy : orderByClause;

  let orderBy = orderByToUse;
  if (!orderBy && sort && sort.length > 0) {
    orderBy = sort
      .map((s) => `${dialect.escapeIdentifier(s.colId)} ${s.sort.toUpperCase()}`)
      .join(', ');
  }

  let sql = `SELECT * FROM ${tableRef}`;
  if (whereToUse) {
    sql += ` WHERE ${whereToUse}`;
  }
  if (orderBy) {
    sql += ` ORDER BY ${orderBy}`;
  }

  return dialect.buildPaginationQuery(sql, { offset, limit: size });
}

export function buildCountQuery(
  tableName: string,
  database: string | undefined,
  dbType: string | undefined,
  whereClause: string,
  overrideWhere?: string
): string {
  const dialect = getDialect(dbType);
  const tableRef = dialect.buildTableRef(tableName, database);
  const whereToUse = overrideWhere !== undefined ? overrideWhere : whereClause;
  return dialect.buildCountQuery(tableRef, whereToUse || undefined);
}
