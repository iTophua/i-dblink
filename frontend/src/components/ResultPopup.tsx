import { useEffect, useState } from 'react';
import { Events } from '@wailsio/runtime';
import { Empty, Tabs, TabsProps } from 'antd';
import { ResultGrid } from './SQLEditor/ResultGrid';
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

export function ResultPopup() {
  const popupId = window.location.hash.replace(/^#popup\//, '');
  const [payload, setPayload] = useState<PopupPayload | null>(null);
  const [isDark, setIsDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    // 本窗口不运行主界面的完整主题体系，按系统偏好设置基础主题变量
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      setIsDark(mq.matches);
      document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
    };
    applyTheme();
    mq.addEventListener('change', applyTheme);

    const off = Events.On(`popup-result:data:${popupId}`, (ev) => {
      const data = ev.data as PopupPayload | null;
      if (data && Array.isArray(data.results)) setPayload(data);
    });
    // 向主窗口请求本弹窗的数据快照
    Events.Emit('popup-result:request', popupId).catch(() => {});

    return () => {
      off();
      mq.removeEventListener('change', applyTheme);
    };
  }, [popupId]);

  if (!payload) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="等待源窗口推送结果…" />
      </div>
    );
  }

  const tabItems: TabsProps['items'] = payload.results.map((r, i) => ({
    key: `r-${i}`,
    label: `结果 ${i + 1} (${r.rows?.length ?? 0} 行)`,
    children: (
      <div style={{ height: 'calc(100vh - 44px)', padding: '0 8px 8px' }}>
        <ResultGrid
          queryResult={r as never}
          isDark={isDark}
          executionTime={r.executionTime}
        />
      </div>
    ),
  }));

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {payload.results.length > 1 ? (
        <Tabs type="card" size="small" style={{ padding: '4px 8px 0' }} items={tabItems} />
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
