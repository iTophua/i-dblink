import type { ReactNode } from 'react';
import { Dropdown } from 'antd';
import {
  CodeOutlined,
  ConsoleSqlOutlined,
  RobotOutlined,
  SwapOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { CONVERT_TARGETS, parseQuickActionKey } from './quickActions';
import type { QuickAction, QuickActionKey } from './quickActions';

const ACTION_ICONS: Record<QuickActionKey, ReactNode> = {
  generate: <CodeOutlined />,
  explain: <ConsoleSqlOutlined />,
  optimize: <ThunderboltOutlined />,
  convert: <SwapOutlined />,
};

interface QuickActionTileProps {
  action: QuickAction;
  /** 卡片（空态）或菜单行（输入区） */
  variant: 'tile' | 'menu';
  onAction: (action: QuickAction, target?: string) => void;
}

/**
 * 单个快捷动作。「转换方言」需要先选目标数据库，由外层 Dropdown 承接点击；
 * 是否有可引用的 SQL 在点击时才判断（编辑器内容变化不会触发这里的重渲染，做成禁用态会过期）。
 */
function QuickActionTile({ action, variant, onAction }: QuickActionTileProps) {
  const button = (
    <button
      type="button"
      className={variant === 'tile' ? 'ai-quick-tile' : 'ai-quick-menu-item'}
      onClick={() => {
        if (action.key !== 'convert') onAction(action);
      }}
    >
      <span className="ai-quick-icon">{ACTION_ICONS[action.key]}</span>
      <span className="ai-quick-text">
        <span className="ai-quick-title">{action.title}</span>
        {variant === 'tile' && <span className="ai-quick-desc">{action.description}</span>}
      </span>
    </button>
  );
  if (action.key !== 'convert') return button;
  return (
    <Dropdown
      trigger={['click']}
      placement={variant === 'tile' ? 'bottomLeft' : 'rightTop'}
      menu={{
        items: CONVERT_TARGETS.map((target) => ({ key: `convert:${target}`, label: target })),
        onClick: ({ key }) => onAction(action, parseQuickActionKey(key).target),
      }}
    >
      {button}
    </Dropdown>
  );
}

interface ChatEmptyStateProps {
  actions: QuickAction[];
  /** 已选择连接（表结构上下文可用） */
  hasContext: boolean;
  contextName?: string;
  onAction: (action: QuickAction, target?: string) => void;
}

/** 新会话空态：一句引导 + 四张快捷卡片（点击即带上当前 SQL 发问） */
export function ChatEmptyState({
  actions,
  hasContext,
  contextName,
  onAction,
}: ChatEmptyStateProps) {
  const { t } = useTranslation();

  return (
    <div className="ai-chat-empty" data-testid="ai-chat-empty">
      <div className="ai-chat-empty-hero">
        <RobotOutlined />
      </div>
      <div className="ai-chat-empty-title">{t('common.aiChat.emptyTitle')}</div>
      <div className="ai-chat-empty-hint">
        {hasContext
          ? t('common.aiChat.emptyHint', { name: contextName ?? '' })
          : t('common.aiChat.emptyHintNoContext')}
      </div>
      <div className="ai-quick-grid">
        {actions.map((action) => (
          <div key={action.key} className="ai-quick-cell" data-testid={`ai-quick-${action.key}`}>
            <QuickActionTile action={action} variant="tile" onAction={onAction} />
          </div>
        ))}
      </div>
    </div>
  );
}

interface QuickActionMenuProps {
  actions: QuickAction[];
  onAction: (action: QuickAction, target?: string) => void;
}

/** 输入区的快捷指令菜单：选中后把提示词填入输入框（不直接发送） */
export function QuickActionMenu({ actions, onAction }: QuickActionMenuProps) {
  return (
    <div className="ai-quick-menu" data-testid="ai-quick-menu">
      {actions.map((action) => (
        <QuickActionTile
          key={action.key}
          action={action}
          variant="menu"
          onAction={(a, target) => onAction({ ...a, autoSend: false }, target)}
        />
      ))}
    </div>
  );
}
