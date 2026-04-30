import { useCallback, useEffect, useState, memo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Node,
  Edge,
  Position,
  Handle,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Spin, Card, Button, Space, Select, message } from 'antd';
import { ReloadOutlined, KeyOutlined, LinkOutlined } from '@ant-design/icons';
import { api } from '../../api';
import type { TableInfo, ForeignKeyInfo, ColumnInfo } from '../../types/api';

interface ERDiagramProps {
  connectionId: string;
  database?: string;
}

interface TableNodeData extends Record<string, unknown> {
  label: string;
  columns: ColumnInfo[];
  pkColumns: Set<string>;
  fkColumns: Set<string>;
}

const TableNode = memo(({ data }: { data: TableNodeData }) => {
  const { label, columns, pkColumns, fkColumns } = data;
  const headerHeight = 32;
  const rowHeight = 22;
  const height = headerHeight + columns.length * rowHeight + 8;

  return (
    <div
      style={{
        width: 220,
        height,
        background: 'var(--background-card)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        overflow: 'hidden',
        fontSize: 11,
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ width: 6, height: 6 }} />
      <div
        style={{
          height: headerHeight,
          background: 'var(--background-toolbar)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          fontWeight: 600,
          fontSize: 12,
          color: 'var(--text-primary)',
        }}
      >
        {label}
      </div>
      <div style={{ padding: '4px 0' }}>
        {columns.map((col) => {
          const isPk = pkColumns.has(col.column_name);
          const isFk = fkColumns.has(col.column_name);
          return (
            <div
              key={col.column_name}
              style={{
                height: rowHeight,
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                gap: 4,
                color: isPk ? 'var(--color-primary)' : 'var(--text-secondary)',
                fontWeight: isPk ? 500 : 400,
              }}
              title={`${col.column_name} ${col.data_type}${col.is_nullable === 'NO' ? ' NOT NULL' : ''}`}
            >
              <span style={{ width: 14, display: 'flex', justifyContent: 'center' }}>
                {isPk && <KeyOutlined style={{ fontSize: 10, color: 'var(--color-warning)' }} />}
                {!isPk && isFk && (
                  <LinkOutlined style={{ fontSize: 10, color: 'var(--color-primary)' }} />
                )}
              </span>
              <span
                style={{
                  flex: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.column_name}
              </span>
              <span
                style={{
                  color: 'var(--text-tertiary)',
                  fontSize: 10,
                  maxWidth: 70,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {col.data_type}
              </span>
            </div>
          );
        })}
      </div>
      <Handle type="source" position={Position.Right} style={{ width: 6, height: 6 }} />
    </div>
  );
});

const nodeTypes = { tableNode: TableNode };

export function ERDiagram({ connectionId, database }: ERDiagramProps) {
  const [loading, setLoading] = useState(false);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [foreignKeys, setForeignKeys] = useState<Map<string, ForeignKeyInfo[]>>(new Map());
  const [tableColumns, setTableColumns] = useState<Map<string, ColumnInfo[]>>(new Map());
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const fetchSchema = useCallback(async () => {
    if (!connectionId) return;

    setLoading(true);
    try {
      const tablesResult = await api.getTablesCategorized(connectionId, database);
      const allTables = [...tablesResult.tables, ...tablesResult.views];
      setTables(allTables);

      const fkMap = new Map<string, ForeignKeyInfo[]>();
      const colMap = new Map<string, ColumnInfo[]>();

      for (const table of allTables) {
        try {
          const [fks, cols] = await Promise.all([
            api.getForeignKeys(connectionId, table.table_name, database),
            api.getColumns(connectionId, table.table_name, database),
          ]);
          if (fks.length > 0) fkMap.set(table.table_name, fks);
          colMap.set(table.table_name, cols);
        } catch (e) {
          console.warn(`Failed to get metadata for ${table.table_name}:`, e);
        }
      }
      setForeignKeys(fkMap);
      setTableColumns(colMap);
      message.success(`已加载 ${allTables.length} 个表`);
    } catch (error: any) {
      message.error(`加载失败：${error.message || error}`);
    } finally {
      setLoading(false);
    }
  }, [connectionId, database]);

  useEffect(() => {
    fetchSchema();
  }, [fetchSchema]);

  const buildGraph = useCallback(() => {
    if (tables.length === 0) return;

    const nodeWidth = 220;
    const headerHeight = 32;
    const rowHeight = 22;
    const horizontalSpacing = 120;
    const verticalSpacing = 60;

    const positions = new Map<string, { x: number; y: number }>();

    // 按列数计算每个节点的高度，进行简单网格布局
    const cols = Math.ceil(Math.sqrt(tables.length));
    let currentX = 0;
    let currentY = 0;
    let maxRowHeight = 0;
    let colIndex = 0;

    tables.forEach((table) => {
      const columns = tableColumns.get(table.table_name) || [];
      const nodeHeight = headerHeight + columns.length * rowHeight + 8;

      positions.set(table.table_name, { x: currentX, y: currentY });

      currentX += nodeWidth + horizontalSpacing;
      maxRowHeight = Math.max(maxRowHeight, nodeHeight);
      colIndex++;

      if (colIndex >= cols) {
        colIndex = 0;
        currentX = 0;
        currentY += maxRowHeight + verticalSpacing;
        maxRowHeight = 0;
      }
    });

    const newNodes: Node<TableNodeData>[] = tables.map((table) => {
      const pos = positions.get(table.table_name) || { x: 0, y: 0 };
      const fks = foreignKeys.get(table.table_name) || [];
      const cols = tableColumns.get(table.table_name) || [];
      const isFocus = selectedTable && table.table_name === selectedTable;

      const pkColumns = new Set(
        cols.filter((c) => c.column_key === 'PRI').map((c) => c.column_name)
      );
      const fkColumns = new Set(fks.map((f) => f.column_name));

      return {
        id: table.table_name,
        type: 'tableNode',
        position: pos,
        data: {
          label: table.table_name,
          columns: cols,
          pkColumns,
          fkColumns,
        } as TableNodeData,
        style: {
          width: nodeWidth,
          padding: 0,
          border: isFocus ? '2px solid var(--color-primary)' : '1px solid transparent',
          borderRadius: 8,
          background: 'transparent',
          boxShadow: 'none',
        },
      };
    });

    const newEdges: Edge[] = [];
    const edgeSet = new Set<string>();

    tables.forEach((table) => {
      const fks = foreignKeys.get(table.table_name) || [];
      for (const fk of fks) {
        const edgeId = `${table.table_name}-${fk.referenced_table}`;
        if (edgeSet.has(edgeId)) continue;
        edgeSet.add(edgeId);

        newEdges.push({
          id: edgeId,
          source: fk.referenced_table,
          target: table.table_name,
          label: `${fk.column_name} → ${fk.referenced_column}`,
          type: 'smoothstep',
          animated: false,
          style: { stroke: 'var(--color-primary)', strokeWidth: 1.5 },
          labelStyle: { fontSize: 10, fill: 'var(--text-secondary)' },
          labelBgStyle: {
            fill: 'var(--background)',
            fillOpacity: 0.9,
          },
        });
      }
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, [tables, foreignKeys, tableColumns, selectedTable, setNodes, setEdges]);

  useEffect(() => {
    if (tables.length > 0) {
      buildGraph();
    }
  }, [tables, foreignKeys, tableColumns, selectedTable, buildGraph]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          zIndex: 10,
          background: 'var(--background-card)',
          borderRadius: 8,
          padding: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <Button icon={<ReloadOutlined />} onClick={fetchSchema} loading={loading} size="small">
          刷新
        </Button>

        <Select
          placeholder="筛选表"
          allowClear
          style={{ width: 150 }}
          size="small"
          value={selectedTable}
          onChange={(v) => setSelectedTable(v)}
          options={tables.map((t) => ({ value: t.table_name, label: t.table_name }))}
        />

        {selectedTable && (
          <Button size="small" onClick={() => setSelectedTable(null)}>
            显示全部
          </Button>
        )}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 10,
          background: 'var(--background-card)',
          borderRadius: 8,
          padding: '8px 12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          fontSize: 12,
          color: 'var(--text-secondary)',
        }}
      >
        <div>表: {tables.length}</div>
        <div>关系: {edges.length}</div>
      </div>

      {loading && tables.length === 0 ? (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
          }}
        >
          <Spin size="large" tip="加载表结构..." />
        </div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          defaultEdgeOptions={{
            type: 'smoothstep',
          }}
        >
          <Background />
          <Controls />
          <MiniMap nodeColor={() => 'var(--color-success)'} />
        </ReactFlow>
      )}

      {!loading && tables.length === 0 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100%',
          }}
        >
          <Card>
            <Space direction="vertical" align="center">
              <div style={{ color: 'var(--text-secondary)' }}>暂无表数据</div>
              <Button icon={<ReloadOutlined />} onClick={fetchSchema}>
                刷新
              </Button>
            </Space>
          </Card>
        </div>
      )}
    </div>
  );
}

export default ERDiagram;
