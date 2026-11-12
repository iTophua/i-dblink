/**
 * ErrorBoundary — 渲染期异常兜底
 *
 * 没有边界时任何组件抛错都会让整棵 React 树卸载，表现为整页空白且无从排查。
 * 这里捕获渲染错误，展示可复制的错误信息/组件栈，并提供重新加载入口。
 */
import React from 'react';
import { Button, Space, App } from 'antd';
import { CopyOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string;
}

interface CrashFallbackProps {
  error: Error;
  componentStack: string;
}

function CrashFallback({ error, componentStack }: CrashFallbackProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();

  const details = [error.message, error.stack, componentStack].filter(Boolean).join('\n\n');

  return (
    <div className="app-error-boundary">
      <WarningOutlined className="app-error-icon" />
      <div className="app-error-title">{t('common.errorBoundary.title')}</div>
      <div className="app-error-desc">{t('common.errorBoundary.description')}</div>
      <pre className="app-error-detail">{details}</pre>
      <Space size={8}>
        <Button
          icon={<CopyOutlined />}
          onClick={() => {
            navigator.clipboard.writeText(details).then(
              () => message.success(t('common.copied')),
              () => message.error(t('common.copyFailed'))
            );
          }}
        >
          {t('common.errorBoundary.copy')}
        </Button>
        <Button type="primary" icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
          {t('common.errorBoundary.reload')}
        </Button>
      </Space>
    </div>
  );
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null, componentStack: '' };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 同时写入控制台，方便开发者在 Web Inspector 里查看完整信息
    console.error('[UI ErrorBoundary]', error, info.componentStack);
    this.setState({ componentStack: info.componentStack || '' });
  }

  render() {
    const { error, componentStack } = this.state;
    if (error) {
      return <CrashFallback error={error} componentStack={componentStack} />;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
