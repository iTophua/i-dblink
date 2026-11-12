import React from 'react';
import { Button, Space, Tooltip, Dropdown, Select, Segmented } from 'antd';
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
  WarningOutlined,
} from '@ant-design/icons';
import { useThemeColors } from '../../../hooks/useThemeColors';
import {
  formatShortcutForDisplay,
  getEffectiveShortcut,
  isMacOS,
} from '../../../constants/menuShortcuts';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useAIChatStore } from '../../../stores/aiChatStore';

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
  txMode: 'auto' | 'manual';
  onTxModeChange: (mode: 'auto' | 'manual') => void;
  transactionActive: boolean;
  handleBeginTransaction: () => void;
  handleCommitTransaction: () => void;
  handleRollbackTransaction: () => void;

  // Editor actions
  saveSQL: () => void;
  copySQL: () => void;
  clearEditor: () => void;
  exportResult: () => void;
  /** 是否有可导出的结果集（菜单项禁用态） */
  hasResult?: boolean;
  setHistoryPanelVisible: (v: boolean) => void;
  setSnippetManagerOpen: (v: boolean) => void;

  // 连接 + 数据库双下拉（连接搜索 名称/主机/类型；切换走统一的 onConnDbChange）
  connectionOptions?: { value: string; label: React.ReactNode; searchText: string }[];
  database?: string;
  availableDatabases?: string[];
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
  txMode,
  onTxModeChange,
  transactionActive,
  handleBeginTransaction,
  handleCommitTransaction,
  handleRollbackTransaction,
  saveSQL,
  copySQL,
  clearEditor,
  exportResult,
  hasResult,
  setHistoryPanelVisible,
  setSnippetManagerOpen,
  connectionOptions,
  database,
  availableDatabases,
  onConnDbChange,
  isFullscreen,
  setIsFullscreen,
}: SQLEditorToolbarProps) {
  const { t } = useTranslation();
  const tc = useThemeColors();

  return (
    <div
      style={{
        // 全屏时编辑器 fixed 铺满整窗，macOS 红绿灯悬浮在左上角——
        // 与顶部工具栏一致留 92px，避免执行按钮被遮挡（非 macOS 正常留白）
        ...(isFullscreen && isMacOS() ? { paddingLeft: 92 } : {}),
      }}
      className="sql-editor-toolbar"
    >
      <Space size={6}>
        <Tooltip
          title={`${t('common.sqlEditor.execute')} (${formatShortcutForDisplay(getEffectiveShortcut('execute-query', useSettingsStore.getState().settings.shortcuts || {}))})`}
        >
          <Button
            type="primary"
            size="small"
            icon={loading ? <LoadingOutlined /> : <PlayCircleOutlined />}
            onClick={() => handleExecuteQuery()}
            disabled={!connectionId}
            loading={loading}
            className="sql-exec-btn"
            data-testid="sql-execute-btn"
          >
            {t('common.executeButton')}
          </Button>
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
          <span
            style={{
              fontSize: 11,
              color: tc.primary,
              marginLeft: 2,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <LoadingOutlined style={{ marginRight: 4 }} />
            {t('common.executingLabel')} {execElapsed.toFixed(1)}s
          </span>
        ) : execElapsed > 0 ? (
          <span
            style={{
              fontSize: 11,
              color: tc.textTertiary,
              marginLeft: 2,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
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

        {/* 事务模式：默认自动提交；手动模式执行 SQL 后出现提交/回滚，提交/回滚不改变模式 */}
        <Tooltip title={t('common.txModeTip')}>
          <Segmented
            value={txMode}
            onChange={(v) => onTxModeChange(v as 'auto' | 'manual')}
            size="small"
            options={[
              { value: 'auto', label: t('common.txModeAuto') },
              { value: 'manual', label: t('common.txModeManual') },
            ]}
          />
        </Tooltip>
        {txMode === 'manual' && !transactionActive && (
          <Tooltip title={t('common.txBeginTip')}>
            <Button
              icon={<PlayCircleOutlined />}
              onClick={handleBeginTransaction}
              disabled={!connectionId}
              type="text"
              size="small"
            >
              {t('common.beginTransaction')}
            </Button>
          </Tooltip>
        )}
        {txMode === 'manual' && transactionActive && (
          <>
            <Tooltip title={t('common.commitTransaction')}>
              <Button
                icon={<CheckCircleOutlined style={{ color: 'var(--color-success)' }} />}
                onClick={handleCommitTransaction}
                type="text"
                size="small"
              />
            </Tooltip>
            <Tooltip title={t('common.rollbackTransaction')}>
              <Button
                icon={<CloseCircleOutlined />}
                onClick={handleRollbackTransaction}
                type="text"
                danger
                size="small"
              />
            </Tooltip>
          </>
        )}

        <div
          style={{
            width: 1,
            height: 16,
            background: 'var(--border)',
            margin: '0 2px',
          }}
        />

        <Tooltip title={isFormatted ? t('common.unformatButton') : t('common.formatButton')}>
          <Button
            icon={isFormatted ? <UndoOutlined /> : <FormatPainterOutlined />}
            onClick={formatSQL}
            type="text"
            size="small"
          />
        </Tooltip>

        <Tooltip title={t('common.ai')}>
          <Button
            icon={<RobotOutlined />}
            onClick={() => useAIChatStore.getState().setPanelVisible(true)}
            type="text"
            size="small"
          />
        </Tooltip>
        <Tooltip title={t('common.explainPlanButton')}>
          <Button
            icon={<LineChartOutlined />}
            onClick={showExplainPlan}
            disabled={!connectionId}
            type="text"
            size="small"
          />
        </Tooltip>

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
                disabled: !hasResult,
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

      <Space size={6}>
        {/* 连接选择（图标+名称，搜索覆盖 名称/主机/类型） */}
        <Select
          value={connectionId || undefined}
          onChange={(value: string) => onConnDbChange?.(value, undefined)}
          placeholder={t('common.selectConnection')}
          showSearch
          filterOption={(input, option) =>
            String((option as { searchText?: string } | undefined)?.searchText ?? '')
              .toLowerCase()
              .includes(input.toLowerCase())
          }
          style={{ minWidth: 100, maxWidth: 170 }}
          size="small"
          popupMatchSelectWidth={false}
          options={connectionOptions}
        />

        {/* 数据库选择（显示所选库，按库名搜索） */}
        {connectionId ? (
          availableDatabases && availableDatabases.length > 0 ? (
            <Select
              value={database || undefined}
              onChange={(value: string) => onConnDbChange?.(connectionId, value)}
              placeholder={t('common.selectDatabasePlaceholder')}
              showSearch
              optionFilterProp="label"
              style={{ minWidth: 100, maxWidth: 160 }}
              size="small"
              popupMatchSelectWidth={false}
              options={availableDatabases.map((db) => ({ label: db, value: db }))}
            />
          ) : (
            <Tooltip title={t('common.notLoaded')}>
              <WarningOutlined style={{ color: 'var(--color-warning)', fontSize: 13 }} />
            </Tooltip>
          )
        ) : null}

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
