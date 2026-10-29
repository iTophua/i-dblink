import React, { useRef, useCallback, useMemo } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { CopyOutlined } from '@ant-design/icons';
import { Tooltip, App } from 'antd';
import { useTranslation } from 'react-i18next';
import { format as formatSql, type SqlLanguage } from 'sql-formatter';
import { useThemeColors } from '../hooks/useThemeColors';
import { useAppStore } from '../stores/appStore';
import type { DatabaseType } from '../types/api';

interface DDLViewerProps {
  ddl: string;
  maxHeight?: string | number;
  /** 外部样式（用于 flex 布局下让组件占满父容器，如 { flex: 1, minHeight: 0 }） */
  style?: React.CSSProperties;
  /** 连接 ID：用于按数据库方言格式化（方言不对会把 CHARACTER SET 之类拆错行） */
  connectionId?: string;
}

// sql-formatter 的方言名与我们的 db_type 不同名，且同族数据库共用同一方言
function dialectOf(dbType: DatabaseType | undefined): SqlLanguage {
  switch (dbType) {
    case 'mysql':
    case 'mariadb':
      return 'mysql';
    case 'postgresql':
    case 'kingbase':
    case 'highgo':
    case 'vastbase':
      return 'postgresql';
    case 'oracle':
    case 'dameng':
      return 'plsql';
    case 'sqlserver':
      return 'transactsql';
    case 'sqlite':
      return 'sqlite';
    default:
      // 未知类型用通用方言兜底
      return 'sql';
  }
}

export const DDLViewer: React.FC<DDLViewerProps> = ({
  ddl,
  maxHeight,
  style,
  connectionId,
}) => {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const tc = useThemeColors();
  const containerRef = useRef<HTMLDivElement>(null);
  const dbType = useAppStore(
    (state) => state.connections.find((c) => c.id === connectionId)?.db_type
  );

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

  const formattedDDL = useMemo(() => {
    try {
      const formatted = formatSql(ddl, {
        language: dialectOf(dbType),
        keywordCase: 'upper',
        indentStyle: 'standard',
        linesBetweenQueries: 2,
      });
      // 后处理：sql-formatter 会在 DDL 表选项的 = 两边加空格（ENGINE = InnoDB），
      // 但 DDL 约定表选项的 = 无空格（ENGINE=InnoDB）。这里只针对表选项关键字去空格。
      return formatted.replace(
        /(ENGINE|CHARSET|COLLATE|AUTO_INCREMENT|ROW_FORMAT)\s*=\s*/gi,
        '$1='
      );
    } catch {
      return ddl;
    }
  }, [ddl, dbType]);

  // 注意：函数内所有 hook 必须在 return 之前调用（此前 ddl 为空时会跳过后面的
  // useMemo，ddl 由空转非空时 hook 数量变化会触发 React 报错）
  if (!ddl) return null;

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
          // 实心底色：复制按钮浮在代码上方，透明底会和首行文字叠在一起
          background: tc.backgroundCard,
          boxShadow: `0 0 0 1px ${borderColor}`,
          padding: '2px 6px',
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
