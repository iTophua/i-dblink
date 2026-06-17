import type { DatabaseType } from '../types/api';
import { DB_GROUP_MAP } from './sqlKeywords';

type DbGroup = 'mysql-like' | 'pg-like' | 'mssql-like' | 'oracle-like' | 'sqlite-like';

export interface SqlFunction {
  label: string;
  insertText: string;
  detail: string;
  groups?: DbGroup[];
}

export const SQL_FUNCTIONS: SqlFunction[] = [
  { label: 'COUNT(*)', insertText: 'COUNT(*)', detail: '聚合函数' },
  { label: 'COUNT()', insertText: 'COUNT(${1:column})', detail: '聚合函数' },
  { label: 'SUM()', insertText: 'SUM(${1:column})', detail: '聚合函数' },
  { label: 'AVG()', insertText: 'AVG(${1:column})', detail: '聚合函数' },
  { label: 'MAX()', insertText: 'MAX(${1:column})', detail: '聚合函数' },
  { label: 'MIN()', insertText: 'MIN(${1:column})', detail: '聚合函数' },
  { label: 'COALESCE()', insertText: 'COALESCE(${1:column}, ${2:default})', detail: '空值处理' },
  { label: 'NULLIF()', insertText: 'NULLIF(${1:expr1}, ${2:expr2})', detail: '空值处理' },
  { label: 'LENGTH()', insertText: 'LENGTH(${1:str})', detail: '字符串函数' },
  { label: 'TRIM()', insertText: 'TRIM(${1:str})', detail: '字符串函数' },
  { label: 'UPPER()', insertText: 'UPPER(${1:str})', detail: '字符串函数' },
  { label: 'LOWER()', insertText: 'LOWER(${1:str})', detail: '字符串函数' },
  { label: 'REPLACE()', insertText: 'REPLACE(${1:str}, ${2:old}, ${3:new})', detail: '字符串函数' },
  {
    label: 'SUBSTRING()',
    insertText: 'SUBSTRING(${1:str}, ${2:start}, ${3:length})',
    detail: '字符串函数',
  },
  { label: 'ROUND()', insertText: 'ROUND(${1:num}, ${2:decimals})', detail: '数值函数' },
  { label: 'FLOOR()', insertText: 'FLOOR(${1:num})', detail: '数值函数' },
  { label: 'CEIL()', insertText: 'CEIL(${1:num})', detail: '数值函数' },
  { label: 'ABS()', insertText: 'ABS(${1:num})', detail: '数值函数' },
  { label: 'CAST()', insertText: 'CAST(${1:expr} AS ${2:type})', detail: '类型转换' },
  { label: 'CURRENT_DATE', insertText: 'CURRENT_DATE', detail: '日期时间函数' },
  { label: 'CURRENT_TIMESTAMP', insertText: 'CURRENT_TIMESTAMP', detail: '日期时间函数' },
  {
    label: 'IFNULL()',
    insertText: 'IFNULL(${1:expr}, ${2:default})',
    detail: '空值处理 (MySQL)',
    groups: ['mysql-like'],
  },
  {
    label: 'CONCAT()',
    insertText: 'CONCAT(${1:str1}, ${2:str2})',
    detail: '字符串函数 (MySQL)',
    groups: ['mysql-like'],
  },
  {
    label: 'GROUP_CONCAT()',
    insertText: 'GROUP_CONCAT(${1:column})',
    detail: '聚合函数 (MySQL)',
    groups: ['mysql-like'],
  },
  { label: 'NOW()', insertText: 'NOW()', detail: '日期时间函数 (MySQL)', groups: ['mysql-like'] },
  {
    label: 'DATE_FORMAT()',
    insertText: "DATE_FORMAT(${1:date}, '${2:%Y-%m-%d}')",
    detail: '日期时间函数 (MySQL)',
    groups: ['mysql-like'],
  },
  {
    label: 'STR_TO_DATE()',
    insertText: "STR_TO_DATE(${1:str}, '${2:%Y-%m-%d}')",
    detail: '日期时间函数 (MySQL)',
    groups: ['mysql-like'],
  },
  {
    label: 'FIND_IN_SET()',
    insertText: 'FIND_IN_SET(${1:str}, ${2:strlist})',
    detail: '字符串函数 (MySQL)',
    groups: ['mysql-like'],
  },
  {
    label: 'FIELD()',
    insertText: 'FIELD(${1:val}, ${2:val1}, ${3:val2})',
    detail: '字符串函数 (MySQL)',
    groups: ['mysql-like'],
  },
  {
    label: 'STRING_AGG()',
    insertText: "STRING_AGG(${1:column}, '${2:,}')",
    detail: '聚合函数 (PostgreSQL)',
    groups: ['pg-like'],
  },
  {
    label: 'TO_CHAR()',
    insertText: "TO_CHAR(${1:date}, '${2:YYYY-MM-DD}')",
    detail: '日期时间函数 (PostgreSQL)',
    groups: ['pg-like'],
  },
  {
    label: 'TO_DATE()',
    insertText: "TO_DATE(${1:str}, '${2:YYYY-MM-DD}')",
    detail: '日期时间函数 (PostgreSQL)',
    groups: ['pg-like'],
  },
  {
    label: 'TO_TIMESTAMP()',
    insertText: "TO_TIMESTAMP(${1:str}, '${2:YYYY-MM-DD HH24:MI:SS}')",
    detail: '日期时间函数 (PostgreSQL)',
    groups: ['pg-like'],
  },
  {
    label: 'AGE()',
    insertText: 'AGE(${1:timestamp})',
    detail: '日期时间函数 (PostgreSQL)',
    groups: ['pg-like'],
  },
  {
    label: 'EXTRACT()',
    insertText: 'EXTRACT(${1:YEAR} FROM ${2:date})',
    detail: '日期时间函数 (PostgreSQL)',
    groups: ['pg-like'],
  },
  {
    label: 'ARRAY_AGG()',
    insertText: 'ARRAY_AGG(${1:column})',
    detail: '聚合函数 (PostgreSQL)',
    groups: ['pg-like'],
  },
  {
    label: 'JSON_BUILD_OBJECT()',
    insertText: 'JSON_BUILD_OBJECT(${1:key}, ${2:value})',
    detail: 'JSON 函数 (PostgreSQL)',
    groups: ['pg-like'],
  },
  {
    label: 'JSONB_BUILD_OBJECT()',
    insertText: 'JSONB_BUILD_OBJECT(${1:key}, ${2:value})',
    detail: 'JSON 函数 (PostgreSQL)',
    groups: ['pg-like'],
  },
  {
    label: 'strftime()',
    insertText: "strftime('${1:%Y-%m-%d}', ${2:date})",
    detail: '日期时间函数 (SQLite)',
    groups: ['sqlite-like'],
  },
  {
    label: 'datetime()',
    insertText: 'datetime(${1:now})',
    detail: '日期时间函数 (SQLite)',
    groups: ['sqlite-like'],
  },
  {
    label: 'date()',
    insertText: 'date(${1:now})',
    detail: '日期时间函数 (SQLite)',
    groups: ['sqlite-like'],
  },
  {
    label: 'time()',
    insertText: 'time(${1:now})',
    detail: '日期时间函数 (SQLite)',
    groups: ['sqlite-like'],
  },
  {
    label: 'julianday()',
    insertText: 'julianday(${1:date})',
    detail: '日期时间函数 (SQLite)',
    groups: ['sqlite-like'],
  },
  {
    label: 'TOTAL()',
    insertText: 'TOTAL(${1:column})',
    detail: '聚合函数 (SQLite)',
    groups: ['sqlite-like'],
  },
  {
    label: 'ISNULL()',
    insertText: 'ISNULL(${1:expr}, ${2:default})',
    detail: '空值处理 (SQL Server)',
    groups: ['mssql-like'],
  },
  {
    label: 'CONVERT()',
    insertText: 'CONVERT(${1:VARCHAR}, ${2:expr}, ${3:120})',
    detail: '类型转换 (SQL Server)',
    groups: ['mssql-like'],
  },
  {
    label: 'GETDATE()',
    insertText: 'GETDATE()',
    detail: '日期时间函数 (SQL Server)',
    groups: ['mssql-like'],
  },
  {
    label: 'DATEPART()',
    insertText: 'DATEPART(${1:year}, ${2:date})',
    detail: '日期时间函数 (SQL Server)',
    groups: ['mssql-like'],
  },
  {
    label: 'DATEDIFF()',
    insertText: 'DATEDIFF(${1:day}, ${2:start}, ${3:end})',
    detail: '日期时间函数 (SQL Server)',
    groups: ['mssql-like'],
  },
  {
    label: 'CHARINDEX()',
    insertText: 'CHARINDEX(${1:substring}, ${2:string})',
    detail: '字符串函数 (SQL Server)',
    groups: ['mssql-like'],
  },
  {
    label: 'LEN()',
    insertText: 'LEN(${1:str})',
    detail: '字符串函数 (SQL Server)',
    groups: ['mssql-like'],
  },
  {
    label: 'STRING_AGG()',
    insertText: "STRING_AGG(${1:column}, '${2:,}')",
    detail: '聚合函数 (SQL Server)',
    groups: ['mssql-like'],
  },
  {
    label: 'NVL()',
    insertText: 'NVL(${1:expr}, ${2:default})',
    detail: '空值处理 (Oracle)',
    groups: ['oracle-like'],
  },
  {
    label: 'DECODE()',
    insertText: 'DECODE(${1:expr}, ${2:val1}, ${3:result1}, ${4:default})',
    detail: '条件函数 (Oracle)',
    groups: ['oracle-like'],
  },
  {
    label: 'SYSDATE',
    insertText: 'SYSDATE',
    detail: '日期时间函数 (Oracle)',
    groups: ['oracle-like'],
  },
  {
    label: 'TO_CHAR()',
    insertText: "TO_CHAR(${1:date}, '${2:YYYY-MM-DD}')",
    detail: '日期时间函数 (Oracle)',
    groups: ['oracle-like'],
  },
  {
    label: 'TO_DATE()',
    insertText: "TO_DATE('${1:2024-01-01}', '${2:YYYY-MM-DD}')",
    detail: '日期时间函数 (Oracle)',
    groups: ['oracle-like'],
  },
  {
    label: 'TO_NUMBER()',
    insertText: 'TO_NUMBER(${1:str})',
    detail: '类型转换 (Oracle)',
    groups: ['oracle-like'],
  },
  {
    label: 'INSTR()',
    insertText: 'INSTR(${1:str}, ${2:substr})',
    detail: '字符串函数 (Oracle)',
    groups: ['oracle-like'],
  },
  {
    label: 'SUBSTR()',
    insertText: 'SUBSTR(${1:str}, ${2:start}, ${3:length})',
    detail: '字符串函数 (Oracle)',
    groups: ['oracle-like'],
  },
  {
    label: 'LISTAGG()',
    insertText: "LISTAGG(${1:column}, '${2:,}') WITHIN GROUP (ORDER BY ${3:column})",
    detail: '聚合函数 (Oracle)',
    groups: ['oracle-like'],
  },
];

export function filterFunctionsByDbType(
  items: SqlFunction[],
  dbType: DatabaseType | undefined
): SqlFunction[] {
  if (!dbType) return items;
  const group = DB_GROUP_MAP[dbType];
  return items.filter((item) => !item.groups || item.groups.includes(group));
}
