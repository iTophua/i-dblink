import React, { useRef, useCallback, useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { CopyOutlined } from '@ant-design/icons';
import { Tooltip, App } from 'antd';
import { useTranslation } from 'react-i18next';
import { format as formatSql } from 'sql-formatter';
import { useThemeColors } from '../hooks/useThemeColors';

interface DDLViewerProps {
  ddl: string;
  maxHeight?: string | number;
  /** 外部样式（用于 flex 布局下让组件占满父容器，如 { flex: 1, minHeight: 0 }） */
  style?: React.CSSProperties;
}

export const DDLViewer: React.FC<DDLViewerProps> = ({ ddl, maxHeight, style }) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const tc = useThemeColors();
  const containerRef = useRef<HTMLDivElement>(null);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(ddl).then(() => {
      message.success(t('common.copied'));
    });
  }, [ddl, message, t]);

  const handleDoubleClick = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim()) {
      navigator.clipboard.writeText(sel.toString().trim()).then(() => {
        message.success(t('common.copied'));
      });
    }
  }, [message, t]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        const sel = window.getSelection();
        if (containerRef.current) {
          const range = document.createRange();
          range.selectNodeContents(containerRef.current);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }
    },
    []
  );

  if (!ddl) return null;

  const formattedDDL = useMemo(() => {
    try {
      return formatSql(ddl, { keywordCase: 'upper', indentStyle: 'standard', linesBetweenQueries: 2 });
    } catch {
      return ddl;
    }
  }, [ddl]);

  const sqlTheme = {
    'code[class*="language-"]': {
      color: tc.textPrimary,
      fontSize: 12,
      lineHeight: 1.8,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    },
    'pre[class*="language-"]': {
      color: tc.textPrimary,
      fontSize: 12,
      lineHeight: 1.8,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
    },
    keyword: { color: tc.primary, fontWeight: 600 },
    builtin: { color: tc.primary },
    type: { color: tc.primary },
    literal: { color: tc.warning },
    number: { color: tc.warning },
    operator: { color: tc.textSecondary },
    punctuation: { color: tc.textSecondary },
    boolean: { color: tc.warning },
    string: { color: tc.success },
    'char.escape': { color: tc.success },
    comment: { color: tc.textTertiary, fontStyle: 'italic' },
    'comment.doc': { color: tc.textTertiary, fontStyle: 'italic' },
    constant: { color: tc.warning },
    symbol: { color: tc.primary },
    function: { color: tc.info, fontWeight: 500 },
    'class-name': { color: tc.warning },
    selector: { color: tc.success },
    important: { color: tc.error, fontWeight: 'bold' },
    variable: { color: tc.textPrimary },
    deleted: { color: tc.error },
    inserted: { color: tc.success },
    regex: { color: tc.warning },
    url: { color: tc.primary },
    bold: { fontWeight: 'bold' },
    italic: { fontStyle: 'italic' },
  };

  const borderColor = tc.border;

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onDoubleClick={handleDoubleClick}
      style={{
        position: 'relative',
        background: 'transparent',
        border: `1px solid ${borderColor}`,
        borderRadius: 6,
        // 防止长 SQL 行撑破父容器（flex 子项默认 min-width:auto 会被内容撑开）
        // 注意：不加 overflow:hidden，否则会截断垂直滚动；宽度约束由 minWidth:0 + maxWidth 提供
        minWidth: 0,
        maxWidth: '100%',
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'transparent',
          padding: '0 4px',
          borderRadius: 4,
        }}
      >
        <Tooltip title={t('common.copy')}>
          <CopyOutlined
            style={{
              fontSize: 13,
              color: tc.textTertiary,
              cursor: 'pointer',
              transition: 'color 0.2s',
            }}
            onClick={handleCopy}
          />
        </Tooltip>
      </div>
      <SyntaxHighlighter
        language="sql"
        style={sqlTheme}
        customStyle={{
          margin: 0,
          padding: 12,
          background: 'transparent',
          // maxHeight 优先用外部传入；否则在 flex 父容器里用 100% 占满
          maxHeight: maxHeight || '100%',
          overflow: 'auto',
          // 关键：限定 pre 自身宽度，防止长行撑破 flex 父链
          maxWidth: '100%',
          minWidth: 0,
          // 在 flex 父容器里让 pre 正确收缩（不被内容高度撑破）
          flex: 1,
          minHeight: 0,
        }}
        wrapLines
      >
        {formattedDDL}
      </SyntaxHighlighter>
    </div>
  );
};
