import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Events, Window } from '@wailsio/runtime';
import { Empty, Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

/**
 * 托盘「快速连接」二级面板（独立小窗口，/#conn-picker 路由）。
 *
 * 连接多时长菜单不可用，改为可搜索 + 可滚动的选择面板：
 * - 每次显示时（conn-picker:open / 首次挂载）向主窗口请求最新连接列表
 * - 搜索过滤 名称/IP/类型，↑↓ 选择、Enter 或点击连接
 * - 连接动作复用 tray-connect 事件（主窗口 handleConnect + 聚焦），
 *   面板自身随即隐藏（WindowClosing 钩子统一转为 Hide，保持热态）
 */

interface PickerConnection {
  id: string;
  name: string;
  db_type: string;
  host: string;
  port: number;
  status: string;
}

export function ConnPicker() {
  const [connections, setConnections] = useState<PickerConnection[]>([]);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 本窗口不运行主界面主题体系，按系统偏好设置基础变量
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
    };
    applyTheme();
    mq.addEventListener('change', applyTheme);

    const requestData = () => {
      Events.Emit('conn-picker:request-data').catch(() => {});
    };
    const offData = Events.On('conn-picker:data', (ev) => {
      const list = ev.data as PickerConnection[] | null;
      if (Array.isArray(list)) setConnections(list);
    });
    // 再次显示时重置搜索并刷新数据
    const offOpen = Events.On('conn-picker:open', () => {
      setQuery('');
      setActiveIndex(0);
      requestData();
    });
    requestData();

    return () => {
      offData();
      offOpen();
      mq.removeEventListener('change', applyTheme);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return connections;
    return connections.filter((c) =>
      `${c.name} ${c.host} ${c.db_type}`.toLowerCase().includes(q)
    );
  }, [connections, query]);

  const connectAndHide = useCallback((id: string) => {
    Events.Emit('tray-connect', id).catch(() => {});
    Window.Close().catch(() => {});
  }, []);

  // 键盘导航 + 滚动跟随
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => {
          const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
          const clamped = Math.max(0, Math.min(filtered.length - 1, next));
          listRef.current
            ?.querySelector(`[data-idx="${clamped}"]`)
            ?.scrollIntoView({ block: 'nearest' });
          return clamped;
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = filtered[activeIndex];
        if (target) connectAndHide(target.id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        Window.Close().catch(() => {});
      }
    },
    [filtered, activeIndex, connectAndHide]
  );

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: 12,
        gap: 8,
        background: 'var(--background-card)',
      }}
      onKeyDown={handleKeyDown}
    >
      <Input
        autoFocus
        allowClear
        placeholder="搜索连接（名称 / IP / 类型），↑↓ 选择，回车连接"
        prefix={<SearchOutlined style={{ color: 'var(--color-text-tertiary)' }} />}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActiveIndex(0); // 搜索变化回到首项
        }}
      />
      <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的连接" />
          </div>
        ) : (
          filtered.map((c, i) => (
            <div
              key={c.id}
              data-idx={i}
              onClick={() => connectAndHide(c.id)}
              onMouseEnter={() => setActiveIndex(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 10px',
                borderRadius: 6,
                cursor: 'pointer',
                background: i === activeIndex ? 'var(--row-selected-bg)' : 'transparent',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background:
                    c.status === 'connected' ? 'var(--color-success)' : 'var(--color-text-quaternary)',
                }}
              />
              <span style={{ flexShrink: 0, fontSize: 11, padding: '1px 6px', borderRadius: 4, background: 'var(--background-toolbar)', color: 'var(--color-text-secondary)' }}>
                {c.db_type.toUpperCase()}
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text)' }}>
                {c.name}
              </span>
              <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                {c.host}:{c.port}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
