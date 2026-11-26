/**
 * 数据对比与同步：按主键比对源表与目标表，列出差异，并生成把目标表同步成源表的 SQL。
 *
 * 比对和生成都由后端完成；本弹窗不执行任何写操作——脚本只供审阅，
 * 由用户决定复制、保存，或放进目标库的 SQL 标签页里自己执行。
 */
import { useRef, useState } from 'react';
import {
  Alert,
  App,
  Button,
  Input,
  InputNumber,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CodeOutlined, CopyOutlined, DownloadOutlined, SwapOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../../api';
import type {
  DataCompareCell,
  DataCompareModified,
  DataCompareRequest,
  DataCompareResult,
  DataCompareRow,
} from '../../types/api';
import type { Connection } from '../../stores/appStore';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { SidePicker } from './SidePicker';
import type { SideSelection } from './SidePicker';
import { buildCompareRequest, cellText } from './helpers';
import './data-compare.css';

const DEFAULT_MAX_ROWS = 100000;
const DEFAULT_MAX_STATEMENTS = 2000;
/** 明细在界面里每页显示的条数（后端每类最多回传 500 条） */
const PAGE_SIZE = 20;

type DetailTab = 'modified' | 'sourceOnly' | 'targetOnly';

export interface DataCompareDialogProps {
  open: boolean;
  onClose: () => void;
  /** 打开时预填的源库（从连接树的库节点右键进入时带过来） */
  preset?: { connectionId: string; database?: string } | null;
  connections: Connection[];
  /** 在目标库的 SQL 标签页里打开同步脚本 */
  onOpenSql?: (connectionId: string, database: string | undefined, sql: string) => void;
}

function keyColumns<Row extends { key: Record<string, DataCompareCell> }>(
  columns: string[]
): ColumnsType<Row> {
  return columns.map((name) => ({
    title: name,
    dataIndex: ['key', name],
    width: 140,
    render: (cell: DataCompareCell | undefined) => cellText(cell),
  }));
}

interface ResultViewProps {
  result: DataCompareResult;
  tab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onViewSql: () => void;
}

function ChangeList({ row }: { row: DataCompareModified }) {
  return (
    <ul className="dc-changes">
      {row.changes.map((change) => (
        <li key={change.column}>
          <code className="dc-col">{change.column}</code>
          <span className="dc-old">{cellText(change.target)}</span>
          <span className="dc-arrow">→</span>
          <span className="dc-new">{cellText(change.source)}</span>
        </li>
      ))}
    </ul>
  );
}

function ResultView({ result, tab, onTabChange, onViewSql }: ResultViewProps) {
  const { t } = useTranslation();
  const totalDiff = result.modified_count + result.source_only_count + result.target_only_count;

  const tiles: Array<{ key: DetailTab | 'same'; tone: string; count: number }> = [
    { key: 'same', tone: 'success', count: result.same_count },
    { key: 'modified', tone: 'warning', count: result.modified_count },
    { key: 'sourceOnly', tone: 'info', count: result.source_only_count },
    { key: 'targetOnly', tone: 'danger', count: result.target_only_count },
  ];

  const modifiedColumns: ColumnsType<DataCompareModified> = [
    ...keyColumns<DataCompareModified>(result.key_columns),
    {
      title: t('common.dataCompare.changes'),
      key: 'changes',
      render: (_: unknown, row: DataCompareModified) => <ChangeList row={row} />,
    },
  ];
  const sourceOnlyColumns: ColumnsType<DataCompareRow> = [
    ...keyColumns(result.key_columns),
    ...result.compare_columns.map((name) => ({
      title: name,
      dataIndex: ['row', name],
      width: 140,
      ellipsis: true,
      render: (cell: DataCompareCell | undefined) => cellText(cell),
    })),
  ];
  const targetOnlyColumns: ColumnsType<DataCompareRow> = keyColumns<DataCompareRow>(
    result.key_columns
  );

  const detailLimited =
    result.modified.length < result.modified_count ||
    result.source_only.length < result.source_only_count ||
    result.target_only.length < result.target_only_count;

  return (
    <div className="dc-result" data-testid="dc-result">
      <div className="dc-tiles">
        {tiles.map((tile) => (
          <button
            key={tile.key}
            type="button"
            className={`dc-tile is-${tile.tone}${tab === tile.key ? ' is-active' : ''}`}
            onClick={() => tile.key !== 'same' && onTabChange(tile.key)}
            disabled={tile.key === 'same'}
            data-testid={`dc-tile-${tile.key}`}
          >
            <span className="dc-tile-count">{tile.count}</span>
            <span className="dc-tile-label">{t(`common.dataCompare.${tile.key}`)}</span>
          </button>
        ))}
      </div>

      <div className="dc-meta">
        {t('common.dataCompare.rowsRead', { src: result.source_rows, tgt: result.target_rows })}
        {' · '}
        {t('common.dataCompare.matchKey', { key: result.key_columns.join(', ') })}
      </div>

      {result.truncated && (
        <Alert type="warning" showIcon title={t('common.dataCompare.truncatedWarn')} />
      )}
      {result.source_only_columns.length > 0 && (
        <Alert
          type="info"
          showIcon
          title={t('common.dataCompare.sourceOnlyCols', {
            cols: result.source_only_columns.join(', '),
          })}
        />
      )}
      {result.target_only_columns.length > 0 && (
        <Alert
          type="info"
          showIcon
          title={t('common.dataCompare.targetOnlyCols', {
            cols: result.target_only_columns.join(', '),
          })}
        />
      )}
      {result.warnings.map((warning) => (
        <Alert key={warning} type="warning" showIcon title={warning} />
      ))}

      {totalDiff === 0 ? (
        <div className="dc-identical" data-testid="dc-identical">
          {t('common.dataCompare.identical')}
        </div>
      ) : (
        <>
          <Tabs
            size="small"
            activeKey={tab}
            onChange={(key) => onTabChange(key as DetailTab)}
            items={[
              {
                key: 'modified',
                label: `${t('common.dataCompare.modified')} (${result.modified_count})`,
                children: (
                  <Table<DataCompareModified>
                    size="small"
                    rowKey={(row) => JSON.stringify(row.key)}
                    columns={modifiedColumns}
                    dataSource={result.modified}
                    pagination={{ pageSize: PAGE_SIZE, size: 'small', showSizeChanger: false }}
                    scroll={{ x: 'max-content', y: 260 }}
                  />
                ),
              },
              {
                key: 'sourceOnly',
                label: `${t('common.dataCompare.sourceOnly')} (${result.source_only_count})`,
                children: (
                  <Table<DataCompareRow>
                    size="small"
                    rowKey={(row) => JSON.stringify(row.key)}
                    columns={sourceOnlyColumns}
                    dataSource={result.source_only}
                    pagination={{ pageSize: PAGE_SIZE, size: 'small', showSizeChanger: false }}
                    scroll={{ x: 'max-content', y: 260 }}
                  />
                ),
              },
              {
                key: 'targetOnly',
                label: `${t('common.dataCompare.targetOnly')} (${result.target_only_count})`,
                children: (
                  <Table<DataCompareRow>
                    size="small"
                    rowKey={(row) => JSON.stringify(row.key)}
                    columns={targetOnlyColumns}
                    dataSource={result.target_only}
                    pagination={{ pageSize: PAGE_SIZE, size: 'small', showSizeChanger: false }}
                    scroll={{ y: 260 }}
                  />
                ),
              },
            ]}
          />
          {detailLimited && (
            <div className="dc-hint">{t('common.dataCompare.detailLimit', { n: 500 })}</div>
          )}
          <div className="dc-sql-bar">
            <Space size={4}>
              <Tag>{`UPDATE ${result.sql_counts.update}`}</Tag>
              <Tag>{`INSERT ${result.sql_counts.insert}`}</Tag>
              <Tag>{`DELETE ${result.sql_counts.delete}`}</Tag>
            </Space>
            <Button
              type="primary"
              icon={<CodeOutlined />}
              onClick={onViewSql}
              data-testid="dc-view-sql"
            >
              {t('common.dataCompare.viewSQL')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export function DataCompareDialog({
  open,
  onClose,
  preset,
  connections,
  onOpenSql,
}: DataCompareDialogProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const [source, setSource] = useState<SideSelection>({
    connectionId: preset?.connectionId,
    database: preset?.database,
  });
  const [target, setTarget] = useState<SideSelection>({});
  const [keyColumnsInput, setKeyColumnsInput] = useState('');
  const [maxRows, setMaxRows] = useState<number | null>(DEFAULT_MAX_ROWS);
  const [maxStatements, setMaxStatements] = useState<number | null>(DEFAULT_MAX_STATEMENTS);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DataCompareResult | null>(null);
  /** 当前结果对应的请求：打开 SQL 标签页要知道目标库是谁 */
  const [applied, setApplied] = useState<DataCompareRequest | null>(null);
  const [tab, setTab] = useState<DetailTab>('modified');
  const [sqlOpen, setSqlOpen] = useState(false);

  const pickSource = (next: SideSelection) => {
    setSource(next);
    setResult(null);
    // 目标还没选表时先跟着源：最常见的是同一个连接下不同库里的同名表
    setTarget((prev) => ({
      ...prev,
      connectionId: prev.connectionId ?? next.connectionId,
      table: prev.table ?? next.table,
    }));
  };

  const pickTarget = (next: SideSelection) => {
    setTarget(next);
    setResult(null);
  };

  const swapSides = () => {
    setSource(target);
    setTarget(source);
    setResult(null);
    setSqlOpen(false);
  };

  /** 比对请求的序号 */
  const compareSeqRef = useRef(0);

  const runCompare = async () => {
    const request = buildCompareRequest({
      source,
      target,
      keyColumns: keyColumnsInput,
      maxRows: maxRows ?? DEFAULT_MAX_ROWS,
      maxStatements: maxStatements ?? DEFAULT_MAX_STATEMENTS,
    });
    if (!request) {
      message.warning(t('common.dataCompare.selectSides'));
      return;
    }
    // 比对进行中两侧的选择是锁住的；万一还是换了（比如外部改了预填），晚到的旧结果不能落地：
    // 否则界面上的结果和「在 SQL 标签页中打开」用的目标，对应用户已经改掉的那一组选择
    const seq = ++compareSeqRef.current;
    setComparing(true);
    setError(null);
    try {
      const res = await api.compareTableData(request);
      if (seq !== compareSeqRef.current) return;
      setResult(res);
      setApplied(request);
      setTab(
        res.modified_count > 0
          ? 'modified'
          : res.source_only_count > 0
            ? 'sourceOnly'
            : 'targetOnly'
      );
    } catch (err) {
      if (seq !== compareSeqRef.current) return;
      setResult(null);
      setError(getErrorMessage(err));
    } finally {
      if (seq === compareSeqRef.current) setComparing(false);
    }
  };

  const copySql = async () => {
    if (!result?.sql) return;
    try {
      await navigator.clipboard.writeText(result.sql);
      message.success(t('common.copied'));
    } catch {
      message.error(t('common.copyFailed'));
    }
  };

  const saveSql = async () => {
    if (!result?.sql) return;
    try {
      const path = await api.saveSqlFileDialog('sync.sql');
      if (!path) return;
      await api.writeSqlFile(path, result.sql);
      message.success(t('common.dataCompare.saved'));
    } catch (err) {
      message.error(getErrorMessage(err));
    }
  };

  const openInSqlTab = () => {
    if (!result?.sql || !applied || !onOpenSql) return;
    onOpenSql(applied.target_connection_id, applied.target_database, result.sql);
    setSqlOpen(false);
    onClose();
  };

  const hasSql = !!result?.sql;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={1000}
      destroyOnHidden
      title={t('common.dataCompare.title')}
      // 出结果后内容很长：让内容区在窗口内自己滚动，弹窗本身不超出屏幕
      styles={{ body: { maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' } }}
      data-testid="data-compare-dialog"
    >
      <div className="dc-form">
        <div className="dc-sides">
          <div className="dc-side-col">
            <div className="dc-side-title">{t('common.dataCompare.source')}</div>
            <SidePicker
              connections={connections}
              value={source}
              onChange={pickSource}
              idPrefix="dc-source"
              disabled={comparing}
            />
          </div>
          <div className="dc-swap">
            <Tooltip title={t('common.dataCompare.swap')}>
              <Button
                size="small"
                icon={<SwapOutlined />}
                onClick={swapSides}
                disabled={comparing}
                aria-label={t('common.dataCompare.swap')}
                data-testid="dc-swap"
              />
            </Tooltip>
          </div>
          <div className="dc-side-col">
            <div className="dc-side-title">{t('common.dataCompare.target')}</div>
            <SidePicker
              connections={connections}
              value={target}
              onChange={pickTarget}
              idPrefix="dc-target"
              preferredTable={source.table}
              disabled={comparing}
            />
          </div>
        </div>

        <div className="dc-options">
          <div className="dc-option is-wide">
            <span className="dc-option-label">{t('common.dataCompare.keyColumns')}</span>
            <Input
              value={keyColumnsInput}
              onChange={(e) => {
                setKeyColumnsInput(e.target.value);
                setResult(null);
              }}
              placeholder={t('common.dataCompare.keyColumnsHint')}
              disabled={comparing}
            />
          </div>
          <div className="dc-option">
            <span className="dc-option-label">{t('common.dataCompare.maxRows')}</span>
            <InputNumber
              min={1}
              step={50000}
              value={maxRows}
              onChange={(v) => {
                setMaxRows(v);
                setResult(null);
              }}
              disabled={comparing}
            />
          </div>
          <div className="dc-option">
            <span className="dc-option-label">{t('common.dataCompare.maxStatements')}</span>
            <InputNumber
              min={1}
              step={500}
              value={maxStatements}
              onChange={(v) => {
                setMaxStatements(v);
                setResult(null);
              }}
              disabled={comparing}
            />
          </div>
        </div>

        <div className="dc-actions">
          <span className="dc-hint">{t('common.dataCompare.safeNote')}</span>
          <Button onClick={onClose} disabled={comparing}>
            {t('common.cancel')}
          </Button>
          <Button
            type="primary"
            loading={comparing}
            onClick={() => void runCompare()}
            data-testid="dc-run"
          >
            {comparing ? t('common.dataCompare.comparing') : t('common.dataCompare.compare')}
          </Button>
        </div>
      </div>

      {error && (
        <Alert type="error" showIcon title={error} className="dc-error" data-testid="dc-error" />
      )}

      {result && (
        <ResultView
          result={result}
          tab={tab}
          onTabChange={setTab}
          onViewSql={() => setSqlOpen(true)}
        />
      )}

      <Modal
        open={sqlOpen}
        onCancel={() => setSqlOpen(false)}
        width={880}
        title={t('common.dataCompare.sqlTitle')}
        footer={
          <Space>
            <Button onClick={() => setSqlOpen(false)}>{t('common.close')}</Button>
            <Button icon={<CopyOutlined />} onClick={() => void copySql()} disabled={!hasSql}>
              {t('common.dataCompare.copySQL')}
            </Button>
            <Button icon={<DownloadOutlined />} onClick={() => void saveSql()} disabled={!hasSql}>
              {t('common.dataCompare.saveSQL')}
            </Button>
            <Button
              type="primary"
              icon={<CodeOutlined />}
              onClick={openInSqlTab}
              disabled={!hasSql}
            >
              {t('common.dataCompare.openInSqlTab')}
            </Button>
          </Space>
        }
      >
        {result && (
          <div className="dc-sql-body">
            <div className="dc-meta">
              {`UPDATE ${result.sql_counts.update} · INSERT ${result.sql_counts.insert} · DELETE ${result.sql_counts.delete}`}
            </div>
            <Alert type="info" showIcon title={t('common.dataCompare.sqlNote')} />
            {result.sql_truncated && (
              <Alert
                type="warning"
                showIcon
                title={t('common.dataCompare.sqlTruncated', {
                  n: result.sql_counts.update + result.sql_counts.insert + result.sql_counts.delete,
                })}
              />
            )}
            {hasSql ? (
              <pre className="dc-sql" data-testid="dc-sql">
                {result.sql}
              </pre>
            ) : (
              <div className="dc-identical">{t('common.dataCompare.sqlEmpty')}</div>
            )}
          </div>
        )}
      </Modal>
    </Modal>
  );
}
