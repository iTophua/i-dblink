import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import { useTranslation } from 'react-i18next';
import type { TableFlowNode } from './layout';

/** ER 图里的一个表节点：表头 + 若干行列（主键 / 外键标记） */
function TableNodeInner({ data }: NodeProps<TableFlowNode>) {
  const { t } = useTranslation();
  const { table, rows, hiddenCount, selected } = data;

  return (
    <div
      className={`er-table${selected ? ' is-selected' : ''}${data.dimmed ? ' is-dimmed' : ''}`}
      style={{ width: data.width }}
      data-testid={`er-table-${table.id}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="in"
        className="er-handle"
        isConnectable={false}
      />
      <div className="er-table-header" title={table.comment || undefined}>
        <span className="er-table-name">
          {table.schema && <span className="er-table-schema">{table.schema}.</span>}
          {table.name}
        </span>
      </div>
      <div className="er-table-body">
        {rows.map(({ column, isFK }) => (
          <div
            key={column.name}
            className={`er-row${column.is_pk ? ' is-pk' : ''}`}
            title={`${column.name} ${column.data_type}${column.comment ? ` — ${column.comment}` : ''}`}
          >
            <span className="er-row-badges">
              {column.is_pk && <i className="er-badge is-pk">PK</i>}
              {isFK && <i className="er-badge is-fk">FK</i>}
            </span>
            <span className="er-row-name">{column.name}</span>
            <span className="er-row-type">{column.data_type}</span>
          </div>
        ))}
        {hiddenCount > 0 && (
          <div className="er-row er-row-more">
            +{hiddenCount} {t('common.erDiagram.columns')}
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="out"
        className="er-handle"
        isConnectable={false}
      />
    </div>
  );
}

export const TableNode = memo(TableNodeInner);
