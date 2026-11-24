import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Button, Tooltip } from 'antd';
import {
  CheckOutlined,
  CodeOutlined,
  CopyOutlined,
  DownOutlined,
  ExclamationCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  RobotOutlined,
  UpOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { ChatMessage } from '../../stores/aiChatStore';
import { formatElapsed } from '../../utils/aiChat';
import { MarkdownRenderer } from './MarkdownRenderer';
import type { SqlApplyMode } from './MarkdownRenderer';

const SQL_APPLY_MODES: SqlApplyMode[] = ['append', 'replace'];
/** 距底部的距离小于该值视为「在底部」，新内容自动跟随 */
const NEAR_BOTTOM_PX = 80;

interface MessageListProps {
  messages: ChatMessage[];
  /** 末尾是一条已结束的 assistant 回复（可重新生成） */
  canRegenerate: boolean;
  /** 复制文本，返回是否成功（失败提示由调用方负责） */
  onCopy: (text: string) => Promise<boolean>;
  onRegenerate: () => void;
  applySql: (sql: string, mode: SqlApplyMode) => void;
  /** 无消息时的空态 */
  empty: React.ReactNode;
}

/** 流式进行中的走秒：和表数据的执行耗时徽标同一套体感 */
function useElapsedMs(active: boolean): number {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    const timer = window.setInterval(() => setMs(performance.now() - start), 100);
    return () => window.clearInterval(timer);
  }, [active]);
  return active ? ms : 0;
}

const UserMessage = memo(function UserMessage({ msg }: { msg: ChatMessage }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const sql = msg.attachedSql?.trim();
  const lineCount = sql ? sql.split('\n').length : 0;

  return (
    <div className="ai-msg ai-msg-user">
      {sql && (
        <div className="ai-msg-attachment">
          <button
            type="button"
            className="ai-msg-attachment-toggle"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            <CodeOutlined />
            <span>{t('common.aiChat.attachedSql', { n: lineCount })}</span>
            {expanded ? <UpOutlined /> : <DownOutlined />}
          </button>
          {expanded && <pre className="ai-msg-attachment-code">{sql}</pre>}
        </div>
      )}
      <div className="ai-msg-bubble">{msg.content}</div>
    </div>
  );
});

const AssistantMessage = memo(function AssistantMessage({
  msg,
  canRegenerate,
  onCopy,
  onRegenerate,
  applySql,
}: {
  msg: ChatMessage;
  canRegenerate: boolean;
  onCopy: (text: string) => Promise<boolean>;
  onRegenerate: () => void;
  applySql: (sql: string, mode: SqlApplyMode) => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const streaming = msg.status === 'streaming';
  const thinking = streaming && !msg.content.trim();
  const elapsed = useElapsedMs(streaming);

  const handleCopy = async () => {
    if (!(await onCopy(msg.content))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="ai-msg ai-msg-assistant" data-status={msg.status}>
      <div className="ai-msg-avatar">
        <RobotOutlined />
      </div>
      <div className="ai-msg-body">
        {msg.content && (
          <MarkdownRenderer
            content={msg.content}
            onApplySQL={applySql}
            sqlApplyModes={SQL_APPLY_MODES}
            streaming={streaming}
          />
        )}
        {streaming && (
          <div className="ai-msg-thinking" data-testid="ai-msg-thinking">
            <span className="ai-thinking-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>{thinking ? t('common.aiChat.thinking') : t('common.aiChat.generating')}</span>
            <span className="ai-msg-elapsed">{formatElapsed(elapsed)}</span>
          </div>
        )}
        {msg.status === 'error' && (
          <div className="ai-msg-error" role="alert" data-testid="ai-msg-error">
            <ExclamationCircleOutlined />
            <span className="ai-msg-error-text">{msg.error || t('common.aiChat.failed')}</span>
            <Button size="small" type="text" icon={<ReloadOutlined />} onClick={onRegenerate}>
              {t('common.aiChat.retry')}
            </Button>
          </div>
        )}
        {msg.status === 'stopped' && (
          <div className="ai-msg-stopped" data-testid="ai-msg-stopped">
            <PauseCircleOutlined />
            <span>{t('common.aiChat.stopped')}</span>
            <Button size="small" type="text" icon={<ReloadOutlined />} onClick={onRegenerate}>
              {t('common.aiChat.regenerate')}
            </Button>
          </div>
        )}
        {!streaming && msg.content && (
          <div className="ai-msg-actions">
            <Tooltip
              title={copied ? t('common.aiChat.codeCopied') : t('common.aiChat.copyMessage')}
            >
              <Button
                type="text"
                size="small"
                aria-label={t('common.aiChat.copyMessage')}
                icon={
                  copied ? (
                    <CheckOutlined style={{ color: 'var(--color-success)' }} />
                  ) : (
                    <CopyOutlined />
                  )
                }
                onClick={handleCopy}
              />
            </Tooltip>
            {canRegenerate && (
              <Tooltip title={t('common.aiChat.regenerate')}>
                <Button
                  type="text"
                  size="small"
                  aria-label={t('common.aiChat.regenerate')}
                  icon={<ReloadOutlined />}
                  onClick={onRegenerate}
                />
              </Tooltip>
            )}
            {msg.status === 'done' && msg.elapsedMs != null && (
              <span className="ai-msg-elapsed" title={t('common.aiChat.elapsedHint')}>
                {formatElapsed(msg.elapsedMs)}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

export function MessageList({
  messages,
  canRegenerate,
  onCopy,
  onRegenerate,
  applySql,
  empty,
}: MessageListProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  // 只有用户本来就停在底部才跟随新内容；向上翻看时不打断
  useEffect(() => {
    const el = listRef.current;
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // 输入区变高、面板拖宽等布局变化不触发 scroll 事件，用尺寸观察补上贴底
  useEffect(() => {
    const el = listRef.current;
    const inner = innerRef.current;
    if (!el || !inner || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (nearBottomRef.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(inner);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    nearBottomRef.current = near;
    setShowJump(!near);
  }, []);

  const jumpToBottom = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, []);

  return (
    <div className="ai-chat-thread">
      <div
        ref={listRef}
        className="ai-chat-thread-scroll"
        onScroll={handleScroll}
        data-testid="ai-chat-messages"
      >
        {messages.length === 0 ? (
          empty
        ) : (
          <div ref={innerRef} className="ai-chat-thread-inner">
            {messages.map((msg, idx) =>
              msg.role === 'user' ? (
                <UserMessage key={msg.id} msg={msg} />
              ) : (
                <AssistantMessage
                  key={msg.id}
                  msg={msg}
                  canRegenerate={canRegenerate && idx === messages.length - 1}
                  onCopy={onCopy}
                  onRegenerate={onRegenerate}
                  applySql={applySql}
                />
              )
            )}
          </div>
        )}
      </div>
      {showJump && (
        <Tooltip title={t('common.aiChat.jumpToLatest')} placement="top">
          <Button
            className="ai-chat-jump"
            shape="circle"
            size="small"
            icon={<DownOutlined />}
            aria-label={t('common.aiChat.jumpToLatest')}
            onClick={jumpToBottom}
          />
        </Tooltip>
      )}
    </div>
  );
}
