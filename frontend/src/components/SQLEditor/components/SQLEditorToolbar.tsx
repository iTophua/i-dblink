import React from 'react';
import {
  Button,
  Space,
  Tooltip,
  Dropdown,
  Select,
  Tag,
} from 'antd';
import { useTranslation } from 'react-i18next';
import {
  PlayCircleOutlined,
  SaveOutlined,
  ClearOutlined,
  FormatPainterOutlined,
  StopOutlined,
  LineChartOutlined,
  CopyOutlined,
  FileTextOutlined,
  HistoryOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  FullscreenOutlined,
  BookOutlined,
  DownloadOutlined,
  LoadingOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { formatShortcutForDisplay, getEffectiveShortcut } from '../../../constants/menuShortcuts';
import { useSettingsStore } from '../../../stores/settingsStore';
import type { DatabaseType } from '../../../types/api';
import type { RecentDatabaseEntry } from '../../../stores/workspaceStore';

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

  // Database selection
  database?: string;
  availableDatabases?: string[];
  recentDatabases?: RecentDatabaseEntry[];
  onDatabaseChange?: (database: string) => void;

  // Fullscreen
  isFullscreen: boolean;
  setIsFullscreen: (v: boolean) => void;
  dbType?: DatabaseType;

  // AI
  onOpenAIPanel?: () => void;
}

export function SQLEditorToolbar({
  loading,
  connectionId,
  handleExecuteQuery,
  stopQuery,
  showExplainPlan,
  execElapsed,
  formatSQL,
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
  database,
  availableDatabases,
  recentDatabases,
  onDatabaseChange,
  isFullscreen,
  setIsFullscreen,
  dbType,
  onOpenAIPanel,
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
      <Space size="small">
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
              padding: '0 10px',
              height: 22,
              borderRadius: 6,
              background: 'var(--color-primary)',
              color: tc.isDark ? '#000000' : '#FFFFFF',
              fontSize: 12,
              fontWeight: 500,
              cursor: !connectionId || loading ? 'not-allowed' : 'pointer',
              opacity: !connectionId ? 0.5 : 1,
              transition: 'all 0.2s ease',
              boxShadow: `0 2px 8px ${tc.primary}33`,
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => {
              if (!connectionId || loading) return;
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = `0 4px 12px ${tc.primary}4D`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = `0 2px 8px ${tc.primary}33`;
            }}
          >
            {loading ? <LoadingOutlined /> : <PlayCircleOutlined />}
            {t('common.executeButton')}
          </div>
        </Tooltip>
        <Button
          icon={<StopOutlined />}
          onClick={stopQuery}
          disabled={!loading}
          danger
          size="small"
        >
          {t('common.stopButton')}
        </Button>

        {/* 执行状态条：loading 时实时显示已用时间；非 loading 显示上次查询耗时 */}
        {loading ? (
          <span style={{ fontSize: 11, color: tc.primary, marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>
            <LoadingOutlined style={{ marginRight: 4 }} />
            {t('common.executingLabel')} {execElapsed.toFixed(1)}s
          </span>
        ) : execElapsed > 0 ? (
          <span style={{ fontSize: 11, color: tc.textTertiary, marginLeft: 4, fontVariantNumeric: 'tabular-nums' }}>
            {execElapsed.toFixed(2)}s
          </span>
        ) : null}

        <div
          style={{
            width: 1,
            height: 16,
            background: 'var(--border)',
            margin: '0 4px',
          }}
        />

        <Button
          icon={<FormatPainterOutlined />}
          onClick={formatSQL}
          size="small"
        >
          {t('common.formatButton')}
        </Button>

        {onOpenAIPanel && (
          <Tooltip title={t('common.ai')}>
            <Button
              icon={<RobotOutlined />}
              onClick={onOpenAIPanel}
              size="small"
            >
              {t('common.ai')}
            </Button>
          </Tooltip>
        )}
        <Button
          icon={<LineChartOutlined />}
          onClick={showExplainPlan}
          disabled={!connectionId}
          size="small"
        >
          {t('common.explainPlanButton')}
        </Button>

        <div
          style={{
            width: 1,
            height: 16,
            background: 'var(--border)',
            margin: '0 4px',
          }}
        />

        {!transactionActive ? (
          <Button
            icon={<ThunderboltOutlined />}
            onClick={handleBeginTransaction}
            disabled={!connectionId}
            size="small"
          >
            {t('common.beginTransaction')}
          </Button>
        ) : (
          <>
            <Button
              icon={<CheckCircleOutlined />}
              onClick={handleCommitTransaction}
              type="primary"
              size="small"
            >
              {t('common.commitTransaction')}
            </Button>
            <Button
              icon={<CloseCircleOutlined />}
              onClick={handleRollbackTransaction}
              danger
              size="small"
            >
              {t('common.rollbackTransaction')}
            </Button>
          </>
        )}

        <div
          style={{
            width: 1,
            height: 16,
            background: 'var(--border)',
            margin: '0 4px',
          }}
        />

        <Tooltip title={t('common.sqlEditor.commentSQL') + ' (Ctrl+/)'}>
          <Button
            icon={<FileTextOutlined />}
            onClick={() => editorRef.current?.getAction('editor.action.commentLine')?.run()}
            size="small"
          >
            {t('common.commentButton')}
          </Button>
        </Tooltip>

        <Dropdown
          menu={{
            items: [
              { key: 'upper', label: t('common.uppercase') },
              { key: 'lower', label: t('common.lowercase') },
            ],
            onClick: ({ key }) => {
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
            },
          }}
        >
          <Button icon={<FormatPainterOutlined />} size="small">
            {t('common.caseButton')}
          </Button>
        </Dropdown>

        <Dropdown
          menu={{
            items: [
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
              if (key === 'save') saveSQL();
              else if (key === 'copy') copySQL();
              else if (key === 'clear') clearEditor();
              else if (key === 'export') exportResult();
              else if (key === 'history') setHistoryPanelVisible(true);
              else if (key === 'snippets') setSnippetManagerOpen(true);
            },
          }}
        >
          <Button icon={<FileTextOutlined />} size="small">
            {t('common.moreButton')}
          </Button>
        </Dropdown>
      </Space>

      <Space>
        {/* 数据库选择 */}
        {connectionId ? (
          availableDatabases && availableDatabases.length > 0 ? (
            <Select
              value={database || undefined}
              onChange={(value) => onDatabaseChange?.(value)}
              placeholder={t('common.selectDatabasePlaceholder')}
              showSearch
              optionFilterProp="label"
              filterOption={(input, option) => {
                const lbl = typeof option?.label === 'string' ? option.label : String(option?.label ?? '');
                return lbl.toLowerCase().includes(input.toLowerCase());
              }}
              style={{ minWidth: 140 }}
              size="small"
              options={(() => {
                const recentList = (recentDatabases || [])
                  .filter((r) => r.connectionId === connectionId && availableDatabases.includes(r.database))
                  .slice(0, 5);
                if (recentList.length > 0) {
                  return [
                    {
                      label: t('common.recentDatabases'),
                      options: recentList.map((r) => ({
                        label: `${r.connectionName} · ${r.database}`,
                        value: r.database,
                      })),
                    },
                    {
                      label: t('common.allDatabases'),
                      options: availableDatabases.map((db) => ({ label: db, value: db })),
                    },
                  ];
                }
                return availableDatabases.map((db) => ({ label: db, value: db }));
              })() as any}
            />
          ) : (
            <span
              style={{
                color: 'var(--color-error)',
                fontSize: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <WarningOutlined />
              {t('common.notLoaded')}
            </span>
          )
        ) : (
          <span style={{ color: 'var(--color-error)', fontSize: 12 }}>
            {t('common.notSelected')}
          </span>
        )}

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
