import { useCallback, useEffect, useRef, useState } from 'react';
import { Events } from '@wailsio/runtime';
import { Button, Spin, Tabs, TabsProps, Tag, Typography } from 'antd';
import { ExclamationCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { ResultGrid } from './SQLEditor/ResultGrid';
import { applyThemeVars } from '../styles/applyTheme';
import { useSettingsStore } from '../stores/settingsStore';
import type { DatabaseType } from '../types/api';

/**
 * 独立「查询结果」弹窗（Wails v3 多窗口）。
 *
 * 入口：后端 OpenResultPopup 创建窗口，URL 为 /#popup/<popupId>；
 * main.tsx 按 hash 路由到本组件（不加载主界面/主窗口副作用）。
 *
 * 数据流：挂载后 Events.Emit('popup-result:request', popupId)，
 * 源 SQLEditor（同应用主窗口）持有该 popupId 则以
 * popup-result:data:<popupId> 推送当前结果集快照（一次性，无后续同步）。
 */

interface PopupResultItem {
  columns: Array<{ name: string }>;
  rows: Array<Record<string, unknown>>;
  executionTime?: number;
  [k: string]: unknown;
}

interface PopupPayload {
  title: string;
  sql?: string;
  dbType?: DatabaseType;
  results: PopupResultItem[];
}

const WAIT_TIMEOUT_MS = 3000;

export function ResultPopup() {
  const { t } = useTranslation();
  const popupId = window.location.hash.replace(/^#popup\//, '');
  const [payload, setPayload] = useState<PopupPayload | null>(null);
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark'
  );
  const [timedOut, setTimedOut] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gotDataRef = useRef(false);

  // 主题：复用主窗口的设置与 applyThemeVars，而不是只看系统偏好
  useEffect(() => {
    const apply = () => {
      const { themeMode, themePreset } = useSettingsStore.getState().settings;
      const { effectiveMode } = applyThemeVars(themeMode, themePreset);
      setIsDark(effectiveMode === 'dark');
    };
    apply();
    const offHydration = useSettingsStore.persist.onFinishHydration(apply);
    const unsubscribe = useSettingsStore.subscribe(apply);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystemChange = () => {
      if (useSettingsStore.getState().settings.themeMode === 'system') apply();
    };
    mq.addEventListener('change', onSystemChange);
    return () => {
      offHydration();
      unsubscribe();
      mq.removeEventListener('change', onSystemChange);
    };
  }, []);

  const requestData = useCallback(() => {
    gotDataRef.current = false;
    setTimedOut(false);
    setPayload(null);
    Events.Emit('popup-result:request', popupId).catch(() => {});
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      if (!gotDataRef.current) setTimedOut(true);
    }, WAIT_TIMEOUT_MS);
  }, [popupId]);

  useEffect(() => {
    const off = Events.On(`popup-result:data:${popupId}`, (ev) => {
      const data = ev.data as PopupPayload | null;
      if (data && Array.isArray(data.results)) {
        gotDataRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        setTimedOut(false);
        setPayload(data);
      }
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 挂载后向源窗口请求数据快照
    requestData();
    return () => {
      off();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [popupId, requestData]);

  if (!payload) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--background)',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 10,
            color: 'var(--text-secondary)',
            fontSize: 13,
            textAlign: 'center',
          }}
        >
          {timedOut ? (
            <>
              <ExclamationCircleOutlined
                style={{ fontSize: 24, color: 'var(--color-warning)' }}
              />
              <span>{t('common.resultPopup.timeout')}</span>
              <Button size="small" icon={<ReloadOutlined />} onClick={requestData}>
                {t('common.resultPopup.retry')}
              </Button>
            </>
          ) : (
            <>
              <Spin />
              <span>{t('common.resultPopup.waiting')}</span>
            </>
          )}
        </div>
      </div>
    );
  }

  const totalRows = payload.results.reduce((sum, result) => sum + (result.rows?.length ?? 0), 0);
  const tabItems: TabsProps['items'] = payload.results.map((result, index) => ({
    key: `r-${index}`,
    label: t('common.resultPopup.resultTab', {
      index: index + 1,
      count: result.rows?.length ?? 0,
    }),
    children: (
      <div style={{ height: '100%', minHeight: 0, padding: '0 8px 8px' }}>
        <ResultGrid
          queryResult={result as never}
          isDark={isDark}
          executionTime={result.executionTime}
        />
      </div>
    ),
  }));

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--background)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          height: 44,
          padding: '0 12px',
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
          background: 'var(--background-toolbar)',
        }}
      >
        <Typography.Text
          strong
          ellipsis={{ tooltip: payload.title }}
          style={{ fontSize: 13, minWidth: 0 }}
        >
          {payload.title || t('common.resultPopup.title')}
        </Typography.Text>
        <Tag bordered={false} style={{ marginInlineEnd: 0, fontSize: 10 }}>
          {payload.results.length}
        </Tag>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
          {t('common.resultPopup.totalRows', { count: totalRows })}
        </span>
      </div>

      {payload.results.length > 1 ? (
        <Tabs
          type="card"
          size="small"
          style={{ flex: 1, minHeight: 0, padding: '4px 8px 0' }}
          items={tabItems}
        />
      ) : (
        <div style={{ flex: 1, minHeight: 0, padding: '4px 8px 8px' }}>
          <ResultGrid
            queryResult={payload.results[0] as never}
            isDark={isDark}
            executionTime={payload.results[0]?.executionTime}
          />
        </div>
      )}
    </div>
  );
}
