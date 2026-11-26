/** 数据对比弹窗用到的纯函数（与组件分开放，便于单测，也不触发 fast-refresh 的告警） */
import type { DataCompareCell, DataCompareRequest } from '../../types/api';
import type { SideSelection } from './SidePicker';

/** 键列输入框的内容 → 列名数组（逗号 / 中文逗号 / 空白分隔） */
export function splitKeyColumns(input: string): string[] {
  return input
    .split(/[,，\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function cellText(cell: DataCompareCell | undefined): string {
  if (!cell || cell.is_null) return 'NULL';
  return cell.value;
}

/** 把比对请求拼成后端要的形状；表没选齐时返回 null */
export function buildCompareRequest(args: {
  source: SideSelection;
  target: SideSelection;
  keyColumns: string;
  maxRows: number;
  maxStatements: number;
}): DataCompareRequest | null {
  const { source, target } = args;
  if (!source.connectionId || !source.table || !target.connectionId || !target.table) return null;
  return {
    source_connection_id: source.connectionId,
    source_database: source.database,
    source_table: source.table,
    target_connection_id: target.connectionId,
    target_database: target.database,
    target_table: target.table,
    key_columns: splitKeyColumns(args.keyColumns),
    max_rows: args.maxRows,
    max_statements: args.maxStatements,
  };
}
