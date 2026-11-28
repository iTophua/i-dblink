import type { CSSProperties } from 'react';
import type { RoutineKind, SequenceInfo } from '../types/api';

export const ROUTINE_KINDS: RoutineKind[] = ['procedure', 'function', 'trigger', 'sequence'];

/** 对象页的类型是不是过程 / 函数 / 触发器 / 序列这四类之一 */
export function isRoutineKind(type: unknown): type is RoutineKind {
  return ROUTINE_KINDS.includes(type as RoutineKind);
}

/** 列表里的一项。各库后端给的字段名不统一（name / trigger_name / sequence_name …），这里归一 */
export interface RoutineItem {
  name: string;
  /** 触发器所在的表 */
  table?: string;
  event?: string;
  timing?: string;
  /** 列表里就带着定义的（触发器）：看详情不用再请求 */
  definition?: string;
  /** 序列的属性 */
  sequence?: SequenceInfo;
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

export function toRoutineItem(raw: unknown): RoutineItem | null {
  if (typeof raw === 'string') return { name: raw };
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name =
    text(o.name) || text(o.sequence_name) || text(o.trigger_name) || text(o.routine_name);
  if (!name) return null;
  return {
    name,
    table: text(o.table) || text(o.table_name) || text(o.event_object_table) || undefined,
    event: text(o.event) || text(o.event_manipulation) || undefined,
    timing: text(o.timing) || text(o.action_timing) || undefined,
    definition: text(o.definition) || text(o.statement) || text(o.sql) || undefined,
    sequence: typeof o.sequence_name === 'string' ? (o as unknown as SequenceInfo) : undefined,
  };
}

/** 带数量的标题，和树上的目录同一句话：「存储过程 (42)」 */
export const ROUTINE_COUNT_KEY: Record<RoutineKind, string> = {
  procedure: 'common.procedures',
  function: 'common.functions',
  trigger: 'common.triggers',
  sequence: 'common.sequences',
};

export const ROUTINE_EMPTY_KEY: Record<RoutineKind, string> = {
  procedure: 'common.noProcedures',
  function: 'common.noFunctions',
  trigger: 'common.noTriggers',
  sequence: 'common.noSequences',
};

/** 右上角数量标签的配色，和表列表的标签同一套写法 */
export const ROUTINE_TAG_STYLE: Record<RoutineKind, CSSProperties> = {
  procedure: {
    background: 'var(--color-success-alpha-15)',
    color: 'var(--color-success)',
    border: '1px solid var(--color-success-alpha-30)',
  },
  function: {
    background: 'var(--color-info-alpha-15)',
    color: 'var(--color-info)',
    border: '1px solid var(--color-info-alpha-30)',
  },
  trigger: {
    background: 'var(--color-error-alpha-15)',
    color: 'var(--color-error)',
    border: '1px solid var(--color-error-alpha-30)',
  },
  sequence: {
    background: 'var(--color-warning-alpha-15)',
    color: 'var(--color-warning)',
    border: '1px solid var(--color-warning-alpha-30)',
  },
};
