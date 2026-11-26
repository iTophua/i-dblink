import { describe, expect, it } from 'vitest';
import type { ERDiagram, ERTable } from '../../types/api';
import {
  COMPACT_MAX_ROWS,
  applyHighlight,
  bareTableName,
  buildGraph,
  edgeId,
  existingEdges,
  fkColumnsByTable,
  layoutNodes,
  neighboursByTable,
  nodeHeight,
  selfLoopPath,
  visibleRows,
} from '../../components/ERDiagram/layout';

function table(id: string, names: string[], pk: string[] = []): ERTable {
  return {
    id,
    name: bareTableName(id),
    comment: '',
    columns: names.map((name) => ({
      name,
      data_type: 'int',
      nullable: !pk.includes(name),
      is_pk: pk.includes(name),
    })),
  };
}

const diagram: ERDiagram = {
  tables: [
    table('user', ['id', 'org_id', 'name'], ['id']),
    table('org', ['id', 'code'], ['id']),
    table('order', ['id', 'user_id', 'region_id'], ['id']),
    table('orphan', ['id', 'x'], ['id']),
  ],
  edges: [
    {
      name: 'fk_user_org',
      from_table: 'user',
      from_column: 'org_id',
      to_table: 'org',
      to_column: 'id',
      seq: 1,
    },
    {
      name: 'fk_order_user',
      from_table: 'order',
      from_column: 'user_id',
      to_table: 'user',
      to_column: 'id',
      seq: 1,
    },
    {
      name: 'fk_order_region',
      from_table: 'order',
      from_column: 'region_id',
      to_table: 'user',
      to_column: 'org_id',
      seq: 2,
    },
    {
      name: 'fk_dangling',
      from_table: 'orphan',
      from_column: 'x',
      to_table: 'missing',
      to_column: 'id',
      seq: 1,
    },
  ],
};

describe('ER 图布局（纯计算）', () => {
  it('按表统计外键列与直接关联的表', () => {
    const fks = fkColumnsByTable(diagram.edges);
    expect([...(fks.get('user') ?? [])]).toEqual(['org_id']);
    expect([...(fks.get('order') ?? [])]).toEqual(['user_id', 'region_id']);
    expect(fks.has('org')).toBe(false);

    // 原始关系里有一端不在图里的（指向 missing）；只按图内关系算关联表
    expect(existingEdges(diagram).map((e) => e.name)).toEqual([
      'fk_user_org',
      'fk_order_user',
      'fk_order_region',
    ]);
    const nb = neighboursByTable(existingEdges(diagram));
    expect([...(nb.get('user') ?? [])].sort()).toEqual(['order', 'org']);
    expect([...(nb.get('orphan') ?? [])]).toEqual([]);
  });

  it('紧凑模式只保留主键 / 外键列并保持原列序，其余折叠', () => {
    const user = table('user', ['id', 'org_id', 'name'], ['id']);
    const { rows, hiddenCount } = visibleRows(user, new Set(['org_id']), true);
    expect(rows.map((r) => r.column.name)).toEqual(['id', 'org_id']);
    expect(rows[0].isFK).toBe(false);
    expect(rows[1].isFK).toBe(true);
    expect(hiddenCount).toBe(1);

    const full = visibleRows(user, new Set(['org_id']), false);
    expect(full.rows).toHaveLength(3);
    expect(full.hiddenCount).toBe(0);
  });

  it('既没有主键也没有外键的表先画前几行；主键 / 外键列太多时截断', () => {
    const plain = visibleRows(table('log', ['a', 'b', 'c', 'd']), new Set(), true);
    expect(plain.rows).toHaveLength(3);
    expect(plain.hiddenCount).toBe(1);

    const wide = Array.from({ length: COMPACT_MAX_ROWS + 4 }, (_, i) => `c${i}`);
    const many = visibleRows(
      table('wide', wide, wide.slice(0, COMPACT_MAX_ROWS + 4)),
      new Set(),
      true
    );
    expect(many.rows).toHaveLength(COMPACT_MAX_ROWS);
    expect(many.hiddenCount).toBe(4);
  });

  it('节点高度随行数变化，折叠行本身也占一行', () => {
    expect(nodeHeight(3, false)).toBeLessThan(nodeHeight(3, true));
    expect(nodeHeight(5, false) - nodeHeight(2, false)).toBe(3 * 22);
  });

  it('buildGraph 只保留两端都在图里的关系', () => {
    const graph = buildGraph(diagram, true);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(['order', 'org', 'orphan', 'user']);
    expect(graph.edges).toHaveLength(3);
    expect(graph.edges.every((e) => e.sourceHandle === 'out' && e.targetHandle === 'in')).toBe(
      true
    );
    expect(new Set(graph.edges.map((e) => e.id)).size).toBe(3);
    // 关系 id 能区分同一列上的不同约束
    expect(edgeId(diagram.edges[1])).not.toBe(edgeId(diagram.edges[2]));

    // 空数据也不能崩
    expect(buildGraph({ tables: [], edges: [] }, true)).toEqual({ nodes: [], edges: [] });
  });

  it('布局把子表放在父表左边，节点互不重叠', () => {
    const { nodes, edges } = buildGraph(diagram, true);
    const positioned = layoutNodes(nodes, edges);
    const pos = Object.fromEntries(positioned.map((n) => [n.id, n.position]));
    expect(pos.order.x).toBeLessThan(pos.user.x);
    expect(pos.user.x).toBeLessThan(pos.org.x);
    // 每个节点都拿到了坐标
    positioned.forEach((n) => {
      expect(Number.isFinite(n.position.x)).toBe(true);
      expect(Number.isFinite(n.position.y)).toBe(true);
    });
    // 任意两个节点的矩形不相交
    for (let i = 0; i < positioned.length; i++) {
      for (let j = i + 1; j < positioned.length; j++) {
        const a = positioned[i];
        const b = positioned[j];
        const overlap =
          a.position.x < b.position.x + b.data.width &&
          b.position.x < a.position.x + a.data.width &&
          a.position.y < b.position.y + b.data.height &&
          b.position.y < a.position.y + a.data.height;
        expect(overlap).toBe(false);
      }
    }
  });

  it('选中一张表时只高亮它和关联表，取消后全部恢复', () => {
    const { nodes, edges } = buildGraph(diagram, true);
    const nb = neighboursByTable(existingEdges(diagram));

    const lit = applyHighlight(nodes, edges, 'user', nb);
    const dim = Object.fromEntries(lit.nodes.map((n) => [n.id, n.data.dimmed]));
    expect(dim).toEqual({ user: false, org: false, order: false, orphan: true });
    const activeEdges = lit.edges.filter((e) => e.className === 'er-edge is-active');
    // 与 user 相连的三条线全亮：它是两条的子表端、一条的父表端
    expect(activeEdges.map((e) => e.id).sort()).toEqual(
      [diagram.edges[0], diagram.edges[1], diagram.edges[2]].map(edgeId).sort()
    );
    expect(lit.edges.filter((e) => e.className === 'er-edge is-dim')).toHaveLength(0);

    const reset = applyHighlight(lit.nodes, lit.edges, null, nb);
    expect(reset.nodes.every((n) => !n.data.dimmed)).toBe(true);
    expect(reset.edges.every((e) => e.className === 'er-edge' && !e.animated)).toBe(true);

    // 没有选中且本来就是干净状态时，原样返回（不制造多余的重渲染）
    expect(applyHighlight(reset.nodes, reset.edges, null, nb).nodes).toBe(reset.nodes);
  });

  it('自引用外键走专门的自环连线，两端都在右侧连接点上', () => {
    const selfRef: ERDiagram = {
      tables: [table('org', ['id', 'parent_id'], ['id']), table('dept', ['id', 'org_id'], ['id'])],
      edges: [
        {
          name: 'fk_org_parent',
          from_table: 'org',
          from_column: 'parent_id',
          to_table: 'org',
          to_column: 'id',
          seq: 1,
        },
        {
          name: 'fk_dept_org',
          from_table: 'dept',
          from_column: 'org_id',
          to_table: 'org',
          to_column: 'id',
          seq: 1,
        },
      ],
    };
    const { edges } = buildGraph(selfRef, true);
    const self = edges.find((e) => e.id === edgeId(selfRef.edges[0]));
    const normal = edges.find((e) => e.id === edgeId(selfRef.edges[1]));
    expect(self).toMatchObject({ type: 'erSelfLoop', sourceHandle: 'out', targetHandle: 'out' });
    expect(normal).toMatchObject({ type: undefined, sourceHandle: 'out', targetHandle: 'in' });

    // 自环路径：从连接点上方出发、向右伸出、回到连接点下方（连接点在表的最右边，线不经过表身）
    const d = selfLoopPath(100, 200);
    expect(d.startsWith('M 100 188 ')).toBe(true);
    expect(d.endsWith('100 212')).toBe(true);
    expect(d).toContain('144 ');
  });

  it('PG 系的表 id 去掉 schema 前缀', () => {
    expect(bareTableName('public.users')).toBe('users');
    expect(bareTableName('users')).toBe('users');
  });
});
