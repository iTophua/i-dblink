import { useState } from 'react';
import { Button, Input, Popconfirm, Popover, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, HistoryOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import type { AIChatSessionSummary } from '../../stores/aiChatStore';
import { formatRelativeTime } from '../../services/aiChatHistory';
import { useImeSafeEnter } from './useImeSafeEnter';

interface HistoryListProps {
  sessions: AIChatSessionSummary[];
  currentSessionId?: string | null;
  getConnectionName?: (connectionId: string | null) => string | undefined;
  onSelect: (id: string) => void;
  /** 传入后每一项显示重命名 / 删除 */
  onRename?: (id: string, title: string) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  /** 正在切换 / 删除的会话；非空时整张列表不可操作（两次切换会乱序，后点的未必是最后显示的） */
  busyId?: string | null;
  limit?: number;
  /** 单行紧凑排版（空态里的「最近对话」） */
  compact?: boolean;
  emptyText: string;
  testId: string;
}

/**
 * 历史会话列表：标题 + 连接名 + 相对时间。弹层里带重命名（行内编辑）和删除；
 * 空态里只读，点击即恢复。
 */
export function HistoryList({
  sessions,
  currentSessionId,
  getConnectionName,
  onSelect,
  onRename,
  onDelete,
  busyId,
  limit,
  compact,
  emptyText,
  testId,
}: HistoryListProps) {
  const { t } = useTranslation();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const { onCompositionStart, onCompositionEnd, isRealEnter } = useImeSafeEnter();

  const items = limit ? sessions.slice(0, limit) : sessions;
  if (items.length === 0) return <div className="ai-history-empty">{emptyText}</div>;

  const commitRename = async () => {
    if (editingId === null) return;
    const id = editingId;
    const title = draft.trim();
    setEditingId(null);
    // 没改就不发请求
    if (!title || title === sessions.find((s) => s.id === id)?.title) return;
    try {
      await onRename?.(id, title);
    } catch {
      // 失败提示由调用方负责
    }
  };

  return (
    <ul
      className={`ai-history-list${compact ? ' is-compact' : ''}`}
      data-testid={testId}
      role="list"
    >
      {items.map((s) => {
        const connName = getConnectionName?.(s.connectionId);
        const editing = editingId === s.id;
        return (
          <li
            key={s.id}
            className={`ai-history-item${s.id === currentSessionId ? ' is-current' : ''}`}
            data-testid={`${testId}-item`}
          >
            {editing ? (
              <Input
                size="small"
                value={draft}
                autoFocus
                maxLength={80}
                placeholder={t('common.aiChat.titlePlaceholder')}
                onChange={(e) => setDraft(e.target.value)}
                onCompositionStart={onCompositionStart}
                onCompositionEnd={onCompositionEnd}
                onBlur={() => void commitRename()}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setEditingId(null);
                    return;
                  }
                  if (e.key === 'Enter' && isRealEnter(e)) {
                    e.preventDefault();
                    void commitRename();
                  }
                }}
                data-testid={`${testId}-rename-input`}
              />
            ) : (
              <button
                type="button"
                className="ai-history-main"
                onClick={() => onSelect(s.id)}
                disabled={busyId != null}
                title={s.title}
                data-testid={`${testId}-open`}
              >
                <span className="ai-history-title">
                  {s.title || t('common.aiChat.untitledChat')}
                </span>
                <span className="ai-history-meta">
                  {connName && <span className="ai-history-conn">{connName}</span>}
                  <span className="ai-history-time">{formatRelativeTime(s.updatedAt, t)}</span>
                </span>
              </button>
            )}
            {onRename && !editing && (
              <span className="ai-history-actions">
                <Tooltip title={t('common.aiChat.renameChat')}>
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    aria-label={t('common.aiChat.renameChat')}
                    data-testid={`${testId}-rename`}
                    disabled={busyId != null}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDraft(s.title);
                      setEditingId(s.id);
                    }}
                  />
                </Tooltip>
                <Popconfirm
                  title={t('common.aiChat.deleteChatConfirm')}
                  okText={t('common.confirm')}
                  cancelText={t('common.cancel')}
                  okButtonProps={{ danger: true }}
                  onConfirm={() => onDelete?.(s.id)}
                >
                  <Tooltip title={t('common.delete')}>
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={t('common.delete')}
                      data-testid={`${testId}-delete`}
                      disabled={busyId != null}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </Tooltip>
                </Popconfirm>
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

interface HistoryPopoverProps {
  sessions: AIChatSessionSummary[];
  currentSessionId: string | null;
  getConnectionName: (connectionId: string | null) => string | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  busyId: string | null;
  clearing: boolean;
}

/** 标题栏的「历史对话」入口：弹层里切换 / 重命名 / 删除 / 清空全部 */
export function HistoryPopover({
  sessions,
  currentSessionId,
  getConnectionName,
  open,
  onOpenChange,
  onSelect,
  onRename,
  onDelete,
  onClearAll,
  busyId,
  clearing,
}: HistoryPopoverProps) {
  const { t } = useTranslation();
  return (
    <Popover
      open={open}
      onOpenChange={onOpenChange}
      trigger="click"
      placement="bottomRight"
      arrow={false}
      overlayClassName="ai-history-popover"
      content={
        <div className="ai-history-panel" data-testid="ai-history-panel">
          <div className="ai-history-head">
            <span className="ai-history-head-title">{t('common.aiChat.history')}</span>
            {sessions.length > 0 && (
              <Popconfirm
                title={t('common.aiChat.clearHistoryConfirm')}
                okText={t('common.confirm')}
                cancelText={t('common.cancel')}
                okButtonProps={{ danger: true }}
                onConfirm={() => void onClearAll()}
              >
                <Button
                  type="link"
                  size="small"
                  danger
                  loading={clearing}
                  data-testid="ai-history-clear-all"
                >
                  {t('common.aiChat.clearHistory')}
                </Button>
              </Popconfirm>
            )}
          </div>
          <HistoryList
            sessions={sessions}
            currentSessionId={currentSessionId}
            getConnectionName={getConnectionName}
            onSelect={onSelect}
            onRename={onRename}
            onDelete={onDelete}
            busyId={busyId}
            emptyText={t('common.aiChat.historyEmpty')}
            testId="ai-history-list"
          />
          <div className="ai-history-hint">{t('common.aiChat.historyHint')}</div>
        </div>
      }
    >
      <Tooltip title={t('common.aiChat.history')}>
        <Button
          type="text"
          size="small"
          icon={<HistoryOutlined />}
          aria-label={t('common.aiChat.history')}
          data-testid="ai-history-trigger"
        />
      </Tooltip>
    </Popover>
  );
}
