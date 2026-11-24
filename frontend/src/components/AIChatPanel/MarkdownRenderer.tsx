import { createContext, memo, useContext } from 'react';
import type { ComponentProps, JSX } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ExtraProps } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useTranslation } from 'react-i18next';
import { CodeBlock } from './CodeBlock';
import '../../styles/ai-chat.css';

export type SqlApplyMode = 'append' | 'replace';

interface MarkdownRendererProps {
  content: string;
  /** 把 SQL 代码块写入编辑器；传入后 SQL 代码块显示「插入 / 替换」 */
  onApplySQL?: (sql: string, mode: SqlApplyMode) => void;
  /** SQL 代码块提供哪些写入方式，缺省只有「插入」 */
  sqlApplyModes?: SqlApplyMode[];
  /** 内容仍在流式输出（禁用写入编辑器） */
  streaming?: boolean;
}

type MarkedProps<Tag extends keyof JSX.IntrinsicElements> = ComponentProps<Tag> & ExtraProps;

/** 标记当前 code 位于代码围栏内（pre 之下），区别于行内代码 */
const BlockCodeContext = createContext(false);

/** 渲染器级的选项，经上下文传给各个代码块（react-markdown 的组件映射拿不到外层 props） */
const RendererOptionsContext = createContext<MarkdownRendererProps>({ content: '' });

/** react-markdown 不需要 pre 本身的 DOM，只借它把「这是代码块」传给里面的 code */
function MarkdownPre({ children }: MarkedProps<'pre'>) {
  return <BlockCodeContext.Provider value={true}>{children}</BlockCodeContext.Provider>;
}

function MarkdownCode({ children, className }: MarkedProps<'code'>) {
  const { t } = useTranslation();
  const inBlock = useContext(BlockCodeContext);
  const { onApplySQL, sqlApplyModes, streaming } = useContext(RendererOptionsContext);

  // 只取这两个字段：props 里还夹着 react-markdown 的 node（非 DOM 属性），不能整体透传
  if (!inBlock) {
    return <code className="ai-md-code">{children}</code>;
  }
  const match = /language-(\w+)/.exec(className || '');
  const language = (match?.[1] || 'text').toLowerCase();
  return (
    <CodeBlock
      code={String(children).replace(/\n$/, '')}
      language={language}
      isSQL={language === 'sql'}
      onApplySQL={onApplySQL}
      applyModes={sqlApplyModes}
      streaming={streaming}
      labels={{
        copy: t('common.copy'),
        copied: t('common.aiChat.codeCopied'),
        insert: t('common.aiChat.insert'),
        replace: t('common.aiChat.replace'),
        insertHint: t('common.aiChat.insertHint'),
        replaceHint: t('common.aiChat.replaceHint'),
      }}
    />
  );
}

/** 表格外包一层横向滚动容器，宽表不会撑破侧栏 */
function MarkdownTable({ children }: MarkedProps<'table'>) {
  return (
    <div className="ai-md-table-wrap">
      <table>{children}</table>
    </div>
  );
}

/**
 * AI 输出的 Markdown 渲染器（AI 面板、SQL 优化抽屉、文档生成弹窗共用）。
 * - 支持 GFM（表格、删除线、任务列表）
 * - 代码块语法高亮，跟随明暗主题；SQL 代码块可写入编辑器
 * 样式集中在 styles/ai-chat.css 的 `.ai-md` 下。
 */
export const MarkdownRenderer = memo(function MarkdownRenderer(props: MarkdownRendererProps) {
  const { content } = props;
  return (
    <div className="ai-md">
      <RendererOptionsContext.Provider value={props}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{ pre: MarkdownPre, code: MarkdownCode, table: MarkdownTable }}
        >
          {content}
        </ReactMarkdown>
      </RendererOptionsContext.Provider>
    </div>
  );
});
