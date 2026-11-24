import { useState } from 'react';
import { Button, Tooltip } from 'antd';
import { CheckOutlined, CopyOutlined } from '@ant-design/icons';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useThemeColors } from '../../hooks/useThemeColors';
import type { SqlApplyMode } from './MarkdownRenderer';

interface CodeBlockProps {
  code: string;
  language: string;
  isSQL: boolean;
  onApplySQL?: (sql: string, mode: SqlApplyMode) => void;
  /** 提供哪些写入编辑器的方式；缺省只给「插入」 */
  applyModes?: SqlApplyMode[];
  /** 代码块仍在流式输出：此时写入编辑器没有意义，禁用 */
  streaming?: boolean;
  labels: {
    copy: string;
    copied: string;
    insert: string;
    replace: string;
    insertHint: string;
    replaceHint: string;
  };
}

/**
 * 带语法高亮和操作栏的代码块。
 * 操作栏独占一行（不再悬浮压在首行代码上）；全局 `pre` / `code` 样式在这里全部重置，
 * 避免出现「外框套高亮框再套 code 内衬」的三层嵌套，正文也不再被全局 code 颜色染红。
 */
export function CodeBlock({
  code,
  language,
  isSQL,
  onApplySQL,
  applyModes,
  streaming,
  labels,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const tc = useThemeColors();

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => undefined
    );
  };

  const modes = isSQL && onApplySQL ? (applyModes ?? ['append']) : [];

  return (
    <div className="ai-code-block" data-testid="ai-code-block">
      <div className="ai-code-block-header">
        <span className="ai-code-block-lang">{language}</span>
        <div className="ai-code-block-actions">
          {modes.map((mode) => (
            <Tooltip key={mode} title={mode === 'append' ? labels.insertHint : labels.replaceHint}>
              <Button
                size="small"
                type="text"
                className="ai-code-block-action"
                disabled={streaming || !code.trim()}
                onClick={() => onApplySQL?.(code, mode)}
              >
                {mode === 'append' ? labels.insert : labels.replace}
              </Button>
            </Tooltip>
          ))}
          <Tooltip title={copied ? labels.copied : labels.copy}>
            <Button
              size="small"
              type="text"
              className="ai-code-block-action"
              aria-label={labels.copy}
              icon={copied ? <CheckOutlined style={{ color: tc.success }} /> : <CopyOutlined />}
              onClick={handleCopy}
            />
          </Tooltip>
        </div>
      </div>
      <SyntaxHighlighter
        language={language}
        // 语法主题跟随明暗；背景/边框由外层容器负责，这里只保留配色
        style={tc.isDark ? oneDark : oneLight}
        customStyle={{
          margin: 0,
          padding: '10px 12px',
          borderRadius: 0,
          border: 'none',
          background: 'transparent',
          fontSize: 12,
          lineHeight: 1.6,
          maxWidth: '100%',
          // 面板宽度有限：长行折行而不是横向滚动，读 SQL 不用来回拖
          whiteSpace: 'pre-wrap',
          overflowWrap: 'anywhere',
          overflowX: 'auto',
        }}
        codeTagProps={{
          style: {
            fontFamily: 'var(--font-family-code)',
            fontSize: 'inherit',
            background: 'transparent',
            padding: 0,
            borderRadius: 0,
            color: 'inherit',
            // 折行要落在 code 上：高亮库给 pre 写死了 white-space: pre
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
          },
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}
