import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button } from 'antd';
import { DeleteOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { useAIChatStore } from '../../stores/aiChatStore';

interface PanelErrorBoundaryProps {
  children: ReactNode;
}

interface PanelErrorBoundaryState {
  error: Error | null;
}

interface PanelErrorFallbackProps {
  error: Error;
  onRetry: () => void;
}

function PanelErrorFallback({ error, onRetry }: PanelErrorFallbackProps) {
  const { t } = useTranslation();
  return (
    <div className="ai-chat-center" data-testid="ai-chat-error-boundary">
      <div className="ai-chat-error-icon">
        <WarningOutlined />
      </div>
      <div className="ai-chat-empty-title">{t('common.aiChat.panelErrorTitle')}</div>
      <div className="ai-chat-empty-hint">{t('common.aiChat.panelErrorHint')}</div>
      <pre className="ai-chat-error-detail">{error.message || String(error)}</pre>
      <div className="ai-chat-error-actions">
        <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry}>
          {t('common.aiChat.reloadPanel')}
        </Button>
        <Button
          icon={<DeleteOutlined />}
          onClick={() => {
            useAIChatStore.getState().clearMessages();
            onRetry();
          }}
        >
          {t('common.aiChat.newChat')}
        </Button>
      </div>
    </div>
  );
}

/**
 * AI 面板的局部错误边界。
 * 模型输出是外部内容，Markdown/代码块渲染或上下文统计一旦抛错，只影响面板自身，
 * 不把整个主界面一起带崩；提供「重新加载」与「清空对话」两个出口。
 */
export class PanelErrorBoundary extends Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  state: PanelErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('AI panel render error:', error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <PanelErrorFallback error={this.state.error} onRetry={() => this.setState({ error: null })} />
    );
  }
}
