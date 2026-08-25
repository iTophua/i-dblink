import React from 'react';
import {
  Button,
  Space,
  Tooltip,
  Dropdown,
  Cascader,
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
import { formatShortcutForDisplay, getEffectiveShortcut, isMacOS } from '../../../constants/menuShortcuts';
import { useSettingsStore } from '../../../stores/settingsStore';
import { useAIChatStore } from '../../../stores/aiChatStore';

/** 连接→库 级联选项（一级连接，二级库）。host/dbType/connected 供 optionRender 渲染，searchStr 供搜索 */
export interface ConnDbCascaderOption {
  value: string;
  label: string;
  host?: string;
  dbType?: string;
  connected?: boolean;
  searchStr?: string;
  children?: ConnDbCascaderOption[];
}

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

  // Connection → database cascader（级联选择：一级连接、二级库；选一级=仅切连接）
  connDbCascaderOptions?: ConnDbCascaderOption[];
  connDbCascaderValue?: string[] | null;
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
  connDbCascaderOptions,
  connDbCascaderValue,
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
        // 全屏时编辑器 fixed 铺满整窗，macOS 红绿灯悬浮在左上角——
        // 与顶部工具栏一致留 92px，避免执行按钮被遮挡（非 macOS 正常留白）
        ...(isFullscreen && isMacOS() ? { paddingLeft: 92 } : {}),
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
        {/* 连接 → 库 级联选择（搜索覆盖连接名/主机/类型/库名；选连接级=仅切连接） */}
        <Cascader<ConnDbCascaderOption>
          changeOnSelect
          options={connDbCascaderOptions}
          value={connDbCascaderValue ?? undefined}
          onChange={(path) => {
            if (!path || path.length === 0) return;
            onConnDbChange?.(String(path[0]), path.length > 1 ? String(path[1]) : undefined);
          }}
          placeholder={t('common.selectConnection')}
          showSearch={{
            filter: (inputValue, path) =>
              path.some((opt) =>
                String(opt.searchStr || opt.label || '')
                  .toLowerCase()
                  .includes(inputValue.toLowerCase())
              ),
          }}
          displayRender={(labels) => (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {labels.join(' · ')}
            </span>
          )}
          style={{ minWidth: 120, maxWidth: 260 }}
          size="small"
          expandTrigger="hover"
          optionRender={(option) =>
            option.dbType != null ? (
              // 连接级：图标 + 名称 + 主机（未连接置灰）
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <DatabaseIcon type={option.dbType} size={13} grayscale={option.connected === false} />
                <span>{option.label}</span>
                {option.host && (
                  <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{option.host}</span>
                )}
              </span>
            ) : (
              <span>{option.label}</span>
            )
          }
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
