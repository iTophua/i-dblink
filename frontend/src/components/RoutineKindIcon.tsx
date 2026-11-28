import {
  CodeOutlined,
  FunctionOutlined,
  SortAscendingOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import type { RoutineKind } from '../types/api';

/** 过程 / 函数 / 触发器 / 序列的图标，颜色和树上的目录一致 */
export function RoutineKindIcon({ kind }: { kind: RoutineKind }) {
  switch (kind) {
    case 'procedure':
      return <CodeOutlined style={{ color: 'var(--color-success)' }} />;
    case 'function':
      return <FunctionOutlined style={{ color: 'var(--color-info)' }} />;
    case 'trigger':
      return <ThunderboltOutlined style={{ color: 'var(--color-error)' }} />;
    case 'sequence':
      return <SortAscendingOutlined style={{ color: 'var(--color-warning)' }} />;
  }
}
