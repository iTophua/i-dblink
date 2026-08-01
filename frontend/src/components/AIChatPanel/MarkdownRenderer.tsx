import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTranslation } from 'react-i18next';
import { Button, Tooltip } from 'antd';
import { CopyOutlined, CheckCircleOutlined, CodeOutlined } from '@ant-design/icons';
import { useState } from 'react';

interface MarkdownRendererProps {
  content: string;
  /** SQL 代码块额外的操作按钮（如"应用到编辑器"） */
  onApplySQL?: (sql: string) => void;
}

/**
 * AI 聊天消息的 Markdown 渲染器。
 * - 支持 GFM（表格、删除线等）
 * - 代码块语法高亮（react-syntax-highlighter）
 * - SQL 代码块额外提供"复制"和"应用到编辑器"按钮
 */
export function MarkdownRenderer({ content, onApplySQL }: MarkdownRendererProps) {
  const { t } = useTranslation();

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code(props) {
          const { children, className, ...rest } = props;
          const match = /language-(\w+)/.exec(className || '');
          const codeStr = String(children).replace(/\n$/, '');
          const isSQL = match?.[1]?.toLowerCase() === 'sql';

          // 行内代码（无 language- 前缀且无换行）用简单样式
          if (!match && !codeStr.includes('\n')) {
            return (
              <code
                {...rest}
                style={{
                  background: 'var(--background-secondary)',
                  padding: '1px 4px',
                  borderRadius: 3,
                  fontSize: 12,
                }}
              >
                {children}
              </code>
            );
          }

          return (
            <CodeBlock
              code={codeStr}
              language={match?.[1] || 'text'}
              isSQL={isSQL}
              onApplySQL={onApplySQL}
              t={t}
            />
          );
        },
        // 段落间距紧凑
        p: ({ children }) => <p style={{ margin: '4px 0' }}>{children}</p>,
        // 标题样式
        h1: ({ children }) => <h3 style={{ fontSize: 14, margin: '8px 0 4px' }}>{children}</h3>,
        h2: ({ children }) => <h4 style={{ fontSize: 13, margin: '8px 0 4px' }}>{children}</h4>,
        h3: ({ children }) => <h5 style={{ fontSize: 12, margin: '6px 0 4px' }}>{children}</h5>,
        // 列表紧凑
        ul: ({ children }) => <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ margin: '4px 0', paddingLeft: 18 }}>{children}</ol>,
        li: ({ children }) => <li style={{ margin: '2px 0' }}>{children}</li>,
        // 表格样式
        table: ({ children }) => (
          <table
            style={{
              borderCollapse: 'collapse',
              width: '100%',
              fontSize: 12,
              margin: '6px 0',
            }}
          >
            {children}
          </table>
        ),
        th: ({ children }) => (
          <th
            style={{
              border: '1px solid var(--border)',
              padding: '4px 8px',
              textAlign: 'left',
              background: 'var(--background-secondary)',
            }}
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td style={{ border: '1px solid var(--border)', padding: '4px 8px' }}>{children}</td>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/** 带语法高亮和操作按钮的代码块 */
function CodeBlock({
  code,
  language,
  isSQL,
  onApplySQL,
  t,
}: {
  code: string;
  language: string;
  isSQL: boolean;
  onApplySQL?: (sql: string) => void;
  t: (k: string) => string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ position: 'relative', margin: '6px 0' }}>
      <SyntaxHighlighter
        language={language}
        style={oneDark}
        customStyle={{
          margin: 0,
          borderRadius: 6,
          fontSize: 12,
          padding: '10px 12px',
        }}
        codeTagProps={{ style: { fontFamily: 'var(--font-mono, monospace)' } }}
      >
        {code}
      </SyntaxHighlighter>
      {/* 代码块右上角操作按钮 */}
      <div
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          display: 'flex',
          gap: 4,
        }}
      >
        <Tooltip title={t('common.copy')}>
          <Button
            size="small"
            type="text"
            icon={copied ? <CheckCircleOutlined style={{ color: 'var(--color-success)' }} /> : <CopyOutlined />}
            onClick={handleCopy}
            style={{
              color: 'rgba(255,255,255,0.7)',
              background: 'rgba(0,0,0,0.3)',
              minWidth: 24,
              height: 24,
            }}
          />
        </Tooltip>
        {isSQL && onApplySQL && (
          <Tooltip title={t('common.aiChat.applyToEditor')}>
            <Button
              size="small"
              type="text"
              icon={<CodeOutlined />}
              onClick={() => onApplySQL(code)}
              style={{
                color: 'rgba(255,255,255,0.7)',
                background: 'rgba(0,0,0,0.3)',
                minWidth: 24,
                height: 24,
              }}
            />
          </Tooltip>
        )}
      </div>
    </div>
  );
}
