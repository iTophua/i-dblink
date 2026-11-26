/**
 * ER 图标签页：按外键关系画出库里的表。
 *
 * - 数据一次取齐（api.getERDiagram），dagre 分层布局：子表在左、父表在右。
 * - 默认只画主键 / 外键列（可切到全部列）；点一张表高亮它与直接关联的表，双击打开表数据。
 * - 「发给 AI 助手」把选中的表及其关联表设为 AI 面板的表结构上下文。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { App, Button, Checkbox, Select, Spin, Tooltip } from 'antd';
import {
  Background,
  ConnectionMode,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import type { Edge, NodeChange, ReactFlowInstance } from '@xyflow/react';
import {
  ApartmentOutlined,
  DownloadOutlined,
  ReloadOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type { ERDiagram as ERDiagramData } from '../../types/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { startNewAIChat } from '../../services/aiChatHistory';
import { useAIChatStore } from '../../stores/aiChatStore';
import { TableNode } from './TableNode';
import { SelfLoopEdge } from './SelfLoopEdge';
import {
  applyHighlight,
  bareTableName,
  buildGraph,
  existingEdges,
  layoutNodes,
  neighboursByTable,
  SELF_LOOP_REACH,
} from './layout';
import type { TableFlowNode } from './layout';
// React Flow 自带的基础样式（节点定位、连接点、控件）必须先于本组件的样式引入
import '@xyflow/react/dist/style.css';
import './er-diagram.css';

const nodeTypes = { erTable: TableNode };
const edgeTypes = { erSelfLoop: SelfLoopEdge };

export interface ERDiagramProps {
  connectionId: string;
  connectionName?: string;
  database?: string;
  /** 双击表：打开该表的数据标签页 */
  onOpenTable?: (tableName: string) => void;
}

type ERFlowInstance = ReactFlowInstance<TableFlowNode, Edge>;

const FIT_PADDING = 0.15;
/**
 * 初始视角：整张图放得下就全放，放不下也不缩得太小看不清字（想看全貌点「显示全部」）。
 * 0.6 时 11–12px 的列名在 Retina 上还能读个大概；十来张表的图在这个缩放下基本都能一眼看全
 */
const INITIAL_MIN_ZOOM = 0.6;

/** 把整张图放进画布（「显示全部」按钮用） */
const fitAll = (instance: ERFlowInstance | null) => {
  window.setTimeout(() => {
    void instance?.fitView({ padding: FIT_PADDING, minZoom: 0.08, maxZoom: 1 });
  }, 60);
};

/** 导出 PNG：每一步最多等多久、图四周留多少白边、按几倍尺寸输出 */
const EXPORT_TIMEOUT_MS = 20000;
const EXPORT_PADDING = 24;
const EXPORT_SCALE = 2;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('timeout')), ms);
    }),
  ]);
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image decode failed'));
    img.src = dataUrl;
  });
}

/**
 * 等界面把刚改的状态画出来（连续两帧）。
 * 窗口被遮挡 / 最小化时浏览器不出帧，所以必须带超时兜底，否则导出会卡在这里。
 */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 300);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        clearTimeout(timer);
        resolve();
      })
    );
  });
}

/** 节点整体的包围盒 */
function boundsOf(nodes: TableFlowNode[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.position.x);
    minY = Math.min(minY, n.position.y);
    maxX = Math.max(maxX, n.position.x + n.data.width);
    maxY = Math.max(maxY, n.position.y + n.data.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * 布局变化后的初始视角：整张图放得下就居中放下；
 * 放不下也不缩到看不清，而是停在图的左上角——分层布局里最左边是最「源头」的表。
 */
const focusStart = (
  instance: ERFlowInstance | null,
  canvas: HTMLElement | null,
  nodes: TableFlowNode[]
) => {
  window.setTimeout(() => {
    if (!instance || nodes.length === 0) return;
    const b = boundsOf(nodes);
    const size = canvas?.getBoundingClientRect();
    if (size && size.width > 0 && size.height > 0) {
      const availW = size.width * (1 - FIT_PADDING * 2);
      const availH = size.height * (1 - FIT_PADDING * 2);
      if (Math.min(availW / b.width, availH / b.height) < INITIAL_MIN_ZOOM) {
        void instance.setViewport({
          x: size.width * FIT_PADDING - b.x * INITIAL_MIN_ZOOM,
          y: size.height * FIT_PADDING - b.y * INITIAL_MIN_ZOOM,
          zoom: INITIAL_MIN_ZOOM,
        });
        return;
      }
    }
    void instance.fitView({ padding: FIT_PADDING, minZoom: INITIAL_MIN_ZOOM, maxZoom: 1 });
  }, 60);
};

function ERDiagramCanvas({ connectionId, database, onOpenTable }: ERDiagramProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const reactFlow = useReactFlow<TableFlowNode, Edge>();
  const instanceRef = useRef<ERFlowInstance | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  /** 最近一次加载的结果；key 记录它对应哪次请求（连接 + 库 + 刷新序号） */
  const [loaded, setLoaded] = useState<{
    key: string;
    diagram: ERDiagramData | null;
    error: string | null;
  }>({ key: '', diagram: null, error: null });
  const [compact, setCompact] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reloadSeq, setReloadSeq] = useState(0);
  const [exporting, setExporting] = useState(false);
  /** 用户拖动过的表的位置（id → 左上角坐标）；重新布局时清空 */
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});

  // 加载状态从「结果属于哪次请求」推导出来，不在 effect 里同步 setState
  const requestKey = `${connectionId}\u0000${database ?? ''}\u0000${reloadSeq}`;
  const loading = loaded.key !== requestKey;
  // 刷新失败时保留上一张图，错误只在还没有图可看时展示
  const diagram = loaded.error ? null : loaded.diagram;
  const error = loading ? null : loaded.error;

  useEffect(() => {
    let cancelled = false;
    api.getERDiagram(connectionId, database).then(
      (result) => {
        if (cancelled) return;
        setLoaded({
          key: requestKey,
          diagram: { ...result, tables: result.tables ?? [], edges: result.edges ?? [] },
          error: null,
        });
        setPositions({});
        setSelectedId(null);
      },
      (err: unknown) => {
        if (cancelled) return;
        setLoaded({ key: requestKey, diagram: null, error: getErrorMessage(err) });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [requestKey, connectionId, database]);

  // 只算两端都是现有表的关系：跨库外键的目标表不在图里，也不该进「发给 AI」的表选择
  const validEdges = useMemo(() => (diagram ? existingEdges(diagram) : []), [diagram]);
  const neighbours = useMemo(() => neighboursByTable(validEdges), [validEdges]);

  const graph = useMemo(
    () => buildGraph(diagram ?? { tables: [], edges: [] }, compact),
    [diagram, compact]
  );
  const positioned = useMemo(() => layoutNodes(graph.nodes, graph.edges), [graph]);
  // 节点位置变了（首次加载、切换紧凑 / 全部列）就重新定位视角；用户拖动表不触发
  useEffect(() => {
    if (positioned.length === 0) return;
    const timer = window.setTimeout(() => {
      focusStart(instanceRef.current, canvasRef.current, positioned);
    }, 60);
    return () => window.clearTimeout(timer);
  }, [positioned]);

  const { nodes, edges } = useMemo(() => {
    const restored = positioned.map((n) =>
      positions[n.id] ? { ...n, position: positions[n.id] } : n
    );
    return applyHighlight(restored, graph.edges, selectedId, neighbours);
  }, [positioned, graph, positions, selectedId, neighbours]);

  // Esc 取消选中
  useEffect(() => {
    if (!selectedId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedId]);

  const onNodesChange = useCallback((changes: NodeChange<TableFlowNode>[]) => {
    // 只记下拖动结束后的位置；节点本身是从数据推导出来的，不走 React Flow 的内部状态
    let moved = false;
    const next: Record<string, { x: number; y: number }> = {};
    for (const change of changes) {
      if (change.type === 'position' && change.position && change.dragging === false) {
        next[change.id] = change.position;
        moved = true;
      }
    }
    if (moved) setPositions((prev) => ({ ...prev, ...next }));
  }, []);

  const toggleCompact = (value: boolean) => {
    setCompact(value);
    setPositions({});
    setSelectedId(null);
  };

  const reload = () => {
    setSelectedId(null);
    setReloadSeq((n) => n + 1);
  };

  const locateTable = (id: string) => {
    setSelectedId(id);
    void reactFlow.fitView({ nodes: [{ id }], duration: 500, maxZoom: 1.2, padding: 0.6 });
  };

  /**
   * 导出整张图为 PNG（不是当前视野）：截的是「节点所在的那一层」，按节点整体的包围盒定尺寸。
   *
   * 不用库自带的 toPng：它在 onload 之后还要等 img.decode()，而带 foreignObject 的 SVG
   * 在部分内核里这个 Promise 永远不落定，按钮会一直转圈。只用它生成 SVG，加载和画到画布自己做，
   * 并给每一步加超时。
   */
  const exportPng = async () => {
    const viewport = document.querySelector('.er-flow .react-flow__viewport') as HTMLElement | null;
    if (!viewport || nodes.length === 0) return;
    // 导出干净的图：不带选中高亮和变淡；大图导出期间要把视口外的节点也渲染出来
    setSelectedId(null);
    setExporting(true);
    // React Flow 把还没量过尺寸的节点设成 visibility: hidden（窗口没出帧时测量迟迟不发生），
    // 截出来会是空白；节点的位置和尺寸是我们自己算的，导出期间直接让它可见
    const flow = viewport.closest('.er-flow');
    flow?.classList.add('er-exporting');
    try {
      await nextPaint();
      // 关系线要等节点量完尺寸才会被画出来（表很多时视口外的节点是导出这一刻才渲染的）：
      // 等它们都出现再读路径；窗口没出帧时等不到，就按已经画出来的导出，不卡住
      for (
        let i = 0;
        i < 30 && viewport.querySelectorAll('.react-flow__edge-path').length < edges.length;
        i++
      ) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      // 关系线自己画：快照工具不会把样式表带进 SVG（线的颜色是靠 class 上色的），截出来是不见的。
      // 先把每条线的路径和描边读出来（此刻已取消选中，读到的就是平时的高亮色）
      const edgePaths = [
        ...viewport.querySelectorAll<SVGPathElement>('.react-flow__edge-path'),
      ].map((path) => {
        const cs = getComputedStyle(path);
        return {
          d: path.getAttribute('d') ?? '',
          stroke: cs.stroke,
          width: Number.parseFloat(cs.strokeWidth) || 1,
          opacity: Number.parseFloat(cs.opacity),
          dash: cs.strokeDasharray,
        };
      });
      const b = { ...boundsOf(nodes) };
      // 自引用外键的线伸到表右侧外面，图的范围要把这段也算上，否则最右边的表的自环会被裁掉
      if (edges.some((e) => e.source === e.target)) b.width += SELF_LOOP_REACH;
      const width = Math.ceil(b.width + EXPORT_PADDING * 2);
      const height = Math.ceil(b.height + EXPORT_PADDING * 2);
      const { toSvg } = await import('html-to-image');
      // 字体不内嵌：导出的 SVG 文档本来也加载不到页面字体，省掉一次样式抓取
      const svg = await withTimeout(
        toSvg(viewport, {
          skipFonts: true,
          width,
          height,
          // 关系线那一层不进快照，稍后自己画
          filter: (node: Element) => !node.classList?.contains('react-flow__edges'),
          // 节点层平时带着平移 / 缩放变换；导出时归零，并把整张图的原点挪到左上角
          style: {
            transform: 'none',
            position: 'relative',
            left: `${EXPORT_PADDING - b.x}px`,
            top: `${EXPORT_PADDING - b.y}px`,
          },
        }),
        EXPORT_TIMEOUT_MS
      );
      const image = await withTimeout(loadImage(svg), EXPORT_TIMEOUT_MS);
      const canvas = document.createElement('canvas');
      canvas.width = width * EXPORT_SCALE;
      canvas.height = height * EXPORT_SCALE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas is not available');
      // 用画布自己的底色；拿不到不透明的底色就退回白色
      const background = flow ? getComputedStyle(flow).backgroundColor : '';
      ctx.fillStyle = background && !background.endsWith(', 0)') ? background : '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // 先画关系线、再画节点（节点层的快照底是透明的），和画布里的层叠顺序一致：线压在表下面。
      // 关系线的路径用的是节点层的坐标系：和节点做同样的平移、放大
      ctx.save();
      ctx.scale(EXPORT_SCALE, EXPORT_SCALE);
      ctx.translate(EXPORT_PADDING - b.x, EXPORT_PADDING - b.y);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const edge of edgePaths) {
        if (!edge.d || edge.stroke === 'none') continue;
        ctx.globalAlpha = Number.isFinite(edge.opacity) ? edge.opacity : 1;
        ctx.strokeStyle = edge.stroke;
        ctx.lineWidth = edge.width;
        ctx.setLineDash(
          edge.dash && edge.dash !== 'none'
            ? edge.dash.split(',').map((v) => Number.parseFloat(v))
            : []
        );
        ctx.stroke(new Path2D(edge.d));
      }
      ctx.restore();
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');

      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
      const path = await api.saveExportFileDialog(`er-diagram-${database || 'db'}.png`, 'png');
      if (!path) return;
      await api.writeExportFile(path, base64);
      message.success(t('common.erDiagram.exportSuccess'));
    } catch (err) {
      message.error(`${t('common.erDiagram.exportFailed')}: ${getErrorMessage(err)}`);
    } finally {
      flow?.classList.remove('er-exporting');
      setExporting(false);
    }
  };

  /** 把选中的表及其直接关联的表设为 AI 面板的表结构上下文，并开一段新对话 */
  const askAI = async () => {
    if (!selectedId || !diagram) return;
    const tables = Array.from(
      new Set([selectedId, ...(neighbours.get(selectedId) ?? [])].map(bareTableName))
    );
    const db = database || '';
    // 面板里可能正有回复在流式输出：先让它按「已停止」收尾，再开新对话
    window.dispatchEvent(new CustomEvent('ai-chat-interrupt'));
    await startNewAIChat();
    const store = useAIChatStore.getState();
    store.setConnection(connectionId);
    store.setSelectedDatabases(db ? [db] : []);
    if (db) store.setDatabaseTables(db, tables);
    // 面板打开时会跟随连接树的选中项；这里保住刚指定的表选择
    store.setContextSyncHold(Date.now() + 1500);
    store.setPanelVisible(true);
  };

  const selectedTable = diagram?.tables.find((tbl) => tbl.id === selectedId) ?? null;
  const tableCount = diagram?.tables.length ?? 0;
  const edgeCount = validEdges.length;
  const busy = loading || !!error;

  return (
    <div className="er-diagram" data-testid="er-diagram">
      <div className="er-toolbar">
        <span className="er-toolbar-title">
          {t('common.erDiagram.title')}
          <span className="er-toolbar-db"> · {database || connectionId}</span>
        </span>
        {diagram && (
          <span className="er-toolbar-stats">
            {tableCount} {t('common.erDiagram.tableCount')} · {edgeCount}{' '}
            {t('common.erDiagram.relationshipCount')}
          </span>
        )}
        {diagram?.slow_path && (
          <Tooltip title={diagram.warnings?.length ? diagram.warnings.join('\n') : undefined}>
            <span className="er-toolbar-slow">{t('common.erDiagram.slowPath')}</span>
          </Tooltip>
        )}
        <Select
          className="er-search"
          showSearch
          allowClear
          placeholder={t('common.erDiagram.searchTables')}
          optionFilterProp="label"
          value={selectedId ?? undefined}
          options={(diagram?.tables ?? []).map((tbl) => ({
            value: tbl.id,
            label: tbl.schema ? `${tbl.schema}.${tbl.name}` : tbl.name,
          }))}
          onChange={(id: string | undefined) => (id ? locateTable(id) : setSelectedId(null))}
          disabled={busy}
        />
        <Checkbox
          checked={compact}
          onChange={(e) => toggleCompact(e.target.checked)}
          disabled={busy}
        >
          {t('common.erDiagram.keysOnly')}
        </Checkbox>
        <span className="er-toolbar-spacer" />
        {selectedTable && (
          <span className="er-selection" data-testid="er-selection">
            <span className="er-selection-name">{selectedTable.name}</span>
            {onOpenTable && (
              <Button size="small" onClick={() => onOpenTable(bareTableName(selectedTable.id))}>
                {t('common.erDiagram.openTable')}
              </Button>
            )}
            <Button
              size="small"
              type="primary"
              icon={<RobotOutlined />}
              onClick={() => void askAI()}
              data-testid="er-ask-ai"
            >
              {t('common.erDiagram.askAI')}
            </Button>
          </span>
        )}
        <Tooltip title={t('common.erDiagram.showAll')}>
          <Button
            size="small"
            icon={<ApartmentOutlined />}
            onClick={() => fitAll(instanceRef.current)}
            disabled={busy}
            data-testid="er-fit"
          />
        </Tooltip>
        <Tooltip title={t('common.erDiagram.reload')}>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={reload}
            disabled={loading}
            data-testid="er-reload"
          />
        </Tooltip>
        <Tooltip title={t('common.erDiagram.exportPNG')}>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            loading={exporting}
            onClick={() => void exportPng()}
            disabled={busy || tableCount === 0}
            data-testid="er-export"
          />
        </Tooltip>
      </div>
      <div className="er-canvas" ref={canvasRef}>
        {loading && !diagram && (
          <div className="er-state" data-testid="er-loading">
            <Spin size="small" />
            {t('common.erDiagram.loading')}
          </div>
        )}
        {!loading && error && (
          <div className="er-state" data-testid="er-error">
            <div>{t('common.erDiagram.loadFailed')}</div>
            <div className="er-state-detail">{error}</div>
            <Button size="small" onClick={reload}>
              {t('common.erDiagram.reload')}
            </Button>
          </div>
        )}
        {!loading && !error && diagram && tableCount === 0 && (
          <div className="er-state" data-testid="er-empty">
            {t('common.erDiagram.empty')}
          </div>
        )}
        {!error && diagram && tableCount > 0 && (
          <>
            <ReactFlow
              className="er-flow"
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onNodesChange={onNodesChange}
              onInit={(instance) => {
                instanceRef.current = instance;
              }}
              onNodeClick={(_, node) => setSelectedId(node.id)}
              onNodeDoubleClick={(_, node) => onOpenTable?.(bareTableName(node.id))}
              onPaneClick={() => setSelectedId(null)}
              onEdgeClick={(_, edge) => setSelectedId(String(edge.source))}
              nodesConnectable={false}
              // 自引用外键的两端都落在右侧的 source 连接点上；strict 模式下线的目标端必须是
              // target 连接点，否则整条线被静默丢弃。图上不提供手动连线，用 loose 没有副作用
              connectionMode={ConnectionMode.Loose}
              // 选中状态由本组件的 selectedId 决定，不让 React Flow 在内部再记一份
              elementsSelectable={false}
              deleteKeyCode={null}
              selectionKeyCode={null}
              multiSelectionKeyCode={null}
              // 表很多时只渲染视口内的节点，几百张表也不卡
              onlyRenderVisibleElements={tableCount > 200 && !exporting}
              minZoom={0.08}
              maxZoom={2}
            >
              <Background gap={24} size={1} />
              {tableCount > 12 && <MiniMap pannable zoomable position="bottom-left" />}
              {/* 放右上：右下角是 React Flow 的署名，底部中间是操作提示 */}
              <Controls position="top-right" showInteractive={false} />
            </ReactFlow>
            <div className="er-hint">{t('common.erDiagram.hint')}</div>
          </>
        )}
      </div>
    </div>
  );
}

export function ERDiagram(props: ERDiagramProps) {
  return (
    <ReactFlowProvider>
      <ERDiagramCanvas {...props} />
    </ReactFlowProvider>
  );
}
