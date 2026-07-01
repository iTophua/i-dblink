import type { DatabaseType } from '../types/api';

export type LiveTemplateCategory = 'dml' | 'ddl' | 'dcl' | 'common';

export interface LiveTemplate {
  /** Short trigger word, e.g. 'sel' */
  trigger: string;
  /** i18n key for the template name (under common.liveTemplates.*) */
  nameKey: string;
  /** i18n key for the description */
  descriptionKey: string;
  /** Template body with ${variable} placeholders (Monaco snippet syntax) */
  body: string;
  /** Optional: restrict to specific DB types */
  dbTypes?: DatabaseType[];
  /** Category for grouping */
  category: LiveTemplateCategory;
}

/**
 * SQL live templates — type a short trigger + Tab to expand into a full
 * SQL snippet with editable placeholders.
 *
 * Placeholder syntax uses Monaco's built-in snippet format:
 *   ${name}     — simple placeholder
 *   ${1:default} — numbered tab-stop with default text
 */
export const SQL_LIVE_TEMPLATES: LiveTemplate[] = [
  // ── DML ──────────────────────────────────────────────
  {
    trigger: 'sel',
    nameKey: 'selectQuery',
    descriptionKey: 'selectQueryDesc',
    body: 'SELECT ${1:columns}\nFROM ${2:table}\nWHERE ${3:condition};',
    category: 'dml',
  },
  {
    trigger: 'selall',
    nameKey: 'selectAll',
    descriptionKey: 'selectAllDesc',
    body: 'SELECT *\nFROM ${1:table}\nLIMIT ${2:100};',
    category: 'dml',
  },
  {
    trigger: 'ins',
    nameKey: 'insertStmt',
    descriptionKey: 'insertStmtDesc',
    body: 'INSERT INTO ${1:table} (${2:columns})\nVALUES (${3:values});',
    category: 'dml',
  },
  {
    trigger: 'upd',
    nameKey: 'updateStmt',
    descriptionKey: 'updateStmtDesc',
    body: 'UPDATE ${1:table}\nSET ${2:column} = ${3:value}\nWHERE ${4:condition};',
    category: 'dml',
  },
  {
    trigger: 'del',
    nameKey: 'deleteStmt',
    descriptionKey: 'deleteStmtDesc',
    body: 'DELETE FROM ${1:table}\nWHERE ${2:condition};',
    category: 'dml',
  },

  // ── DDL ──────────────────────────────────────────────
  {
    trigger: 'ct',
    nameKey: 'createTable',
    descriptionKey: 'createTableDesc',
    body: 'CREATE TABLE ${1:name} (\n  ${2:id} INT PRIMARY KEY,\n  ${3:columns}\n);',
    category: 'ddl',
  },
  {
    trigger: 'cv',
    nameKey: 'createView',
    descriptionKey: 'createViewDesc',
    body: 'CREATE VIEW ${1:name} AS\nSELECT ${2:columns}\nFROM ${3:table};',
    category: 'ddl',
  },
  {
    trigger: 'idx',
    nameKey: 'createIndex',
    descriptionKey: 'createIndexDesc',
    body: 'CREATE INDEX ${1:name} ON ${2:table} (${3:columns});',
    category: 'ddl',
  },

  // ── Common ───────────────────────────────────────────
  {
    trigger: 'join',
    nameKey: 'leftJoin',
    descriptionKey: 'leftJoinDesc',
    body: 'LEFT JOIN ${1:table} AS ${2:alias}\n  ON ${3:alias}.${4:column} = ${5:other}.${6:column}',
    category: 'common',
  },
  {
    trigger: 'case',
    nameKey: 'caseWhen',
    descriptionKey: 'caseWhenDesc',
    body: 'CASE\n  WHEN ${1:condition} THEN ${2:value}\n  ELSE ${3:default}\nEND',
    category: 'common',
  },
  {
    trigger: 'cte',
    nameKey: 'cte',
    descriptionKey: 'cteDesc',
    body: 'WITH ${1:name} AS (\n  SELECT ${2:columns}\n  FROM ${3:table}\n)\nSELECT * FROM ${1:name};',
    category: 'common',
  },
  {
    trigger: 'tran',
    nameKey: 'beginTransaction',
    descriptionKey: 'beginTransactionDesc',
    body: 'BEGIN TRANSACTION;\n\n${1:sql}\n\nCOMMIT;',
    category: 'common',
  },
];
