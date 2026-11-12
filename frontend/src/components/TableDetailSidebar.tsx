import React, { useState, useEffect, useRef, useCallback } from 'react';
import { App, Descriptions, Segmented, Skeleton, Tooltip, Button } from 'antd';
import {
  CopyOutlined,
  TableOutlined,
  EyeOutlined,
  ReloadOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { useDatabase } from '../hooks/useApi';
import { DDLViewer } from './DDLViewer';
import { EnhancedEmptyState } from './LoadingStates';

interface TableDetailSidebarProps {
  connectionId: string;
  database?: string;
  tableName: string | null;
  tableType?: string;
  tableComment?: string;
  width: number;
  onWidthChange: (width: number) => void;
}

interface SidebarTableInfo {
  engine?: string;
  row_count?: number;
  data_length?: number;
  index_length?: number;
  collation?: string;
  create_time?: string;
  update_time?: string;
  comment?: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 2)} ${units[unit]}`;
}

export const TableDetailSidebar: React.FC<TableDetailSidebarProps> = ({
  connectionId,
  database,
  tableName,
  tableType,
  tableComment,
  width,
  onWidthChange,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const { getTableInfo } = useDatabase();
  const [ddl, setDdl] = useState('');
  const [info, setInfo] = useState<SidebarTableInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'ddl' | 'info'>('ddl');
  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadDetail = useCallback(async () => {
    if (!tableName) {
      setDdl('');
      setInfo(null);
      return;
    }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const [ddlResult, infoResult] = await Promise.all([
      api.getTableDDL(connectionId, tableName, database).catch((err) => {
        if (requestId === requestIdRef.current && isMountedRef.current) {
          message.error(typeof err === 'string' ? err : err?.message || '获取 DDL 失败');
        }
        return '';
      }),
      getTableInfo(connectionId, tableName, database).catch(() => null),
    ]);
    if (requestId !== requestIdRef.current || !isMountedRef.current) return;
    setDdl(Array.isArray(ddlResult) ? ddlResult.join('\n') : String(ddlResult || ''));
    setInfo((infoResult as SidebarTableInfo | null) ?? null);
    setLoading(false);
  }, [connectionId, database, tableName, getTableInfo, message]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 切换表后重新加载 DDL 与表信息
    loadDetail().catch(() => {
      if (isMountedRef.current) setLoading(false);
    });
  }, [loadDetail]);

  const isDraggingRef = useRef(false);

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDraggingRef.current = true;
      const startX = e.clientX;
      const startWidth = width;
      const onMouseMove = (ev: MouseEvent) => {
        if (!isDraggingRef.current) return;
        const newWidth = Math.max(200, Math.min(600, startWidth + startX - ev.clientX));
        onWidthChange(newWidth);
      };
      const onMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [width, onWidthChange]
  );

  const handleCopy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        message.success(t('common.copied'));
      });
    },
    [message, t]
  );

  const displayDdl = tableName ? ddl : '';

  const infoItems = info
    ? [
        { key: 'engine', label: t('common.engine'), children: info.engine || '-' },
        {
          key: 'rows',
          label: t('common.tableList.rowCount'),
          children: info.row_count?.toLocaleString() || '-',
        },
        { key: 'dataSize', label: t('common.dataSize'), children: formatBytes(info.data_length) },
        { key: 'indexSize', label: t('common.indexSize'), children: formatBytes(info.index_length) },
        {
          key: 'collation',
          label: t('common.databaseProperties.collation'),
          children: info.collation || '-',
        },
        { key: 'createTime', label: t('common.createTime'), children: info.create_time || '-' },
        { key: 'updateTime', label: t('common.updateTime'), children: info.update_time || '-' },
      ]
    : [];

  return (
    <>
      <div
        onMouseDown={handleDragStart}
        style={{
          width: 4,
          cursor: 'col-resize',
          background: 'var(--border)',
          transition: 'background 0.2s',
          flexShrink: 0,
          alignSelf: 'stretch',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLDivElement).style.background = 'var(--color-primary)';
        }}
        onMouseLeave={(e) => {
          if (!isDraggingRef.current) {
            (e.currentTarget as HTMLDivElement).style.background = 'var(--border)';
          }
        }}
      />
      <div
        style={{
          width,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0,
          // 面板必须有实心背景：表列表的列头在窄窗口下会溢出到本区域，
          // 透明底会让两处文字叠在一起（表的列头从面板上方透出来）
          background: 'var(--background-card)',
          borderLeft: '1px solid var(--border)',
        }}
      >
        {!tableName ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <EnhancedEmptyState
              icon={<TableOutlined />}
              title={t('common.pleaseSelectATable')}
            />
          </div>
        ) : (
          <>
            <div
              style={{
                padding: '10px 12px 8px',
                borderBottom: '1px solid var(--border)',
                background: 'var(--background-card)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {tableType === 'VIEW' ? (
                  <EyeOutlined
                    style={{ fontSize: 12, color: 'var(--color-primary)', flexShrink: 0 }}
                  />
                ) : (
                  <TableOutlined
                    style={{ fontSize: 12, color: 'var(--color-success)', flexShrink: 0 }}
                  />
                )}
                <span
                  title={tableName}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {tableName}
                </span>
                <Tooltip title={t('common.refresh')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<ReloadOutlined />}
                    loading={loading}
                    onClick={loadDetail}
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                </Tooltip>
                <Tooltip title={t('common.copy')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => handleCopy(tableName)}
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                </Tooltip>
              </div>
              {tableComment && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  {tableComment}
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <Segmented
                  block
                  size="small"
                  value={view}
                  onChange={(value) => setView(value as 'ddl' | 'info')}
                  options={[
                    { value: 'ddl', label: t('common.ddl') },
                    {
                      value: 'info',
                      label: (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <InfoCircleOutlined />
                          {t('common.info')}
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflow: 'hidden',
                minHeight: 0,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {loading ? (
                <div style={{ padding: '10px 12px' }}>
                  <Skeleton active title={false} paragraph={{ rows: 6 }} />
                </div>
              ) : view === 'ddl' ? (
                displayDdl ? (
                  <DDLViewer
                    ddl={displayDdl}
                    connectionId={connectionId}
                    style={{ flex: 1, minHeight: 0 }}
                  />
                ) : (
                  <EnhancedEmptyState title={t('common.noData')} />
                )
              ) : info ? (
                <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px 12px' }}>
                  <Descriptions column={1} size="small" bordered items={infoItems} />
                </div>
              ) : (
                <EnhancedEmptyState title={t('common.noTableInfo')} />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};
