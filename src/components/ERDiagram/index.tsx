import { useCallback, useEffect, useState } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Spin, Card, Button, Space, Select, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { api } from '../../api';
import type { TableInfo, ForeignKeyInfo } from '../../types/api';

interface ERDiagramProps {
  connectionId: string;
  database?: string;
}

interface TableNodeData extends Record<string, unknown> {
  label: string;
  columns: string[];
}

export function ERDiagram({ connectionId, database }: ERDiagramProps) {
  const [loading, setLoading] = useState(false);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [foreignKeys, setForeignKeys] = useState<Map<string, ForeignKeyInfo[]>>(new Map());
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
      for (const table of allTables) {
        try {
          const fks = await api.getForeignKeys(connectionId, table.table_name, database);
          if (fks.length > 0) {
            fkMap.set(table.table_name, fks);
          }
        } catch (e) {
          console.warn(`Failed to get foreign keys for ${table.table_name}:`, e);
        }
      }
      setForeignKeys(fkMap);
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
    const nodeHeight = 150;
    const horizontalSpacing = 100;
    const verticalSpacing = 80;

    const cols = Math.ceil(Math.sqrt(tables.length));
    const positions = new Map<string, { x: number; y: number }>();

    tables.forEach((table, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);

      positions.set(table.table_name, {
        x: col * (nodeWidth + horizontalSpacing),
        y: row * (nodeHeight + verticalSpacing),
      });
    });

    const newNodes: Node<TableNodeData>[] = tables.map((table) => {
      const pos = positions.get(table.table_name) || { x: 0, y: 0 };
      const fks = foreignKeys.get(table.table_name) || [];
      const isFocus = selectedTable && table.table_name === selectedTable;

      return {
        id: table.table_name,
        type: 'default',
        position: pos,
        data: {
          label: table.table_name,
          columns: fks.map((f) => f.column_name),
        } as TableNodeData,
        style: {
          width: nodeWidth,
          height: nodeHeight,
          border: isFocus ? '2px solid var(--color-primary)' : '1px solid var(--border)',
          borderRadius: 8,
          background: 'var(--background-card)',
          padding: 12,
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
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
  }, [tables, foreignKeys, selectedTable, setNodes, setEdges]);

  useEffect(() => {
    if (tables.length > 0) {
      buildGraph();
    }
  }, [tables, foreignKeys, selectedTable, buildGraph]);

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
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
          <Spin size="large" tip="加载表结构..." />
        </div>
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
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
          <MiniMap
            nodeColor={() => 'var(--color-success)'}
          />
        </ReactFlow>
      )}

      {!loading && tables.length === 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
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
