import React from 'react';
import {
  Button,
  Space,
  Tooltip,
  Dropdown,
  Select,
} from 'antd';
import { useTranslation } from 'react-i18next';
import {
  PlayCircleOutlined,
  SaveOutlined,
  ClearOutlined,
  FormatPainterOutlined,
  UndoOutlined,
  StopOutlined,
  LineChartOutlined,
  CopyOutlined,
  HistoryOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FullscreenOutlined,
  BookOutlined,
  DownloadOutlined,
  LoadingOutlined,
  RobotOutlined,
  MoreOutlined,
  CommentOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { DatabaseIcon } from '../../DatabaseIcon';
import { formatShortcutForDisplay, getEffectiveShortcut } from '../../../constants/menuShortcuts';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useAIChatStore } from '../../../stores/aiChatStore';
import type { DatabaseType } from '../../../types/api';

export interface SQLEditorToolbarProps {
  // Execution
  loading: boolean;
  connectionId?: string | null;
  handleExecuteQuery: (explicitSql?: string) => void;
  stopQuery: () => void;
  showExplainPlan: () => void;
  execElapsed: number;

  // Format
  formatSQL: () => void;
  isFormatted: boolean; // 是否已格式化（用于切换"格式化/还原"）
  editorRef: React.MutableRefObject<any>;

  // Transaction
  transactionActive: boolean;
  handleBeginTransaction: () => void;
  handleCommitTransaction: () => void;
  handleRollbackTransaction: () => void;

  // Editor actions
  saveSQL: () => void;
  copySQL: () => void;
  clearEditor: () => void;
  exportResult: () => void;
  setHistoryPanelVisible: (v: boolean) => void;
  setSnippetManagerOpen: (v: boolean) => void;

  // Connection + database combined selector（合并选择器：一个下拉完成连接+库切换，节省工具栏空间）
  connDbOptions?: {
    label: React.ReactNode;
    options: { value: string; label: React.ReactNode; searchText: string }[];
  }[];
  connDbValue?: { value: string } | null;
  connInfoById?: Record<string, { name: string; dbType?: DatabaseType }>;
  onConnDbChange?: (connectionId: string, database: string | undefined) => void;

  // Fullscreen
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
}

export function SQLEditorToolbar({
  loading,
  connectionId,
  handleExecuteQuery,
  stopQuery,
  showExplainPlan,
  execElapsed,
  formatSQL,
  isFormatted,
  editorRef,
  transactionActive,
  handleBeginTransaction,
  handleCommitTransaction,
  handleRollbackTransaction,
  saveSQL,
  copySQL,
  clearEditor,
  exportResult,
  setHistoryPanelVisible,
  setSnippetManagerOpen,
  connDbOptions,
  connDbValue,
  connInfoById,
  onConnDbChange,
  isFullscreen,
  setIsFullscreen,
}: SQLEditorToolbarProps) {
  const { t } = useTranslation();
  const tc = useThemeColors();

  return (
    <div
      style={{
        padding: '4px 8px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: 'var(--background-toolbar)',
      }}
      className="sql-editor-toolbar"
    >
      <style>{`.sql-editor-toolbar .ant-btn { height: 22px; font-size: 12px; }`}</style>
      <Space size={6}>
        <Tooltip
          title={`${t('common.sqlEditor.execute')} (${formatShortcutForDisplay(getEffectiveShortcut('execute-query', useSettingsStore.getState().settings.shortcuts || {}))})`}
        >
          <div
            onClick={() => !loading && connectionId && handleExecuteQuery()}
            data-testid="sql-execute-btn"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '0 14px',
              height: 26,
              borderRadius: 7,
              background: 'var(--color-primary-gradient, var(--color-primary))',
              color: tc.isDark ? '#000000' : '#FFFFFF',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: !connectionId || loading ? 'not-allowed' : 'pointer',
              opacity: !connectionId ? 0.5 : 1,
              transition: 'all 0.2s ease',
              boxShadow: `inset 0 1px 0 rgba(255,255,255,0.18), 0 2px 8px ${tc.primary}33`,
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              if (!connectionId || loading) return;
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.22), 0 4px 12px ${tc.primary}4D`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = `inset 0 1px 0 rgba(255,255,255,0.18), 0 2px 8px ${tc.primary}33`;
            }}
          >
            {loading ? <LoadingOutlined /> : <PlayCircleOutlined />}
            {t('common.executeButton')}
          </div>
        </Tooltip>
        <Tooltip title={t('common.stopButton')}>
          <Button
            icon={<StopOutlined />}
            onClick={stopQuery}
            disabled={!loading}
            type="text"
            danger
            size="small"
          />
        </Tooltip>

        {/* 执行状态条：loading 时实时显示已用时间；非 loading 显示上次查询耗时 */}
        {loading ? (
          <span style={{ fontSize: 11, color: tc.primary, marginLeft: 2, fontVariantNumeric: 'tabular-nums' }}>
            <LoadingOutlined style={{ marginRight: 4 }} />
            {t('common.executingLabel')} {execElapsed.toFixed(1)}s
          </span>
        ) : execElapsed > 0 ? (
          <span style={{ fontSize: 11, color: tc.textTertiary, marginLeft: 2, fontVariantNumeric: 'tabular-nums' }}>
            {execElapsed.toFixed(2)}s
          </span>
        ) : null}

        <div
          style={{
            width: 1,
            height: 16,
            background: 'var(--border)',
            margin: '0 2px',
          }}
        />

        <Button
          icon={isFormatted ? <UndoOutlined /> : <FormatPainterOutlined />}
          onClick={formatSQL}
          type="text"
          size="small"
        >
          {isFormatted ? t('common.unformatButton') : t('common.formatButton')}
        </Button>

        <Button
          icon={<RobotOutlined />}
          onClick={() => useAIChatStore.getState().setPanelVisible(true)}
          type="text"
          size="small"
        >
          {t('common.ai')}
        </Button>
        <Button
          icon={<LineChartOutlined />}
          onClick={showExplainPlan}
          disabled={!connectionId}
          type="text"
          size="small"
        >
          {t('common.explainPlanButton')}
        </Button>

        <div
          style={{
            width: 1,
            height: 16,
            background: 'var(--border)',
            margin: '0 2px',
          }}
        />

        {!transactionActive ? (
          <Button
            icon={<ThunderboltOutlined />}
            onClick={handleBeginTransaction}
            disabled={!connectionId}
            type="text"
            size="small"
          >
            {t('common.beginTransaction')}
          </Button>
        ) : (
          <>
            <Button
              icon={<CheckCircleOutlined style={{ color: 'var(--color-success)' }} />}
              onClick={handleCommitTransaction}
              type="text"
              size="small"
            >
              {t('common.commitTransaction')}
            </Button>
            <Button
              icon={<CloseCircleOutlined />}
              onClick={handleRollbackTransaction}
              type="text"
              danger
              size="small"
            >
              {t('common.rollbackTransaction')}
            </Button>
          </>
        )}

        <Dropdown
          menu={{
            items: [
              {
                key: 'comment',
                label: `${t('common.commentButton')} (Ctrl+/)`,
                icon: <CommentOutlined />,
              },
              {
                key: 'case',
                label: t('common.caseButton'),
                icon: <SwapOutlined />,
                children: [
                  { key: 'upper', label: t('common.uppercase') },
                  { key: 'lower', label: t('common.lowercase') },
                ],
              },
              { type: 'divider' },
              { key: 'save', label: t('common.saveSql'), icon: <SaveOutlined /> },
              { key: 'copy', label: t('common.copySqlMenu'), icon: <CopyOutlined /> },
              { key: 'clear', label: t('common.clearEditor'), icon: <ClearOutlined /> },
              { key: 'snippets', label: t('common.codeSnippets'), icon: <BookOutlined /> },
              { type: 'divider' },
              { key: 'history', label: t('common.queryHistoryTitle'), icon: <HistoryOutlined /> },
              {
                key: 'export',
                label: t('common.exportResults'),
                icon: <DownloadOutlined />,
                disabled: false, // result check is done in parent onClick
              },
            ],
            onClick: ({ key }) => {
              if (key === 'comment') {
                editorRef.current?.getAction('editor.action.commentLine')?.run();
              } else if (key === 'upper' || key === 'lower') {
                const editor = editorRef.current;
                if (!editor) return;
                const model = editor.getModel();
                const selection = editor.getSelection();
                if (!model || !selection) return;
                const selectedText = model.getValueInRange(selection);
                if (!selectedText) return;
                const replaced =
                  key === 'upper' ? selectedText.toUpperCase() : selectedText.toLowerCase();
                editor.executeEdits('case-transform', [
                  { range: selection, text: replaced, forceMoveMarkers: true },
                ]);
              } else if (key === 'save') saveSQL();
              else if (key === 'copy') copySQL();
              else if (key === 'clear') clearEditor();
              else if (key === 'export') exportResult();
              else if (key === 'history') setHistoryPanelVisible(true);
              else if (key === 'snippets') setSnippetManagerOpen(true);
            },
          }}
        >
          <Button icon={<MoreOutlined />} type="text" size="small">
            {t('common.moreButton')}
          </Button>
        </Dropdown>
      </Space>

      <Space>
        {/* 连接 · 库合并选择（按名称/主机/类型/库名搜索，选中即切换） */}
        <Select
          labelInValue
          labelRender={(item) => {
            // 收起态：连接名 · 库名（或 连接名（未选库））
            const v = String(item.value ?? '');
            const sep = v.indexOf('::');
            const connId = sep >= 0 ? v.slice(0, sep) : v;
            const db = sep >= 0 ? v.slice(sep + 2) : '';
            const info = connInfoById?.[connId];
            return (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
                {info?.dbType && <DatabaseIcon type={info.dbType} size={13} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {info?.name || t('common.selectConnection')}
                </span>
                {db ? (
                  <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    · {db}
                  </span>
                ) : (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
                    {t('common.noDatabaseOption')}
                  </span>
                )}
              </span>
            );
          }}
          value={connDbValue ?? undefined}
          onChange={(item: { value: string }) => {
            const v = String(item.value ?? '');
            const sep = v.indexOf('::');
            if (sep < 0) return;
            onConnDbChange?.(v.slice(0, sep), v.slice(sep + 2) || undefined);
          }}
          placeholder={t('common.selectConnection')}
          showSearch
          filterOption={(input, option: any) =>
            String(option?.searchText ?? '')
              .toLowerCase()
              .includes(input.toLowerCase())
          }
          style={{ minWidth: 120, maxWidth: 260 }}
          size="small"
          popupMatchSelectWidth={false}
          options={connDbOptions}
        />

        <Button
          icon={<FullscreenOutlined />}
          type="text"
          onClick={() => {
            const next = !isFullscreen;
            setIsFullscreen(next);
            if (editorRef.current) {
              setTimeout(() => editorRef.current.layout(), 0);
            }
          }}
        />
      </Space>
    </div>
  );
}
