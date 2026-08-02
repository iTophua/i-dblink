import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Spin, App, Tooltip } from 'antd';
import { CopyOutlined, TableOutlined, EyeOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import { DDLViewer } from './DDLViewer';

interface TableDetailSidebarProps {
  connectionId: string;
  database?: string;
  tableName: string | null;
  tableType?: string;
  tableComment?: string;
  width: number;
  onWidthChange: (width: number) => void;
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
  const [ddl, setDdl] = useState('');
  const [loading, setLoading] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!tableName) return;
    let cancelled = false;
    setLoading(true);
    api
      .getTableDDL(connectionId, tableName, database)
      .catch(() => [])
      .then((ddlResult) => {
        if (cancelled || !isMountedRef.current) return;
        setDdl(Array.isArray(ddlResult) ? ddlResult.join('\n') : String(ddlResult));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [connectionId, database, tableName]);

  const displayDdl = tableName ? ddl : '';

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
    [width, onWidthChange],
  );

  const handleCopy = useCallback(
    (text: string) => {
      navigator.clipboard.writeText(text).then(() => {
        message.success(t('common.copied'));
      });
    },
    [message, t],
  );

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
        }}
      >
        {!tableName ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-tertiary)',
              fontSize: 12,
            }}
          >
            {t('common.pleaseSelectATable')}
          </div>
        ) : loading ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Spin size="small" />
          </div>
        ) : (
          <>
            <div
              style={{
                padding: '10px 12px 8px',
                borderBottom: '1px solid transparent',
                background: 'transparent',
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
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {tableName}
                </span>
                <Tooltip title={t('common.copy')}>
                  <CopyOutlined
                    style={{
                      fontSize: 12,
                      color: 'var(--text-tertiary)',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                    onClick={() => handleCopy(tableName)}
                  />
                </Tooltip>
              </div>
              {tableComment && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  {tableComment}
                </div>
              )}
            </div>
            <div
              style={{
                flex: 1,
                overflow: 'hidden',
                minHeight: 0,
                minWidth: 0,
                display: 'flex',
                flexDirection: 'column',
                background: 'transparent',
              }}
            >
              {displayDdl ? (
                <DDLViewer ddl={displayDdl} style={{ flex: 1, minHeight: 0 }} />
              ) : (
                <div
                  style={{
                    padding: '8px 12px',
                    fontSize: 12,
                    color: 'var(--text-tertiary)',
                    flex: 1,
                    background: 'transparent',
                  }}
                >
                  {t('common.noData')}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
};
