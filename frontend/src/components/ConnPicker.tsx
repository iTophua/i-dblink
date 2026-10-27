import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Events, Window } from '@wailsio/runtime';
import { Empty, Input } from 'antd';
import { SearchOutlined } from '@ant-design/icons';

/**
 * 托盘快速连接面板（左键点托盘图标弹出的紧凑面板，AttachWindow 模式）。
 *
 * - 可搜索（名称/IP/类型）+ 可滚动 + 分组展示，替代长级联菜单
 * - 每次显示（focus/visibilitychange）重置搜索并拉最新数据
 * - Enter/点击连接（复用 tray-connect 事件），Esc/失焦自动隐藏（窗口级
 *   HideOnFocusLost），面板常驻仅隐藏保持热态
 */

interface PickerConnection {
  id: string;
  name: string;
  db_type: string;
  host: string;
  port: number;
  status: string;
  group_id?: string | null;
}

interface PickerGroup {
  id: string;
  name: string;
}

export function ConnPicker() {
  const [connections, setConnections] = useState<PickerConnection[]>([]);
  const [groups, setGroups] = useState<PickerGroup[]>([]);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const queryRef = useRef('');

  const requestData = useCallback(() => {
    Events.Emit('conn-picker:request-data').catch(() => {});
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
    };
    applyTheme();
    mq.addEventListener('change', applyTheme);

    const offData = Events.On('conn-picker:data', (ev) => {
      const payload = ev.data as
        | { connections: PickerConnection[]; groups: PickerGroup[] }
        | null;
      if (payload && Array.isArray(payload.connections)) {
        setConnections(payload.connections);
        setGroups(payload.groups || []);
      }
    });

    // 面板每次显示（托盘点击）都会触发 focus/visibilitychange → 重置并刷新
    const onWake = () => {
      if (document.visibilityState !== 'visible') return;
      if (queryRef.current) {
        queryRef.current = '';
        setQuery('');
        setActiveIndex(0);
      }
      requestData();
    };
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);

    requestData();
    return () => {
      offData();
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
      mq.removeEventListener('change', applyTheme);
    };
  }, [requestData]);

  const sections = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (c: PickerConnection) =>
      !q || `${c.name} ${c.host} ${c.db_type}`.toLowerCase().includes(q);
    const result: Array<{ key: string; title?: string; items: PickerConnection[] }> = [];
    for (const g of groups) {
      const items = connections.filter((c) => c.group_id === g.id && match(c));
      if (items.length > 0) result.push({ key: `g-${g.id}`, title: g.name, items });
    }
    const ungrouped = connections.filter(
      (c) => !c.group_id || !groups.some((g) => g.id === c.group_id)
    );
    const items = ungrouped.filter(match);
    if (items.length > 0) result.push({ key: 'g-none', items });
    return result;
  }, [connections, groups, query]);

  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);

  const connectAndHide = useCallback((id: string) => {
    Events.Emit('tray-connect', id).catch(() => {});
    Window.Hide().catch(() => {});
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => {
          const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
          const clamped = Math.max(0, Math.min(flat.length - 1, next));
          listRef.current
            ?.querySelector(`[data-idx="${clamped}"]`)
            ?.scrollIntoView({ block: 'nearest' });
          return clamped;
        });
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const target = flat[activeIndex];
        if (target) connectAndHide(target.id);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        Window.Hide().catch(() => {});
      }
    },
    [flat, activeIndex, connectAndHide]
  );

  let rowIdx = -1;

  return (
    <div
      style={{ height: '100vh', padding: 8, boxSizing: 'border-box' }}
      onKeyDown={handleKeyDown}
    >
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          borderRadius: 12,
          border: '1px solid var(--border)',
          background: 'var(--background-card)',
          boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
          <Input
            autoFocus
            allowClear
            size="small"
            placeholder="搜索连接，回车连接"
            prefix={<SearchOutlined style={{ color: 'var(--color-text-tertiary)' }} />}
            value={query}
            onChange={(e) => {
              queryRef.current = e.target.value;
              setQuery(e.target.value);
              setActiveIndex(0); // 搜索变化回到首项
            }}
          />
        </div>
        <div ref={listRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 6 }}>
          {flat.length === 0 ? (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的连接" />
            </div>
          ) : (
            sections.map((sec) => (
              <div key={sec.key}>
                {sec.title && (
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--color-text-tertiary)',
                      padding: '6px 8px 2px',
                    }}
                  >
                    {sec.title}
                  </div>
                )}
                {sec.items.map((c) => {
                  rowIdx += 1;
                  const idx = rowIdx;
                  return (
                    <div
                      key={c.id}
                      data-idx={idx}
                      onClick={() => connectAndHide(c.id)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '6px 8px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        background:
                          idx === activeIndex ? 'var(--row-selected-bg)' : 'transparent',
                      }}
                    >
                      <span
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background:
                            c.status === 'connected'
                              ? 'var(--color-success)'
                              : 'var(--color-text-quaternary)',
                        }}
                      />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--color-text)', fontSize: 13 }}>
                        {c.name}
                      </span>
                      <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                        {c.host}:{c.port}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div
          style={{
            padding: '4px 10px',
            borderTop: '1px solid var(--border)',
            fontSize: 11,
            color: 'var(--color-text-quaternary)',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <span>{connections.length} 个连接</span>
          <span>↑↓ 选择 · 回车连接 · Esc 关闭</span>
        </div>
      </div>
    </div>
  );
}
