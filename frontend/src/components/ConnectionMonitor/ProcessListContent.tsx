import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Checkbox,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  App,
} from 'antd';
import {
  CopyOutlined,
  ReloadOutlined,
  SearchOutlined,
  StopOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { api } from '../../api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { useTableScrollHeight } from '../../hooks/useTableScrollHeight';

const { Text } = Typography;

/** 状态胶囊配色：不用 antd Tag（inline-flex 居中会把长文本首尾同时裁掉） */
const STATE_PILL_COLORS: Record<string, { bg: string; fg: string; border: string }> = {
  red: {
    bg: 'var(--color-error-alpha-15)',
    fg: 'var(--color-error)',
    border: 'var(--color-error-alpha-30)',
  },
  orange: {
    bg: 'var(--color-warning-alpha-15)',
    fg: 'var(--color-warning)',
    border: 'var(--color-warning-alpha-30)',
  },
  blue: {
    bg: 'var(--color-info-alpha-15)',
    fg: 'var(--color-info)',
    border: 'var(--color-info-alpha-30)',
  },
  green: {
    bg: 'var(--color-success-alpha-15)',
    fg: 'var(--color-success)',
    border: 'var(--color-success-alpha-30)',
  },
  default: {
    bg: 'var(--background-toolbar)',
    fg: 'var(--text-secondary)',
    border: 'var(--border)',
  },
};

/** 慢查询阈值（秒）：超过后时间列高亮，并支持「只看慢查询」过滤 */
const SLOW_SECONDS = 60;

/** Sleep/Daemon 的 TIME 是连接/守护线程存活时长，不是查询耗时，不参与慢查询判定 */
function isSlowProcess(process: ProcessItem): boolean {
  const command = (process.command || '').toLowerCase();
  if (command === 'sleep' || command === 'daemon') return false;
  return Number(process.time || 0) >= SLOW_SECONDS;
}

interface ProcessItem {
  id: string;
  user: string;
  host?: string;
  database?: string;
  command?: string;
  state?: string;
  info?: string;
  time?: string;
  start_time?: string;
  duration?: string;
  serial?: string;
}

interface ProcessListContentProps {
  connectionId: string;
  /** 入口带来的初始库过滤（连接级入口为空 = 全部库） */
  database?: string;
  databases?: string[];
  /** 页内切换库过滤时回传，供外层标题同步 */
  onDatabaseChange?: (database?: string) => void;
}

/** 连接监控 · 进程管理（Tab 内容，非弹窗） */
export const ProcessListContent: React.FC<ProcessListContentProps> = ({
  connectionId,
  database,
  databases = [],
  onDatabaseChange,
}) => {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const [processes, setProcesses] = useState<ProcessItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [search, setSearch] = useState('');
  const [slowOnly, setSlowOnly] = useState(false);
  const [sqlDetail, setSqlDetail] = useState<{ id: string; sql: string } | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { tableScrollHeight, containerRef, toolbarRef } = useTableScrollHeight([processes.length]);
  // 库过滤完全由外层控制：避免 props→state 的同步 effect（会触发级联渲染）
  const dbFilter = database;

  const fetchProcesses = useCallback(async () => {
    if (!connectionId) return;
    setLoading(true);
    try {
      const result = await api.getProcessList(connectionId, dbFilter);
      setProcesses(result || []);
    } catch (err: unknown) {
      message.error(t('common.processList.fetchFailed') + ': ' + getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [connectionId, dbFilter, message, t]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 首屏/换库时加载进程列表（含 loading 状态）
    if (connectionId) fetchProcesses();
  }, [connectionId, fetchProcesses]);

  useEffect(() => {
    if (autoRefresh) {
      intervalRef.current = setInterval(fetchProcesses, 5000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, fetchProcesses]);

  const copyText = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(
        () => message.success(t('common.copiedToClipboard')),
        () => message.error(t('common.copyFailed'))
      );
    },
    [message, t]
  );

  const filteredProcesses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return processes.filter((p) => {
      if (slowOnly && !isSlowProcess(p)) return false;
      if (!q) return true;
      return [p.id, p.user, p.host, p.database, p.command, p.state, p.info]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [processes, search, slowOnly]);

  const handleKill = useCallback(
    (record: ProcessItem) => {
      modal.confirm({
        title: t('common.processList.confirmKillTitle'),
        content: t('common.processList.confirmKillContent', {
          id: record.id,
          user: record.user,
          query: record.info ? record.info.substring(0, 100) : '',
        }),
        okText: t('common.processList.kill'),
        okType: 'danger',
        cancelText: t('common.cancel'),
        transitionName: '',
        maskTransitionName: '',
        onOk: async () => {
          try {
            await api.killProcess(connectionId, dbFilter || '', record.id, record.serial || '');
            message.success(t('common.processList.killSuccess', { id: record.id }));
            fetchProcesses();
          } catch (err: unknown) {
            message.error(t('common.processList.killFailed') + ': ' + getErrorMessage(err));
          }
        },
      });
    },
    [connectionId, dbFilter, modal, message, t, fetchProcesses]
  );

  const columns: ColumnsType<ProcessItem> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 70,
      sorter: (a, b) => Number(a.id) - Number(b.id),
    },
    {
      title: t('common.processList.user'),
      dataIndex: 'user',
      key: 'user',
      width: 105,
      ellipsis: true,
    },
    {
      title: t('common.processList.host'),
      dataIndex: 'host',
      key: 'host',
      width: 140,
      ellipsis: true,
      render: (val: string | undefined) => val || '-',
    },
    {
      title: t('common.processList.database'),
      dataIndex: 'database',
      key: 'database',
      width: 110,
      ellipsis: true,
      render: (val: string | undefined) => val || '-',
    },
    {
      title: t('common.processList.command'),
      dataIndex: 'command',
      key: 'command',
      width: 90,
      render: (val: string | undefined) => {
        if (!val) return '-';
        const color = val === 'Sleep' || val === 'sleep' ? 'default' : 'processing';
        return <Tag color={color}>{val}</Tag>;
      },
    },
    {
      title: t('common.processList.time'),
      dataIndex: 'time',
      key: 'time',
      width: 85,
      sorter: (a, b) => Number(a.time || 0) - Number(b.time || 0),
      render: (val: string | undefined, record: ProcessItem) => {
        if (!val) return '-';
        const seconds = Number(val);
        const slow = isSlowProcess(record);
        return (
          <Tooltip
            title={slow ? t('common.processList.slowHint', { seconds }) : undefined}
            placement="topLeft"
          >
            <span
              style={{
                color: slow ? 'var(--color-warning)' : undefined,
                fontWeight: slow ? 600 : undefined,
              }}
            >
              {val}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: t('common.processList.state'),
      dataIndex: 'state',
      key: 'state',
      width: 145,
      render: (val: string | undefined) => {
        if (!val) return '-';
        const state = val.toLowerCase();
        // 更细的状态配色：等待/锁/查询中不再是统一的灰色，长状态也更易读
        let color = 'default';
        if (state.includes('lock') || state.includes('deadlock')) color = 'red';
        else if (state.includes('wait')) color = 'orange';
        else if (state.includes('sleep')) color = 'default';
        else if (
          state.includes('query') ||
          state.includes('sending') ||
          state.includes('reading') ||
          state.includes('writing')
        )
          color = 'blue';
        else if (state.includes('active') || state.includes('running')) color = 'green';
        const pill = STATE_PILL_COLORS[color] || STATE_PILL_COLORS.default;
        return (
          <Tooltip title={val} placement="topLeft">
            {/* 长状态：自定义胶囊 + 省略号；antd Tag 的 inline-flex 居中会裁掉首尾 */}
            <span
              style={{
                display: 'inline-block',
                maxWidth: '100%',
                boxSizing: 'border-box',
                padding: '0 7px',
                height: 20,
                lineHeight: '18px',
                borderRadius: 4,
                border: `1px solid ${pill.border}`,
                background: pill.bg,
                color: pill.fg,
                fontSize: 12,
                textAlign: 'left',
                verticalAlign: 'middle',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {val}
            </span>
          </Tooltip>
        );
      },
    },
    {
      title: t('common.processList.info'),
      dataIndex: 'info',
      key: 'info',
      ellipsis: true,
      render: (val: string | undefined, record: ProcessItem) => {
        if (!val) return '-';
        return (
          <Tooltip title={val} placement="topLeft" overlayStyle={{ maxWidth: 500 }}>
            <Text
              onClick={() => setSqlDetail({ id: record.id, sql: val })}
              style={{
                fontSize: 12,
                fontFamily: 'monospace',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
              }}
              ellipsis
            >
              {val}
            </Text>
          </Tooltip>
        );
      },
    },
    {
      title: t('common.processList.action'),
      key: 'action',
      width: 120,
      fixed: 'right',
      render: (_: unknown, record: ProcessItem) => (
        <Space size={2}>
          <Tooltip title={t('common.processList.copySql')}>
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              disabled={!record.info}
              onClick={() => record.info && copyText(record.info)}
            />
          </Tooltip>
          <Button
            type="link"
            danger
            size="small"
            icon={<StopOutlined />}
            onClick={() => handleKill(record)}
          >
            {t('common.processList.kill')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div
      ref={containerRef}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: '0 16px 8px' }}
    >
      <div
        ref={toolbarRef}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 0',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <Select
          allowClear
          size="small"
          value={database}
          placeholder={t('common.allDatabases')}
          options={databases.map((d) => ({ label: d, value: d }))}
          onChange={(value) => onDatabaseChange?.(value)}
          style={{ width: 180 }}
        />
        <Input
          allowClear
          size="small"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
          placeholder={t('common.processList.searchPlaceholder')}
          style={{ width: 230 }}
        />
        <Checkbox checked={slowOnly} onChange={(e) => setSlowOnly(e.target.checked)}>
          <span style={{ fontSize: 12 }}>{t('common.processList.slowOnly')}</span>
        </Checkbox>
        <span style={{ flex: 1 }} />
        <Space size={8}>
          <Switch
            checked={autoRefresh}
            onChange={setAutoRefresh}
            checkedChildren={<SyncOutlined spin />}
            unCheckedChildren={<SyncOutlined />}
            size="small"
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            {t('common.processList.autoRefresh')}
          </Text>
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchProcesses} loading={loading}>
            {t('common.refresh')}
          </Button>
        </Space>
      </div>
      <Table<ProcessItem>
        columns={columns}
        dataSource={filteredProcesses}
        rowKey="id"
        loading={loading}
        size="small"
        scroll={{ x: 980, y: Math.max(200, tableScrollHeight - 40) }}
        pagination={false}
        locale={{
          emptyText:
            search.trim() || slowOnly || database
              ? t('common.processList.noMatch')
              : t('common.processList.noProcesses'),
        }}
      />

      {/* 完整 SQL 详情：点击 SQL 单元格打开，可整体复制 */}
      <Modal
        open={!!sqlDetail}
        title={`${t('common.processList.sqlDetail')}${sqlDetail ? ` · #${sqlDetail.id}` : ''}`}
        onCancel={() => setSqlDetail(null)}
        width={760}
        transitionName=""
        maskTransitionName=""
        footer={
          <Space>
            <Button
              icon={<CopyOutlined />}
              onClick={() => sqlDetail && copyText(sqlDetail.sql)}
            >
              {t('common.processList.copySql')}
            </Button>
            <Button type="primary" onClick={() => setSqlDetail(null)}>
              {t('common.close')}
            </Button>
          </Space>
        }
      >
        <pre
          style={{
            margin: 0,
            maxHeight: '52vh',
            overflow: 'auto',
            padding: 12,
            borderRadius: 8,
            background: 'var(--background-toolbar)',
            border: '1px solid var(--border)',
            fontFamily: 'var(--font-family-code)',
            fontSize: 12,
            lineHeight: 1.6,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-all',
            color: 'var(--text-primary)',
          }}
        >
          {sqlDetail?.sql}
        </pre>
      </Modal>
    </div>
  );
};
