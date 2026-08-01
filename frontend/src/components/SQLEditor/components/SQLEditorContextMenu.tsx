import React from 'react';
import { Menu } from 'antd';
import { useTranslation } from 'react-i18next';
import {
  PlayCircleOutlined,
  FormatPainterOutlined,
  LineChartOutlined,
  CopyOutlined,
  FileTextOutlined,
  SaveOutlined,
  ClearOutlined,
} from '@ant-design/icons';

export interface SQLEditorContextMenuProps {
  contextMenuRef: React.RefObject<HTMLDivElement | null>;
  contextMenuPos: { x: number; y: number };
  selectedSql: string;
  connectionId?: string | null;
  loading: boolean;
  handleExecuteQuery: (explicitSql?: string) => void;
  formatSQL: () => void;
  showExplainPlan: () => void;
  saveSQL: () => void;
  copySQL: () => void;
  clearEditor: () => void;
  editorRef: React.MutableRefObject<any>;
  monacoRef: React.MutableRefObject<any>;
  onClose: () => void;
}

export function SQLEditorContextMenu({
  contextMenuRef,
  contextMenuPos,
  selectedSql,
  connectionId,
  loading,
  handleExecuteQuery,
  formatSQL,
  showExplainPlan,
  saveSQL,
  copySQL,
  clearEditor,
  editorRef,
  monacoRef,
  onClose,
}: SQLEditorContextMenuProps) {
  const { t } = useTranslation();

  return (
    <div
      ref={contextMenuRef}
      className="app-context-menu"
      style={{
        position: 'fixed',
        left: contextMenuPos.x,
        top: contextMenuPos.y,
        zIndex: 1000,
        minWidth: 160,
        fontSize: 12,
      }}
    >
      <Menu
        mode="vertical"
        selectable={false}
        className="sql-ctx-menu"
        style={{
          background: 'transparent',
          border: 'none',
          boxShadow: 'none',
        }}
        items={[
          {
            key: 'execute',
            icon: <PlayCircleOutlined style={{ color: 'var(--color-primary)', fontSize: 12 }} />,
            label: selectedSql
              ? t('common.executeSelected')
              : t('common.executeButton'),
            disabled: !connectionId || loading,
            onClick: () => {
              onClose();
              if (selectedSql) {
                handleExecuteQuery(selectedSql);
              } else {
                handleExecuteQuery();
              }
            },
          },
          {
            key: 'format',
            icon: <FormatPainterOutlined style={{ fontSize: 12 }} />,
            label: t('common.formatButton'),
            onClick: () => { onClose(); formatSQL(); },
          },
          {
            key: 'explain',
            icon: <LineChartOutlined style={{ fontSize: 12 }} />,
            label: t('common.explainPlanButton'),
            disabled: !connectionId,
            onClick: () => { onClose(); showExplainPlan(); },
          },
          { key: 'd1', type: 'divider' },
          {
            key: 'cut',
            icon: <span style={{ fontSize: 11 }}>✂️</span>,
            label: t('common.cut'),
            onClick: () => { onClose(); editorRef.current?.getAction('editor.action.clipboardCutAction')?.run(); },
          },
          {
            key: 'copy',
            icon: <CopyOutlined style={{ fontSize: 12 }} />,
            label: t('common.copy'),
            onClick: () => { onClose(); editorRef.current?.getAction('editor.action.clipboardCopyAction')?.run(); },
          },
          {
            key: 'paste',
            icon: <span style={{ fontSize: 11 }}>📋</span>,
            label: t('common.paste'),
            onClick: () => { onClose(); editorRef.current?.getAction('editor.action.clipboardPasteAction')?.run(); },
          },
          {
            key: 'select-all',
            icon: <span style={{ fontSize: 11 }}>☐</span>,
            label: t('common.selectAll'),
            onClick: () => {
              onClose();
              const ed = editorRef.current;
              const mc = monacoRef.current;
              if (!ed || !mc) return;
              const m = ed.getModel();
              if (!m) return;
              ed.setSelection(new mc.Selection(1, 1, m.getLineCount(), m.getLineMaxColumn(m.getLineCount())));
            },
          },
          { key: 'd2', type: 'divider' },
          {
            key: 'comment',
            icon: <FileTextOutlined style={{ fontSize: 12 }} />,
            label: t('common.commentButton'),
            onClick: () => { onClose(); editorRef.current?.getAction('editor.action.commentLine')?.run(); },
          },
          {
            key: 'uppercase',
            icon: <span style={{ fontSize: 11 }}>⬆</span>,
            label: t('common.uppercase'),
            onClick: () => {
              onClose();
              const ed = editorRef.current;
              if (!ed) return;
              const sel = ed.getSelection();
              const txt = sel && ed.getModel()?.getValueInRange(sel);
              if (!sel || !txt) return;
              ed.executeEdits('case', [{ range: sel, text: txt.toUpperCase(), forceMoveMarkers: true }]);
            },
          },
          {
            key: 'lowercase',
            icon: <span style={{ fontSize: 11 }}>⬇</span>,
            label: t('common.lowercase'),
            onClick: () => {
              onClose();
              const ed = editorRef.current;
              if (!ed) return;
              const sel = ed.getSelection();
              const txt = sel && ed.getModel()?.getValueInRange(sel);
              if (!sel || !txt) return;
              ed.executeEdits('case', [{ range: sel, text: txt.toLowerCase(), forceMoveMarkers: true }]);
            },
          },
          { key: 'd3', type: 'divider' },
          {
            key: 'save',
            icon: <SaveOutlined style={{ fontSize: 12 }} />,
            label: t('common.saveSql'),
            onClick: () => { onClose(); saveSQL(); },
          },
          {
            key: 'copy-sql',
            icon: <CopyOutlined style={{ fontSize: 12 }} />,
            label: t('common.copySqlMenu'),
            onClick: () => { onClose(); copySQL(); },
          },
          {
            key: 'clear',
            icon: <ClearOutlined style={{ fontSize: 12 }} />,
            label: t('common.clearEditor'),
            onClick: () => { onClose(); clearEditor(); },
          },
        ]}
      />
    </div>
  );
}
