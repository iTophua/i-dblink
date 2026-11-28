import React, { useState, useEffect, useCallback } from 'react';
import { App, Button, Descriptions, Skeleton, Tooltip } from 'antd';
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../api';
import type { RoutineKind } from '../types/api';
import { getErrorMessage } from '../utils/getErrorMessage';
import { DDLViewer } from './DDLViewer';
import { DetailSidebarHandle } from './DetailSidebarHandle';
import { EnhancedEmptyState } from './LoadingStates';
import { RoutineKindIcon } from './RoutineKindIcon';
import type { RoutineItem } from './routineMeta';

interface RoutineDetailSidebarProps {
  connectionId: string;
  database?: string;
  kind: RoutineKind;
  item: RoutineItem | null;
  width: number;
  onWidthChange: (width: number) => void;
}

/** 过程 / 函数的定义按名字另取；触发器的定义随列表一起来，序列只有属性——这后两种返回 null */
function requestBody(kind: RoutineKind, connectionId: string, name: string, database?: string) {
  if (kind === 'procedure') return api.getProcedureBody(connectionId, name, database);
  if (kind === 'function') return api.getFunctionBody(connectionId, name, database);
  return null;
}

/**
 * 对象页右侧的详情侧栏：过程 / 函数 / 触发器看定义，序列看属性。
 * 换一项时父组件换 key 重新挂载，这里不用自己清上一个的状态
 */
export function RoutineDetailSidebar({
  connectionId,
  database,
  kind,
  item,
  width,
  onWidthChange,
}: RoutineDetailSidebarProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  // null = 还在取
  const [body, setBody] = useState<{ text: string; error: string } | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  const fetchesBody = (kind === 'procedure' || kind === 'function') && !!item;

  useEffect(() => {
    const request = item ? requestBody(kind, connectionId, item.name, database) : null;
    if (!request) return;
    let cancelled = false;
    request.then(
      (definition) => {
        if (!cancelled) setBody({ text: definition ?? '', error: '' });
      },
      (err: unknown) => {
        if (!cancelled) setBody({ text: '', error: getErrorMessage(err) });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [connectionId, database, kind, item, reloadCount]);

  const handleCopy = useCallback(
    (value: string) => {
      navigator.clipboard.writeText(value).then(() => {
        message.success(t('common.copied'));
      });
    },
    [message, t]
  );

  const definition = fetchesBody ? (body?.text ?? '') : (item?.definition ?? '');
  const loading = fetchesBody && !body;

  const triggerItems = [
    { key: 'table', label: t('common.routineList.table'), children: item?.table || '-' },
    { key: 'timing', label: t('common.routineList.timing'), children: item?.timing || '-' },
    { key: 'event', label: t('common.routineList.event'), children: item?.event || '-' },
  ].filter((entry) => entry.children !== '-');

  const sequence = item?.sequence;
  const sequenceItems = sequence
    ? [
        { key: 'dataType', label: t('common.dataType'), children: sequence.data_type || '-' },
        {
          key: 'start',
          label: t('common.routineList.startValue'),
          children: sequence.start_value || '-',
        },
        {
          key: 'min',
          label: t('common.routineList.minValue'),
          children: sequence.minimum_value || '-',
        },
        {
          key: 'max',
          label: t('common.routineList.maxValue'),
          children: sequence.maximum_value || '-',
        },
        {
          key: 'increment',
          label: t('common.routineList.increment'),
          children: sequence.increment || '-',
        },
        {
          key: 'cycle',
          label: t('common.routineList.cycle'),
          children: sequence.cycle_option || '-',
        },
      ]
    : [];

  return (
    <>
      <DetailSidebarHandle width={width} onWidthChange={onWidthChange} />
      <div
        style={{
          width,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          flexShrink: 0,
          background: 'var(--background-card)',
          borderLeft: '1px solid var(--border)',
        }}
      >
        {!item ? (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
            }}
          >
            <EnhancedEmptyState title={t('common.routineList.selectHint')} />
          </div>
        ) : (
          <>
            <div
              style={{
                padding: '10px 12px 8px',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <RoutineKindIcon kind={kind} />
                <span
                  title={item.name}
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    fontFamily: 'var(--font-family-code)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    flex: 1,
                  }}
                >
                  {item.name}
                </span>
                {fetchesBody && (
                  <Tooltip title={t('common.refresh')}>
                    <Button
                      type="text"
                      size="small"
                      icon={<ReloadOutlined />}
                      loading={loading}
                      onClick={() => {
                        setBody(null);
                        setReloadCount((n) => n + 1);
                      }}
                      style={{ color: 'var(--text-tertiary)' }}
                    />
                  </Tooltip>
                )}
                <Tooltip
                  title={definition ? t('common.routineList.copyDefinition') : t('common.copy')}
                >
                  <Button
                    type="text"
                    size="small"
                    icon={<CopyOutlined />}
                    onClick={() => handleCopy(definition || item.name)}
                    style={{ color: 'var(--text-tertiary)' }}
                  />
                </Tooltip>
              </div>
              {kind === 'trigger' && triggerItems.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <Descriptions column={1} size="small" bordered items={triggerItems} />
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
              }}
            >
              {kind === 'sequence' ? (
                <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px 12px' }}>
                  <Descriptions column={1} size="small" bordered items={sequenceItems} />
                </div>
              ) : loading ? (
                <div style={{ padding: '10px 12px' }}>
                  <Skeleton active title={false} paragraph={{ rows: 6 }} />
                </div>
              ) : fetchesBody && body?.error ? (
                <EnhancedEmptyState title={t('common.loadFailed')} description={body.error} />
              ) : definition ? (
                <DDLViewer
                  ddl={definition}
                  connectionId={connectionId}
                  style={{ flex: 1, minHeight: 0 }}
                />
              ) : (
                <EnhancedEmptyState title={t('common.routineList.noDefinition')} />
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
