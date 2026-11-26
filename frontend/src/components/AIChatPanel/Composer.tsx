import { useImperativeHandle, useRef, useState } from 'react';
import type { ComponentRef, KeyboardEvent, Ref } from 'react';
import { Button, Input, Popover, Tooltip } from 'antd';
import {
  BulbOutlined,
  CloseOutlined,
  CodeOutlined,
  PauseCircleOutlined,
  PlusOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { QuickActionMenu } from './EmptyState';
import type { QuickAction } from './quickActions';
import { useImeSafeEnter } from './useImeSafeEnter';

const { TextArea } = Input;

/** 随消息引用的编辑器 SQL */
export interface AttachedSql {
  sql: string;
  /** 只引用了编辑器中的选区 */
  partial: boolean;
}

export interface ComposerHandle {
  focus: () => void;
}

interface ComposerProps {
  ref?: Ref<ComposerHandle>;
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  attached: AttachedSql | null;
  onDetach: () => void;
  /** 当前 SQL 标签页有可引用的内容 */
  canAttachSql: boolean;
  onAttachSql: () => void;
  quickActions: QuickAction[];
  onQuickAction: (action: QuickAction, target?: string) => void;
}

/** 输入区：引用的 SQL、文本框、快捷指令、发送/停止 */
export function Composer({
  ref,
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  attached,
  onDetach,
  canAttachSql,
  onAttachSql,
  quickActions,
  onQuickAction,
}: ComposerProps) {
  const { t } = useTranslation();
  const textAreaRef = useRef<ComponentRef<typeof TextArea>>(null);
  const [focused, setFocused] = useState(false);
  const {
    onCompositionStart: handleCompositionStart,
    onCompositionEnd: handleCompositionEnd,
    isRealEnter,
  } = useImeSafeEnter();

  useImperativeHandle(ref, () => ({
    focus: () => textAreaRef.current?.focus({ cursor: 'end' }),
  }));

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    if (!isRealEnter(e)) return;
    e.preventDefault();
    onSend();
  };

  const lineCount = attached?.sql.trim().split('\n').length ?? 0;

  return (
    <div className="ai-composer-wrap">
      <div className={`ai-composer${focused ? ' is-focused' : ''}`} data-testid="ai-composer">
        {attached && (
          <div className="ai-composer-attach" data-testid="ai-composer-attach">
            <CodeOutlined />
            <span className="ai-composer-attach-text">
              {t('common.aiChat.attachedSql', { n: lineCount })}
              {attached.partial ? ` · ${t('common.aiChat.selectionOnly')}` : ''}
            </span>
            <Tooltip title={t('common.aiChat.removeAttachment')}>
              <Button
                type="text"
                size="small"
                icon={<CloseOutlined />}
                aria-label={t('common.aiChat.removeAttachment')}
                onClick={onDetach}
              />
            </Tooltip>
          </div>
        )}
        <div className="ai-composer-row">
          <div className="ai-composer-tools">
            <Tooltip
              title={
                canAttachSql ? t('common.aiChat.attachSqlHint') : t('common.aiChat.noSqlToAttach')
              }
            >
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined />}
                disabled={!canAttachSql}
                aria-label={t('common.aiChat.attachSql')}
                onClick={onAttachSql}
                data-testid="ai-attach-sql"
              />
            </Tooltip>
            <Popover
              trigger="click"
              placement="topLeft"
              arrow={false}
              overlayClassName="ai-quick-popover"
              content={<QuickActionMenu actions={quickActions} onAction={onQuickAction} />}
            >
              <Tooltip title={t('common.aiChat.quickPrompts')}>
                <Button
                  type="text"
                  size="small"
                  icon={<BulbOutlined />}
                  aria-label={t('common.aiChat.quickPrompts')}
                  data-testid="ai-quick-prompts"
                />
              </Tooltip>
            </Popover>
          </div>
          <TextArea
            ref={textAreaRef}
            value={value}
            variant="borderless"
            placeholder={t('common.aiChat.inputPlaceholder')}
            autoSize={{ minRows: 1, maxRows: 6 }}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={handleCompositionStart}
            onCompositionEnd={handleCompositionEnd}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            data-testid="ai-composer-input"
          />
          {streaming ? (
            <Button
              type="text"
              size="small"
              icon={<PauseCircleOutlined />}
              aria-label={t('common.aiChat.stopGeneration')}
              title={t('common.aiChat.stopGeneration')}
              onClick={onStop}
              data-testid="ai-stop"
            />
          ) : (
            <Button
              type="primary"
              shape="circle"
              size="small"
              icon={<SendOutlined />}
              aria-label={t('common.aiChat.send')}
              disabled={!value.trim()}
              onClick={onSend}
              data-testid="ai-send"
            />
          )}
        </div>
      </div>
      <div className="ai-composer-foot">
        <span>{t('common.aiChat.disclaimer')}</span>
      </div>
    </div>
  );
}
