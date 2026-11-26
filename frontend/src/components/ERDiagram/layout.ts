/**
 * ER 图的纯计算部分：把后端的表 / 外键数据变成 React Flow 的节点与边，并做布局。
 * 不依赖 React，方便单测。
 */
import type { Edge, Node } from '@xyflow/react';
import dagre from 'dagre';
import type { ERColumn, ERDiagram, EREdge, ERTable } from '../../types/api';

export const ER_NODE_WIDTH = 236;
export const ER_HEADER_HEIGHT = 32;
export const ER_ROW_HEIGHT = 22;
const BODY_PADDING = 6;
/** 紧凑模式下每张表最多画多少行主键 / 外键列 */
export const COMPACT_MAX_ROWS = 8;
/** 既没有主键也没有外键的表，紧凑模式下先画前几行 */
const UNRELATED_PREVIEW_ROWS = 3;

export interface ERRow {
  column: ERColumn;
  isFK: boolean;
}

export interface TableNodeData extends Record<string, unknown> {
  table: ERTable;
  rows: ERRow[];
  /** 被折叠掉的列数 */
  hiddenCount: number;
  width: number;
  height: number;
  /** 选中了别的表时，与它无直接关联的表变淡 */
  dimmed: boolean;
  /** 当前选中的表 */
  selected: boolean;
}

export type TableFlowNode = Node<TableNodeData>;

/** 每张表上作为外键的列名 */
export function fkColumnsByTable(edges: EREdge[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const e of edges) {
    let set = map.get(e.from_table);
    if (!set) {
      set = new Set();
      map.set(e.from_table, set);
    }
    set.add(e.from_column);
  }
  return map;
}

/** 直接关联的表（不分方向） */
export function neighboursByTable(edges: EREdge[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  const link = (a: string, b: string) => {
    if (a === b) return;
    let set = map.get(a);
    if (!set) {
      set = new Set();
      map.set(a, set);
    }
    set.add(b);
  };
  for (const e of edges) {
    link(e.from_table, e.to_table);
    link(e.to_table, e.from_table);
  }
  return map;
}

/**
 * 表上要画的行。紧凑模式只画主键和外键列（保持原列序），其余折成一行「+N 列」；
 * 完整模式画全部列。
 */
export function visibleRows(
  table: ERTable,
  fkColumns: Set<string>,
  compact: boolean
): { rows: ERRow[]; hiddenCount: number } {
  const all: ERRow[] = table.columns.map((column) => ({
    column,
    isFK: fkColumns.has(column.name),
  }));
  if (!compact) return { rows: all, hiddenCount: 0 };

  const keyRows = all.filter((r) => r.column.is_pk || r.isFK);
  const picked = keyRows.length > 0 ? keyRows : all.slice(0, UNRELATED_PREVIEW_ROWS);
  const rows = picked.slice(0, COMPACT_MAX_ROWS);
  return { rows, hiddenCount: all.length - rows.length };
}

export function nodeHeight(rowCount: number, hasMore: boolean): number {
  return ER_HEADER_HEIGHT + (rowCount + (hasMore ? 1 : 0)) * ER_ROW_HEIGHT + BODY_PADDING;
}

/** 两端都是图里现有表的关系（跨库外键、指向视图的关系丢弃） */
export function existingEdges(diagram: ERDiagram): EREdge[] {
  const known = new Set((diagram.tables ?? []).map((t) => t.id));
  return (diagram.edges ?? []).filter((e) => known.has(e.from_table) && known.has(e.to_table));
}

/** 自引用外键的出入点在竖直方向上错开多少 */
const LOOP_OFFSET = 12;
/** 自引用外键向表右侧伸出多远（导出整张图时右边要留出这段） */
export const SELF_LOOP_REACH = 44;

/**
 * 自引用外键的路径：连接点在表的最右边，线从连接点上方出发、向右伸出、回到连接点下方，
 * 不经过表身。
 */
export function selfLoopPath(sourceX: number, sourceY: number): string {
  return (
    `M ${sourceX} ${sourceY - LOOP_OFFSET} ` +
    `C ${sourceX + SELF_LOOP_REACH} ${sourceY - LOOP_OFFSET - 26}, ` +
    `${sourceX + SELF_LOOP_REACH} ${sourceY + LOOP_OFFSET + 26}, ` +
    `${sourceX} ${sourceY + LOOP_OFFSET}`
  );
}

export function edgeId(e: EREdge): string {
  return `${e.from_table}.${e.from_column}→${e.to_table}.${e.to_column}#${e.name ?? ''}:${e.seq}`;
}

/** 表节点 id → 不带 schema 的表名（发给 AI 上下文时用） */
export function bareTableName(id: string): string {
  const i = id.lastIndexOf('.');
  return i >= 0 ? id.slice(i + 1) : id;
}

export function buildGraph(
  diagram: ERDiagram,
  compact: boolean
): {
  nodes: TableFlowNode[];
  edges: Edge[];
} {
  const edges = existingEdges(diagram);
  const fkColumns = fkColumnsByTable(edges);
  const nodes: TableFlowNode[] = (diagram.tables ?? []).map((table) => {
    const { rows, hiddenCount } = visibleRows(table, fkColumns.get(table.id) ?? new Set(), compact);
    return {
      id: table.id,
      type: 'erTable',
      position: { x: 0, y: 0 },
      // 节点数据里放的是表本身，React Flow 按对象引用判断是否要重渲染
      data: {
        table,
        rows,
        hiddenCount,
        width: ER_NODE_WIDTH,
        height: nodeHeight(rows.length, hiddenCount > 0),
        dimmed: false,
        selected: false,
      },
    };
  });
  return {
    nodes,
    edges: edges.map((e) => ({
      id: edgeId(e),
      source: e.from_table,
      target: e.to_table,
      sourceHandle: 'out',
      // 自引用外键：两端都用右侧的连接点，线绕到表右侧再回来（SelfLoopEdge）
      targetHandle: e.from_table === e.to_table ? 'out' : 'in',
      type: e.from_table === e.to_table ? 'erSelfLoop' : undefined,
      className: 'er-edge',
    })),
  };
}

/** dagre 分层布局：外键方向从左到右（子表在左、父表在右） */
export function layoutNodes(nodes: TableFlowNode[], edges: Edge[]): TableFlowNode[] {
  if (nodes.length === 0) return nodes;
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 36, ranksep: 110, marginx: 24, marginy: 24 });
  for (const node of nodes) {
    g.setNode(node.id, { width: node.data.width, height: node.data.height });
  }
  for (const e of edges) {
    // 两端都在图里才连（buildGraph 已过滤，这里再保一道）
    if (g.hasNode(String(e.source)) && g.hasNode(String(e.target))) {
      g.setEdge(String(e.source), String(e.target));
    }
  }
  dagre.layout(g);
  return nodes.map((node) => {
    const pos = g.node(node.id);
    if (!pos) return node;
    return {
      ...node,
      position: {
        x: pos.x - node.data.width / 2,
        y: pos.y - node.data.height / 2,
      },
    };
  });
}

/**
 * 选中一张表：它和直接关联的表保持正常，其余变淡；与它相连的关系线高亮。
 * 没有选中时全部正常。
 */
export function applyHighlight(
  nodes: TableFlowNode[],
  edges: Edge[],
  selectedId: string | null,
  neighbours: Map<string, Set<string>>
): { nodes: TableFlowNode[]; edges: Edge[] } {
  if (!selectedId) {
    const touched =
      nodes.some((n) => n.data.dimmed || n.data.selected) ||
      edges.some((e) => e.className !== 'er-edge');
    if (!touched) return { nodes, edges };
    return {
      nodes: nodes.map((n) =>
        n.data.dimmed || n.data.selected
          ? { ...n, data: { ...n.data, dimmed: false, selected: false } }
          : n
      ),
      edges: edges.map((e) => ({ ...e, className: 'er-edge', animated: false })),
    };
  }
  const active = new Set([selectedId, ...(neighbours.get(selectedId) ?? [])]);
  return {
    nodes: nodes.map((n) => {
      const dimmed = !active.has(n.id);
      const selected = n.id === selectedId;
      return dimmed === n.data.dimmed && selected === n.data.selected
        ? n
        : { ...n, data: { ...n.data, dimmed, selected } };
    }),
    edges: edges.map((e) => {
      const on = e.source === selectedId || e.target === selectedId;
      const className = on ? 'er-edge is-active' : 'er-edge is-dim';
      return className === e.className ? e : { ...e, className, animated: on };
    }),
  };
}
