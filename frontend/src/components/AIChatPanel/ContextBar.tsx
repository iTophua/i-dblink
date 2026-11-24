import { memo, useEffect, useReducer, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, Checkbox, Input, Popover, Select, Tooltip } from 'antd';
import {
  CaretRightOutlined,
  DatabaseOutlined,
  DownOutlined,
  SearchOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { Connection } from '../../stores/appStore';
import { useAIChatStore } from '../../stores/aiChatStore';
import {
  estimateTokens,
  loadAllColumns,
  peekAllColumns,
  pickTables,
  SCHEMA_WARN_CHARS,
  summarizeSchema,
  toggleTable,
} from '../../utils/aiChat';
import { DatabaseIcon } from '../DatabaseIcon';

/** 表列表超过该数量时只渲染前一部分，其余用搜索定位 */
const MAX_RENDERED_TABLES = 300;

interface DatabaseRowProps {
  connectionId: string;
  db: string;
  selected: boolean;
  /** 表级筛选；undefined 表示整库 */
  filter?: string[];
  expanded: boolean;
  /** 搜索词（已转小写），非空时只列出匹配的表 */
  query: string;
  onToggleExpand: (db: string) => void;
  onToggleDatabase: (db: string, checked: boolean) => void;
  onToggleTable: (db: string, table: string) => void;
}

/** 上下文弹层里的一个库：库级勾选 + 展开后的表级勾选 */
const DatabaseRow = memo(function DatabaseRow({
  connectionId,
  db,
  selected,
  filter,
  expanded,
  query,
  onToggleExpand,
  onToggleDatabase,
  onToggleTable,
}: DatabaseRowProps) {
  const { t } = useTranslation();
  const searching = query.length > 0;
  // 搜索态、展开态、已勾选（要显示张数）时才需要列表；其余情况不读缓存也不发请求
  const needTables = searching || expanded || selected;
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const hit = needTables ? peekAllColumns(connectionId, db) : null;
  // 已有未过期的缓存就不用再读
  const fresh = !!hit && !hit.stale;
  useEffect(() => {
    if (!needTables || fresh) return;
    let alive = true;
    loadAllColumns(connectionId, db).then(
      () => {
        if (!alive) return;
        setErrorKey(null);
        bump();
      },
      () => alive && setErrorKey(db)
    );
    return () => {
      alive = false;
    };
  }, [connectionId, db, needTables, fresh, tick]);

  const all = hit ? Object.keys(hit.tables) : [];
  const sorted = pickTables(all);
  const effective = selected ? pickTables(all, filter) : [];
  const effectiveSet = new Set(effective);
  // 搜索态只列匹配项；否则只在展开时列前一部分
  const shown = searching
    ? sorted.filter((name) => name.includes(query))
    : expanded
      ? sorted.slice(0, MAX_RENDERED_TABLES)
      : [];
  if (searching && hit && shown.length === 0) return null;

  let meta: ReactNode = null;
  if (needTables) {
    if (errorKey === db) {
      meta = (
        <button
          type="button"
          className="ai-ctx-retry"
          onClick={(e) => {
            e.stopPropagation();
            setErrorKey(null);
            setTick((n) => n + 1);
          }}
        >
          {t('common.aiChat.loadFailedRetry')}
        </button>
      );
    } else if (!hit) {
      meta = t('common.aiChat.loading');
    } else if (selected) {
      meta = filter ? `${effective.length} / ${all.length}` : t('common.aiChat.allTables');
    } else {
      meta = t('common.aiChat.tableCount', { n: all.length });
    }
  }

  return (
    <div className={`ai-ctx-db${shown.length > 0 ? ' is-open' : ''}`}>
      <div className="ai-ctx-db-head">
        <Checkbox
          checked={selected && !filter}
          indeterminate={selected && !!filter}
          aria-label={db}
          onChange={(e) => onToggleDatabase(db, e.target.checked)}
        />
        <button
          type="button"
          className="ai-ctx-db-name"
          disabled={searching}
          aria-expanded={shown.length > 0}
          onClick={() => onToggleExpand(db)}
        >
          {!searching && <CaretRightOutlined className="ai-ctx-caret" />}
          <span className="ai-ctx-db-text">{db}</span>
        </button>
        <span className="ai-ctx-db-meta">{meta}</span>
      </div>
      {shown.length > 0 && (
        <div className="ai-ctx-tables">
          {shown.map((table) => (
            <label key={table} className="ai-ctx-table">
              <Checkbox
                checked={effectiveSet.has(table)}
                onChange={() => onToggleTable(db, table)}
              />
              <span className="ai-ctx-table-name">{table}</span>
            </label>
          ))}
          {!searching && sorted.length > MAX_RENDERED_TABLES && (
            <div className="ai-ctx-more">
              {t('common.aiChat.moreTables', { n: sorted.length - MAX_RENDERED_TABLES })}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

interface ContextPickerProps {
  connections: Connection[];
  connectionId: string;
  availableDatabases: string[];
  onSelectConnection: (id: string) => void;
}

/** 上下文弹层内容：选连接 → 勾选库（可下钻到表、可搜索） */
function ContextPicker({
  connections,
  connectionId,
  availableDatabases,
  onSelectConnection,
}: ContextPickerProps) {
  const { t } = useTranslation();
  const selectedDatabases = useAIChatStore((s) => s.selectedDatabases);
  const selectedTables = useAIChatStore((s) => s.selectedTables);
  const [query, setQuery] = useState('');
  // 做过表级筛选的库默认展开，让人一眼看到当前只选了哪几张
  const [expanded, setExpanded] = useState<string[]>(() =>
    Object.keys(useAIChatStore.getState().selectedTables)
  );
  const q = query.trim().toLowerCase();

  const handleToggleDatabase = (db: string, checked: boolean) => {
    const {
      selectedDatabases: dbs,
      setSelectedDatabases,
      setDatabaseTables,
    } = useAIChatStore.getState();
    setSelectedDatabases(checked ? [...dbs, db] : dbs.filter((d) => d !== db));
    setDatabaseTables(db, null);
  };

  const handleToggleTable = (db: string, table: string) => {
    const {
      selectedDatabases: dbs,
      selectedTables: filters,
      setSelectedDatabases,
      setDatabaseTables,
    } = useAIChatStore.getState();
    if (!dbs.includes(db)) {
      setSelectedDatabases([...dbs, db]);
      setDatabaseTables(db, [table]);
      return;
    }
    const hit = peekAllColumns(connectionId, db);
    const next = toggleTable(hit ? Object.keys(hit.tables) : [], filters[db], table);
    if (next === null) setDatabaseTables(db, null);
    else if (next.length === 0) setSelectedDatabases(dbs.filter((d) => d !== db));
    else setDatabaseTables(db, next);
  };

  const selectAll = () => {
    const { setSelectedDatabases, selectedTables: filters } = useAIChatStore.getState();
    setSelectedDatabases(availableDatabases);
    Object.keys(filters).forEach((db) => useAIChatStore.getState().setDatabaseTables(db, null));
  };

  const selectNone = () => useAIChatStore.getState().setSelectedDatabases([]);

  const summary = summarizeSchema(connectionId, selectedDatabases, selectedTables);
  const tooLarge = summary.complete && summary.chars > SCHEMA_WARN_CHARS;
  const tokens = estimateTokens(summary.chars);

  return (
    <div className="ai-ctx-panel" data-testid="ai-context-picker">
      <div className="ai-ctx-head">
        <span className="ai-ctx-title">{t('common.aiChat.context')}</span>
        <span className="ai-ctx-sub">{t('common.aiChat.contextHint')}</span>
      </div>
      <Select
        showSearch
        size="small"
        style={{ width: '100%' }}
        popupMatchSelectWidth={false}
        value={connectionId}
        placeholder={t('common.aiChat.selectConnection')}
        onChange={onSelectConnection}
        options={connections.map((c) => ({
          value: c.id,
          search: `${c.name} ${c.db_type}`.toLowerCase(),
          label: (
            <span className="ai-ctx-conn-option">
              <DatabaseIcon type={c.db_type} size={14} />
              <span className="ai-ctx-conn-name">{c.name}</span>
              <span className="ai-ctx-conn-type">{c.db_type.toUpperCase()}</span>
            </span>
          ),
        }))}
        filterOption={(input, option) =>
          String(option?.search ?? '').includes(input.trim().toLowerCase())
        }
        aria-label={t('common.aiChat.selectConnection')}
      />
      {availableDatabases.length === 0 ? (
        <div className="ai-ctx-empty">{t('common.aiChat.noDatabasesLoaded')}</div>
      ) : (
        <>
          <Input
            size="small"
            allowClear
            prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
            placeholder={t('common.aiChat.searchTables')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('common.aiChat.searchTables')}
          />
          <div className="ai-ctx-list">
            {availableDatabases.map((db) => (
              <DatabaseRow
                key={db}
                connectionId={connectionId}
                db={db}
                selected={selectedDatabases.includes(db)}
                filter={selectedTables[db]}
                expanded={expanded.includes(db)}
                query={q}
                onToggleExpand={(name) =>
                  setExpanded((prev) =>
                    prev.includes(name) ? prev.filter((d) => d !== name) : [...prev, name]
                  )
                }
                onToggleDatabase={handleToggleDatabase}
                onToggleTable={handleToggleTable}
              />
            ))}
          </div>
          <div className="ai-ctx-foot">
            <div className="ai-ctx-foot-actions">
              <Button size="small" type="link" onClick={selectAll}>
                {t('common.aiChat.selectAll')}
              </Button>
              <Button size="small" type="link" onClick={selectNone}>
                {t('common.aiChat.selectNone')}
              </Button>
            </div>
            <span className="ai-ctx-summary" data-testid="ai-context-summary">
              {selectedDatabases.length === 0
                ? t('common.aiChat.noDatabaseSelected')
                : summary.complete
                  ? t('common.aiChat.contextSummary', {
                      dbs: selectedDatabases.length,
                      tables: summary.tableCount,
                    })
                  : t('common.aiChat.contextSummaryLoading', { dbs: selectedDatabases.length })}
              {summary.complete && tokens >= 1000
                ? ` · ${t('common.aiChat.tokensEstimate', { n: (tokens / 1000).toFixed(1) })}`
                : ''}
            </span>
          </div>
          {tooLarge && (
            <div className="ai-ctx-warn" data-testid="ai-context-large">
              <WarningOutlined /> {t('common.aiChat.contextLarge')}
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface ContextBarProps {
  connections: Connection[];
  connectionId: string | null;
  /** 该连接已加载（可在连接树里展开过）的库 */
  availableDatabases: string[];
  onSelectConnection: (id: string) => void;
}

/** 面板顶部的上下文条：一枚胶囊显示当前连接与所选范围，点开弹层调整 */
export function ContextBar({
  connections,
  connectionId,
  availableDatabases,
  onSelectConnection,
}: ContextBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selectedDatabases = useAIChatStore((s) => s.selectedDatabases);
  const selectedTables = useAIChatStore((s) => s.selectedTables);
  const [, bump] = useReducer((n: number) => n + 1, 0);

  // 已勾选的库在后台读一次列信息，用来显示张数与体积（结果缓存，发送时直接复用）
  useEffect(() => {
    if (!connectionId) return;
    let alive = true;
    selectedDatabases.forEach((db) => {
      const hit = peekAllColumns(connectionId, db);
      if (hit && !hit.stale) return;
      loadAllColumns(connectionId, db).then(
        () => alive && bump(),
        () => alive && bump()
      );
    });
    return () => {
      alive = false;
    };
  }, [connectionId, selectedDatabases]);

  const conn = connections.find((c) => c.id === connectionId);
  const summary = summarizeSchema(connectionId, selectedDatabases, selectedTables);
  const tooLarge = summary.complete && summary.chars > SCHEMA_WARN_CHARS;

  let meta = '';
  if (conn) {
    if (selectedDatabases.length === 0) {
      meta = t('common.aiChat.noDatabaseSelected');
    } else if (summary.complete) {
      const tokens = estimateTokens(summary.chars);
      meta =
        `${t('common.aiChat.databaseCount', { n: selectedDatabases.length })} · ${t('common.aiChat.tableCount', { n: summary.tableCount })}` +
        (tokens >= 1000
          ? ` · ${t('common.aiChat.tokensEstimate', { n: (tokens / 1000).toFixed(1) })}`
          : '');
    } else {
      meta = t('common.aiChat.contextSummaryLoading', { dbs: selectedDatabases.length });
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomLeft"
      arrow={false}
      overlayClassName="ai-context-popover"
      content={
        // 换连接即重挂载：搜索词与展开状态自然归零
        <ContextPicker
          key={connectionId ?? ''}
          connections={connections}
          connectionId={connectionId ?? ''}
          availableDatabases={availableDatabases}
          onSelectConnection={onSelectConnection}
        />
      }
    >
      <div className="ai-context-bar">
        <button
          type="button"
          className={`ai-context-pill${open ? ' is-open' : ''}${conn ? '' : ' is-empty'}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          data-testid="ai-context-pill"
        >
          <span className="ai-context-pill-icon">
            {conn ? <DatabaseIcon type={conn.db_type} size={16} /> : <DatabaseOutlined />}
          </span>
          <span className="ai-context-pill-name">
            {conn ? conn.name : t('common.aiChat.addContext')}
          </span>
          {conn && (
            <span
              className={`ai-context-pill-meta${selectedDatabases.length === 0 || tooLarge ? ' is-warn' : ''}`}
            >
              {meta}
            </span>
          )}
          {tooLarge ? (
            <Tooltip title={t('common.aiChat.contextLarge')}>
              <WarningOutlined className="ai-context-pill-warn" />
            </Tooltip>
          ) : (
            <DownOutlined className="ai-context-pill-caret" />
          )}
        </button>
      </div>
    </Popover>
  );
}
