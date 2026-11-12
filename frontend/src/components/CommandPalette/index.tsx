import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MacCommandOutlined } from '@ant-design/icons';

export interface Command {
  id: string;
  label: string;
  description?: string;
  shortcut?: string;
  category?: string;
  /** 可选图标：默认显示命令图标 */
  icon?: React.ReactNode;
  action: () => void | Promise<void>;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: Command[];
}

const LISTBOX_ID = 'command-palette-list';

/** 高亮命令文本里命中的搜索词 */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q) return <>{text}</>;
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark
        style={{
          background: 'var(--color-primary-alpha-15)',
          color: 'inherit',
          borderRadius: 3,
          padding: '0 1px',
        }}
      >
        {text.slice(index, index + q.length)}
      </mark>
      {text.slice(index + q.length)}
    </>
  );
}

/** 键帽样式（底部提示与行内快捷键共用） */
const kbdStyle: React.CSSProperties = {
  fontFamily: 'var(--font-family-code)',
  fontSize: 10.5,
  lineHeight: '16px',
  padding: '0 5px',
  borderRadius: 4,
  border: '1px solid var(--border-color)',
  background: 'var(--background-toolbar)',
  color: 'var(--text-tertiary)',
  whiteSpace: 'nowrap',
};

export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const filteredCommands = useMemo(() => {
    if (!search.trim()) return commands;
    const q = search.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.description?.toLowerCase().includes(q) ||
        cmd.category?.toLowerCase().includes(q)
    );
  }, [commands, search]);

  // 按 category 分组，同时保留「全局下标」用于键盘导航
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, { cmd: Command; index: number }[]>();
    filteredCommands.forEach((cmd, index) => {
      const key = cmd.category || t('common.commands');
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push({ cmd, index });
    });
    return order.map((key) => ({ key, items: map.get(key)! }));
  }, [filteredCommands, t]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- 打开面板时重置搜索词与选中项
      setSearch('');
      setSelectedIndex(0);
      // 等浮层挂载后再聚焦，避免首帧焦点丢失
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 搜索词变化后选中项回到第一项
    setSelectedIndex(0);
  }, [search]);

  // 键盘选中项滚入视野（列表可能很长）
  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const executeCommand = useCallback(
    (command: Command) => {
      onClose();
      setTimeout(() => command.action(), 50);
    },
    [onClose]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredCommands.length - 1));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredCommands[selectedIndex]) executeCommand(filteredCommands[selectedIndex]);
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredCommands, selectedIndex, executeCommand, onClose]
  );

  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'var(--mask)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '14vh',
      }}
      onClick={onClose}
    >
      <div
        data-testid="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('common.searchCommands')}
        onKeyDown={handleKeyDown}
        onMouseDown={(e) => {
          // 点击面板空白/分组标题不丢焦点，方向键/Enter/Esc 继续可用
          if (!(e.target as HTMLElement).closest('input,button,[role="option"]')) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }}
        style={{
          width: 640,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: '62vh',
          background: 'var(--surface-elevated)',
          border: '1px solid var(--border-color)',
          borderRadius: 14,
          boxShadow: 'var(--shadow-overlay)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 搜索区：整行可输入，右侧 ESC 键帽 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 16px',
            height: 52,
            borderBottom: '1px solid var(--border-color)',
            flexShrink: 0,
          }}
        >
          <SearchIcon />
          <input
            ref={inputRef}
            data-testid="command-palette-input"
            role="combobox"
            aria-expanded="true"
            aria-controls={LISTBOX_ID}
            aria-activedescendant={
              filteredCommands[selectedIndex] ? `cmd-${filteredCommands[selectedIndex].id}` : undefined
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('common.searchCommands')}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 15,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-family)',
            }}
          />
          <span style={kbdStyle}>ESC</span>
        </div>

        {/* 结果区：分组 + 图标胶囊 + 描述 */}
        <div
          id={LISTBOX_ID}
          role="listbox"
          aria-label={t('common.commands')}
          style={{ flex: 1, overflowY: 'auto', padding: '6px 8px 10px' }}
        >
          {filteredCommands.length === 0 ? (
            <div
              style={{
                padding: '40px 16px',
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontSize: 12.5,
              }}
            >
              <div style={{ fontSize: 22, marginBottom: 8, opacity: 0.5 }}>
                <SearchIcon size={22} />
              </div>
              {t('common.noCommandsFound')}
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key}>
                <div
                  style={{
                    padding: '8px 10px 4px',
                    fontSize: 10.5,
                    letterSpacing: '0.4px',
                    color: 'var(--text-tertiary)',
                    userSelect: 'none',
                  }}
                >
                  {group.key}
                </div>
                {group.items.map(({ cmd, index }) => {
                  const active = index === selectedIndex;
                  return (
                    <div
                      key={cmd.id}
                      id={`cmd-${cmd.id}`}
                      role="option"
                      aria-selected={active}
                      ref={(el) => {
                        itemRefs.current[index] = el;
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      onClick={() => executeCommand(cmd)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '9px 10px',
                        borderRadius: 8,
                        cursor: 'pointer',
                        background: active ? 'var(--row-selected-bg)' : 'transparent',
                        boxShadow: active
                          ? 'inset 0 0 0 1px var(--color-primary-alpha-30)'
                          : 'none',
                      }}
                    >
                      <span
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 7,
                          flexShrink: 0,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 13,
                          background: active
                            ? 'var(--color-primary-alpha-15)'
                            : 'var(--background-hover)',
                          color: active ? 'var(--color-primary)' : 'var(--text-secondary)',
                        }}
                      >
                        {cmd.icon || <MacCommandOutlined />}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            fontWeight: 500,
                            color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          <Highlight text={cmd.label} query={search} />
                        </div>
                        {cmd.description && (
                          <div
                            style={{
                              fontSize: 11.5,
                              color: 'var(--text-tertiary)',
                              marginTop: 1,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            <Highlight text={cmd.description} query={search} />
                          </div>
                        )}
                      </div>
                      {cmd.shortcut && <span style={kbdStyle}>{cmd.shortcut}</span>}
                      {active && (
                        <span style={{ ...kbdStyle, background: 'transparent', border: 'none' }}>↵</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* 底部：键盘提示 + 结果计数 */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: '8px 14px',
            borderTop: '1px solid var(--border-color)',
            background: 'var(--background-toolbar)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            flexShrink: 0,
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={kbdStyle}>↑</span>
            <span style={kbdStyle}>↓</span>
            {t('common.paletteNav')}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={kbdStyle}>↵</span>
            {t('common.paletteRun')}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={kbdStyle}>esc</span>
            {t('common.paletteClose')}
          </span>
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-family-code)', color: 'var(--text-secondary)' }}>
              {filteredCommands.length}
            </span>
            <span>{t('common.paletteCount')}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

/** 内联放大镜图标：避免依赖 antd 图标在浮层内的对齐差异 */
function SearchIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export default CommandPalette;
