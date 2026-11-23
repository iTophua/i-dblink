import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Drawer, Tag, Tooltip, App } from 'antd';
import {
  RocketOutlined,
  CloseOutlined,
  StopOutlined,
  ReloadOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { api } from '../../../api';
import { streamAITask } from '../../../services/aiService';
import { useAIStore } from '../../../stores/aiStore';
import { MarkdownRenderer } from '../../AIChatPanel/MarkdownRenderer';
import { useThemeColors } from '../../../hooks/useThemeColors';
import type { SQLOptimizeContext } from '../../../api';

interface SQLOptimizePanelProps {
  open: boolean;
  onClose: () => void;
  connectionId?: string | null;
  database?: string | null;
  /** 待优化的 SQL（编辑器选中语句或当前语句，由调用方截取） */
  sql: string;
}

/**
 * SQL 优化抽屉：AI 基于真实执行计划 + 表结构给出慢 SQL 优化建议。
 *
 * 流程：打开即收集上下文（后端 PrepareSQLOptimize：EXPLAIN + 涉及表 DDL）
 * → 发起 sql-optimize 流式任务 → Markdown 流式渲染。
 * SQL 代码块通过 MarkdownRenderer 自带「复制 / 应用到编辑器」按钮应用，
 * 应用走全局 ai-sql-inject 事件（与 AIChatPanel 同一条注入链路）。
 */
export function SQLOptimizePanel({
  open,
  onClose,
  connectionId,
  database,
  sql,
}: SQLOptimizePanelProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const tc = useThemeColors();
  const checkStatus = useAIStore((s) => s.checkStatus);
  const aiReady = useAIStore((s) => s.ready);

  const [collecting, setCollecting] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [content, setContent] = useState('');
  const [contextInfo, setContextInfo] = useState<SQLOptimizeContext | null>(null);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const start = useCallback(async () => {
    if (!connectionId || !sql.trim()) return;
    setError('');
    setContent('');
    setContextInfo(null);
    setCollecting(true);
    try {
      const ctx = await api.prepareSqlOptimize(connectionId, sql, database || '');
      setContextInfo(ctx);
      setCollecting(false);
      setStreaming(true);
      const controller = new AbortController();
      abortRef.current = controller;
      await streamAITask(
        {
          taskId: 'sql-optimize',
          sql,
          databaseType: ctx.dbType,
          tableInfo: ctx.tableDdl,
          context: ctx.explainPlan ? { explain_plan: ctx.explainPlan } : undefined,
        },
        (chunk) => setContent((prev) => prev + chunk),
        (err) => setError(err),
        controller.signal
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCollecting(false);
      setStreaming(false);
      abortRef.current = null;
    }
  }, [connectionId, database, sql]);

  // 打开时：确认 AI 就绪（未配置直接提示），随后自动开始
  useEffect(() => {
    if (!open) {
      stop();
      return;
    }
    let cancelled = false;
    checkStatus().finally(() => {
      if (cancelled) return;
      if (!useAIStore.getState().ready) {
        setError(t('common.aiSettings.notConfigured'));
        return;
      }
      start();
    });
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const warnings = contextInfo?.warnings ?? [];
  const hasExplain = !!contextInfo?.explainPlan;
  const hasDDL = !!contextInfo?.tableDdl;

  return (
    <Drawer
      open={open}
      onClose={streaming ? stop : onClose}
      width={520}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <RocketOutlined style={{ color: tc.primary }} />
          <span>{t('common.sqlOptimize.title')}</span>
          {streaming && (
            <span style={{ fontSize: 12, color: tc.textTertiary }}>
              {t('common.sqlOptimize.analyzing')}
            </span>
          )}
        </div>
      }
      closeIcon={
        streaming ? (
          <Tooltip title={t('common.sqlOptimize.stop')}>
            <StopOutlined />
          </Tooltip>
        ) : (
          <CloseOutlined />
        )
      }
      styles={{ body: { padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 } }}
    >
      {/* 上下文徽标：让用户知道 AI 拿到了什么证据 */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0 }}>
        <Tag color={hasExplain ? 'success' : 'default'} style={{ margin: 0 }}>
          {t('common.sqlOptimize.explainContext')}: {hasExplain ? '✓' : '—'}
        </Tag>
        <Tag color={hasDDL ? 'success' : 'default'} style={{ margin: 0 }}>
          {t('common.sqlOptimize.ddlContext')}: {hasDDL ? '✓' : '—'}
        </Tag>
        <Tag style={{ margin: 0 }}>{contextInfo?.dbType || ''}</Tag>
      </div>

      {warnings.length > 0 && (
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '6px 10px',
            borderRadius: 8,
            background: 'var(--background-toolbar)',
            fontSize: 12,
            color: tc.textTertiary,
            flexShrink: 0,
          }}
        >
          <ExclamationCircleOutlined style={{ marginTop: 2, color: 'var(--color-warning)' }} />
          <div>
            {warnings.map((w, i) => (
              <div key={i} style={{ overflowWrap: 'anywhere' }}>
                {w}
              </div>
            ))}
          </div>
        </div>
      )}

      {(collecting || streaming) && !content && (
        <div
          style={{ color: tc.textTertiary, fontSize: 13, padding: '24px 0', textAlign: 'center' }}
        >
          {collecting ? t('common.sqlOptimize.collecting') : t('common.sqlOptimize.analyzing')}
        </div>
      )}

      {error && (
        <div
          style={{
            padding: '10px 12px',
            borderRadius: 8,
            background: 'var(--color-danger-bg, rgba(255,77,79,0.08))',
            color: 'var(--color-danger)',
            fontSize: 13,
            flexShrink: 0,
          }}
          data-testid="sql-optimize-error"
        >
          {error}
          {!error.includes(t('common.aiSettings.notConfigured')) && (
            <Button size="small" type="link" icon={<ReloadOutlined />} onClick={start}>
              {t('common.aiChat.retry')}
            </Button>
          )}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {content && (
          <MarkdownRenderer
            content={content}
            onApplySQL={(optimized) =>
              window.dispatchEvent(
                new CustomEvent('ai-sql-inject', { detail: { mode: 'replace', sql: optimized } })
              )
            }
          />
        )}
      </div>
    </Drawer>
  );
}
