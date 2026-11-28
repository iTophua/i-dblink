import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { App, Button, Space, Tag, Tooltip, Spin } from 'antd';
import {
  CopyOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { api } from '../api';
import type { RoutineKind, SequenceInfo } from '../types/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import { GlobalInput } from './GlobalInput';
import { EnhancedEmptyState } from './LoadingStates';
import { RoutineDetailSidebar } from './RoutineDetailSidebar';
import { RoutineKindIcon } from './RoutineKindIcon';
import {
  ROUTINE_COUNT_KEY,
  ROUTINE_EMPTY_KEY,
  ROUTINE_TAG_STYLE,
  toRoutineItem,
  type RoutineItem,
} from './routineMeta';

export interface RoutineListProps {
  connectionId: string;
  database?: string;
  kind: RoutineKind;
}

const SHOW_DETAIL_STORAGE_KEY = 'routinelist-show-detail';

/** 详情侧栏默认关着（和表列表一致）；右上角的按钮开过或关过之后记住这个选择 */
function getInitialShowDetail(): boolean {
  try {
    return localStorage.getItem(SHOW_DETAIL_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** 每一类取列表的接口 */
const FETCHERS: Record<
  RoutineKind,
  (connectionId: string, database?: string) => Promise<unknown[]>
> = {
  procedure: (connectionId, database) => api.getProcedures(connectionId, database),
  function: (connectionId, database) => api.getFunctions(connectionId, database),
  trigger: (connectionId, database) => api.getTriggers(connectionId, database),
  sequence: (connectionId, database) => api.getSequences(connectionId, database),
};

interface Column {
  key: string;
  label: string;
  /** grid 轨道：固定宽度，或能收缩的区间 */
  width: string;
  /** 这一列最窄多少像素：列多、窗口窄时按各列的最窄值给横向滚动 */
  min: number;
  align?: 'left' | 'right' | 'center';
}

const COLUMN_GAP = 6;
const CELL_PADDING_X = 24;

/**
 * 列随类型变：过程 / 函数只有名字，触发器带所在的表和事件，序列带属性。
 * 属性列写成可收缩的区间：详情侧栏开着时列表只有 700px 左右，写死宽度会把右边的列挤出去
 */
function columnsFor(kind: RoutineKind, t: TFunction): Column[] {
  const name: Column = {
    key: 'name',
    label: t('common.name'),
    width: 'minmax(180px, 1fr)',
    min: 180,
  };
  switch (kind) {
    case 'trigger':
      return [
        { ...name, width: 'minmax(180px, 2fr)' },
        {
          key: 'table',
          label: t('common.routineList.table'),
          width: 'minmax(140px, 3fr)',
          min: 140,
        },
        { key: 'timing', label: t('common.routineList.timing'), width: '84px', min: 84 },
        { key: 'event', label: t('common.routineList.event'), width: '88px', min: 88 },
      ];
    case 'sequence':
      return [
        name,
        { key: 'data_type', label: t('common.dataType'), width: 'minmax(64px, 96px)', min: 64 },
        {
          key: 'increment',
          label: t('common.routineList.increment'),
          width: 'minmax(48px, 60px)',
          min: 48,
          align: 'right',
        },
        {
          key: 'start_value',
          label: t('common.routineList.startValue'),
          width: 'minmax(64px, 92px)',
          min: 64,
          align: 'right',
        },
        {
          key: 'minimum_value',
          label: t('common.routineList.minValue'),
          width: 'minmax(64px, 92px)',
          min: 64,
          align: 'right',
        },
        {
          key: 'maximum_value',
          label: t('common.routineList.maxValue'),
          // PG 的 bigint 序列上限是 19 位数，列窄于它就会被截断
          width: 'minmax(136px, 148px)',
          min: 136,
          align: 'right',
        },
        {
          key: 'cycle_option',
          label: t('common.routineList.cycle'),
          width: 'minmax(44px, 56px)',
          min: 44,
          align: 'center',
        },
      ];
    default:
      return [name];
  }
}

/** 表头和行共用的网格设置 */
const gridTemplate = (columns: Column[]): React.CSSProperties => ({
  display: 'grid',
  gridTemplateColumns: columns.map((c) => c.width).join(' '),
  columnGap: COLUMN_GAP,
  alignItems: 'center',
});

/** 各列都收到最窄时的整行宽度（含两侧留白）：比这还窄就出横向滚动，不再挤压列 */
const gridMinWidth = (columns: Column[]) =>
  columns.reduce((total, c) => total + c.min, 0) +
  COLUMN_GAP * (columns.length - 1) +
  CELL_PADDING_X;

const ellipsis: React.CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  WebkitUserSelect: 'none',
};

function Cell({ kind, item, column }: { kind: RoutineKind; item: RoutineItem; column: Column }) {
  switch (column.key) {
    case 'name':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <RoutineKindIcon kind={kind} />
          <span
            title={item.name}
            style={{ ...ellipsis, fontSize: 13, fontFamily: 'var(--font-family-code)' }}
          >
            {item.name}
          </span>
        </div>
      );
    case 'table':
    case 'timing':
    case 'event': {
      const value = item[column.key as 'table' | 'timing' | 'event'];
      return (
        <span title={value} style={{ ...ellipsis, fontSize: 12, color: 'var(--text-tertiary)' }}>
          {value || '-'}
        </span>
      );
    }
    default: {
      // 序列的属性列：列名就是后端的字段名。省略号要加在块级的格子本身上，加在里面的 span 上不生效
      const value = item.sequence?.[column.key as keyof SequenceInfo];
      const isNumeric = column.align === 'right';
      return (
        <div
          title={value}
          style={{
            ...ellipsis,
            textAlign: column.align ?? 'left',
            fontSize: isNumeric ? 12 : 11,
            color: isNumeric ? 'var(--text-tertiary)' : 'var(--text-secondary)',
          }}
        >
          {value || '-'}
        </div>
      );
    }
  }
}

const RoutineRow = React.memo(function RoutineRow({
  kind,
  item,
  columns,
  selected,
  onClick,
  onDoubleClick,
}: {
  kind: RoutineKind;
  item: RoutineItem;
  columns: Column[];
  selected: boolean;
  onClick: () => void;
  onDoubleClick: () => void;
}) {
  return (
    <div
      data-routine-name={item.name}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`hoverable${selected ? ' is-selected' : ''}`}
      style={{
        ...gridTemplate(columns),
        padding: '6px 12px',
        borderBottom: '1px solid var(--border)',
        background: selected ? 'var(--row-selected-bg)' : 'transparent',
      }}
    >
      {columns.map((column) => (
        <Cell key={column.key} kind={kind} item={item} column={column} />
      ))}
    </div>
  );
});

const centered: React.CSSProperties = {
  height: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

function RoutineListInner({ connectionId, database, kind }: RoutineListProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  // null = 还在取
  const [result, setResult] = useState<{ items: RoutineItem[]; error: string } | null>(null);
  const [reloadCount, setReloadCount] = useState(0);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<{ name: string; table?: string } | null>(null);
  const [showDetail, setShowDetail] = useState(getInitialShowDetail);
  const [detailWidth, setDetailWidth] = useState(400);

  useEffect(() => {
    let cancelled = false;
    FETCHERS[kind](connectionId, database).then(
      (raw) => {
        if (cancelled) return;
        const items = (raw ?? [])
          .map(toRoutineItem)
          .filter((item): item is RoutineItem => item !== null);
        setResult({ items, error: '' });
      },
      (err: unknown) => {
        if (!cancelled) setResult({ items: [], error: getErrorMessage(err) });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [connectionId, database, kind, reloadCount]);

  const columns = useMemo(() => columnsFor(kind, t), [kind, t]);
  const items = useMemo(() => result?.items ?? [], [result]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) => item.name.toLowerCase().includes(q) || (item.table ?? '').toLowerCase().includes(q)
    );
  }, [items, search]);
  // 刷新后按名字找回原来选的那一项（列表顺序可能变了）
  const selectedItem =
    (selected &&
      items.find((item) => item.name === selected.name && item.table === selected.table)) ||
    null;

  const reload = () => {
    setResult(null);
    setReloadCount((n) => n + 1);
  };

  const handleCopy = useCallback(
    (value: string) => {
      navigator.clipboard.writeText(value).then(() => {
        message.success(t('common.copied'));
      });
    },
    [message, t]
  );

  /** 点右上角的按钮：开关详情侧栏，并记住这个选择（双击某一行打开的不记） */
  const toggleDetail = () => {
    const next = !showDetail;
    setShowDetail(next);
    try {
      localStorage.setItem(SHOW_DETAIL_STORAGE_KEY, String(next));
    } catch {
      // 存不进去（隐私模式等）就只在这次生效
    }
  };

  return (
    <div
      data-testid="routine-list"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--background-card)',
        overflow: 'hidden',
        minHeight: 0,
        height: '100%',
      }}
    >
      <div
        className="tablelist-toolbar"
        style={{
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          padding: '8px 12px',
          background: 'var(--background-card)',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Space size="small">
          <Tooltip
            title={t('common.routineList.copyName')}
            open={!selectedItem ? false : undefined}
          >
            <span>
              <Button
                icon={<CopyOutlined />}
                size="small"
                disabled={!selectedItem}
                onClick={() => selectedItem && handleCopy(selectedItem.name)}
              />
            </span>
          </Tooltip>
          <Tooltip title={t('common.refresh')}>
            <span>
              <Button icon={<ReloadOutlined />} size="small" loading={!result} onClick={reload} />
            </span>
          </Tooltip>
        </Space>

        <GlobalInput
          placeholder={t('common.routineList.search')}
          prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
          size="small"
          style={{ width: 180, marginLeft: 'auto' }}
        />

        <Space size="small">
          <Tag
            style={{
              margin: 0,
              padding: '0 7px',
              display: 'inline-flex',
              alignItems: 'center',
              ...ROUTINE_TAG_STYLE[kind],
            }}
          >
            {t(ROUTINE_COUNT_KEY[kind], { count: items.length })}
          </Tag>
          <Tooltip title={showDetail ? t('common.hideDetail') : t('common.showDetail')}>
            <span>
              <Button
                icon={<InfoCircleOutlined />}
                size="small"
                type={showDetail ? 'primary' : 'text'}
                onClick={toggleDetail}
              />
            </span>
          </Tooltip>
        </Space>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            overflow: 'auto',
          }}
        >
          {result && filtered.length > 0 && (
            <div
              style={{
                ...gridTemplate(columns),
                // 表头和行在同一个滚动容器里：吸顶，横向跟着行一起滚，列多、窗口窄时右边的列
                // 不会被裁掉。这个容器不能加 contain / content-visibility（WKWebView 下吸顶会错位）
                position: 'sticky',
                top: 0,
                zIndex: 1,
                minWidth: gridMinWidth(columns),
                padding: '6px 12px',
                background: 'var(--header-bg)',
                borderBottom: '1px solid var(--border)',
                fontWeight: 500,
                fontSize: 13,
                color: 'var(--text-tertiary)',
              }}
            >
              {columns.map((column) => (
                <span
                  key={column.key}
                  style={{ textAlign: column.align ?? 'left', userSelect: 'none' }}
                >
                  {column.label}
                </span>
              ))}
            </div>
          )}
          {!result ? (
            <div style={{ ...centered, flexDirection: 'column' }}>
              <Spin size="large" />
              <div style={{ marginTop: 12, fontSize: 13, color: 'var(--text-tertiary)' }}>
                {t('common.loading')}
              </div>
            </div>
          ) : result.error ? (
            <div style={centered}>
              <EnhancedEmptyState
                icon={<RoutineKindIcon kind={kind} />}
                title={t('common.loadFailed')}
                description={result.error}
                secondaryAction={{
                  label: t('common.refresh'),
                  onClick: reload,
                  icon: <ReloadOutlined />,
                }}
              />
            </div>
          ) : items.length === 0 ? (
            <div style={centered}>
              <EnhancedEmptyState
                icon={<RoutineKindIcon kind={kind} />}
                title={t(ROUTINE_EMPTY_KEY[kind])}
                secondaryAction={{
                  label: t('common.refresh'),
                  onClick: reload,
                  icon: <ReloadOutlined />,
                }}
              />
            </div>
          ) : filtered.length === 0 ? (
            <div style={centered}>
              <EnhancedEmptyState
                icon={<SearchOutlined />}
                title={t('common.routineList.noMatching')}
              />
            </div>
          ) : (
            <div style={{ minWidth: gridMinWidth(columns) }}>
              {filtered.map((item) => (
                <RoutineRow
                  key={`${item.name}|${item.table ?? ''}`}
                  kind={kind}
                  item={item}
                  columns={columns}
                  selected={item === selectedItem}
                  onClick={() => setSelected({ name: item.name, table: item.table })}
                  // 侧栏关着时单击只是选中，双击才打开这一项的定义
                  onDoubleClick={() => {
                    setSelected({ name: item.name, table: item.table });
                    setShowDetail(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>
        {showDetail && (
          <RoutineDetailSidebar
            key={`${kind}|${selectedItem?.name ?? ''}|${selectedItem?.table ?? ''}`}
            connectionId={connectionId}
            database={database}
            kind={kind}
            item={selectedItem}
            width={detailWidth}
            onWidthChange={setDetailWidth}
          />
        )}
      </div>
    </div>
  );
}

/**
 * 对象页里的过程 / 函数 / 触发器 / 序列列表。换了连接、库或类型就是另一张列表：
 * 用 key 让状态整个重来，请求只在挂载和点刷新时发
 */
export function RoutineList(props: RoutineListProps) {
  return (
    <RoutineListInner
      key={`${props.connectionId}|${props.database ?? ''}|${props.kind}`}
      {...props}
    />
  );
}
