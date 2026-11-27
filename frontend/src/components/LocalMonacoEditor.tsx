import { useEffect, useState } from 'react';
import { Button } from 'antd';
import Editor from '@monaco-editor/react';
import type { EditorProps } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../hooks/useThemeColors';
import { loadMonaco } from '../utils/monacoLoader';
import { appMonacoThemeName, applyAppMonacoTheme } from '../utils/appMonacoTheme';
import { getErrorMessage } from '../utils/getErrorMessage';

type MonacoModule = typeof Monaco;

/** 一轮加载（含重试）的结果，连同当时的尝试序号 */
interface LoadResult {
  attempt: number;
  monaco: MonacoModule | null;
  error: string | null;
}

const placeholderStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  color: 'var(--text-tertiary)',
  fontSize: 12,
};

/**
 * 应用里所有 Monaco 编辑器的入口：等本地打包的 Monaco 就绪后再挂载 <Editor>。
 *
 * @monaco-editor/react 的 <Editor> 挂载时就去向 loader 要 Monaco，默认从 CDN 加载；
 * 必须先由 loadMonaco 把本地实例交给 loader，再渲染 <Editor>（见 utils/monacoLoader）。
 * 同时统一主题：Monaco 的主题是全局的，所有编辑器用同一套应用配色。
 */
export function LocalMonacoEditor(props: EditorProps) {
  const { t } = useTranslation();
  const tc = useThemeColors();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  // 序号对不上说明这一轮还没结束（比如正在重试）：按加载中处理
  const settled = result?.attempt === attempt ? result : null;
  const monaco = settled?.monaco ?? null;
  const error = settled?.error ?? null;

  useEffect(() => {
    if (!monaco) return;
    applyAppMonacoTheme(monaco, tc);
  }, [monaco, tc]);

  useEffect(() => {
    let alive = true;
    loadMonaco().then(
      (mod) => {
        if (alive) setResult({ attempt, monaco: mod, error: null });
      },
      (err: unknown) => {
        if (alive) setResult({ attempt, monaco: null, error: getErrorMessage(err) });
      }
    );
    return () => {
      alive = false;
    };
  }, [attempt]);

  if (!monaco) {
    const { height } = props;
    const resolvedHeight = typeof height === 'number' ? `${height}px` : (height ?? '100%');
    return (
      <div style={{ ...placeholderStyle, height: resolvedHeight }}>
        {error ? (
          <>
            <span>
              {t('common.monacoEditor.loadFailed')}: {error}
            </span>
            <Button size="small" onClick={() => setAttempt((n) => n + 1)}>
              {t('common.monacoEditor.retry')}
            </Button>
          </>
        ) : (
          t('common.loading')
        )}
      </div>
    );
  }

  return <Editor theme={appMonacoThemeName(tc.isDark)} {...props} />;
}
