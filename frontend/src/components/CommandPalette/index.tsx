import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Input, List, Empty } from 'antd';
import type { InputRef } from 'antd';
import { SearchOutlined, MacCommandOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';

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

export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<InputRef>(null);

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

  useEffect(() => {
    if (open) {
      setSearch('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [search]);

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
          if (filteredCommands[selectedIndex]) {
            executeCommand(filteredCommands[selectedIndex]);
          }
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
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1000,
        // 遮罩明暗各取适度（demo omnibox 同款），不再固定半黑
        background: 'light-dark(rgba(28, 36, 54, 0.32), rgba(3, 6, 12, 0.55))',
        display: 'flex',
        justifyContent: 'center',
        paddingTop: 100,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 560,
          maxHeight: 400,
          // 原引用的 --background-primary 是未定义变量（面板底色失效），
          // 改为卡片底 + 发丝边（demo omnibox 形态）
          background: 'var(--background-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-lg, 0 8px 24px rgba(0, 0, 0, 0.2))',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <Input
            ref={inputRef}
            prefix={<SearchOutlined style={{ color: 'var(--text-tertiary)' }} />}
            placeholder={t('common.searchCommands')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            variant="borderless"
            style={{
              fontSize: 16,
              background: 'transparent',
            }}
          />
        </div>

        <div style={{ flex: 1, overflow: 'auto' }}>
          {filteredCommands.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={t('common.noCommandsFound')}
              style={{ padding: 40 }}
            />
          ) : (
            <List
              dataSource={filteredCommands}
              renderItem={(command, index) => (
                <List.Item
                  style={{
                    padding: '10px 16px',
                    cursor: 'pointer',
                    background: index === selectedIndex ? 'var(--row-selected-bg)' : 'transparent',
                    borderLeft:
                      index === selectedIndex
                        ? '2px solid var(--color-primary)'
                        : '2px solid transparent',
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onClick={() => executeCommand(command)}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ color: 'var(--text-tertiary)', fontSize: 12, display: 'inline-flex' }}>
                        {command.icon || <MacCommandOutlined />}
                      </span>
                      <span style={{ fontWeight: 500 }}>{command.label}</span>
                      {command.shortcut && (
                        <span
                          style={{
                            fontSize: 11,
                            color: 'var(--text-tertiary)',
                            background: 'var(--background-hover)',
                            padding: '2px 6px',
                            borderRadius: 4,
                          }}
                        >
                          {command.shortcut}
                        </span>
                      )}
                    </div>
                    {command.description && (
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--text-secondary)',
                          marginTop: 2,
                          marginLeft: 20,
                        }}
                      >
                        {command.description}
                      </div>
                    )}
                  </div>
                </List.Item>
              )}
            />
          )}
        </div>

        <div
          style={{
            padding: '8px 16px',
            borderTop: '1px solid var(--border-color)',
            fontSize: 11,
            color: 'var(--text-tertiary)',
            display: 'flex',
            gap: 16,
          }}
        >
          <span>{t('common.navigateUpDown')}</span>
          <span>{t('common.executeEnter')}</span>
          <span>{t('common.closeEsc')}</span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
