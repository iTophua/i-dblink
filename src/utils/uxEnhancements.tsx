import React, { useState, useEffect, useCallback } from 'react';
import { Modal, Card, Typography, Space, Tag, Divider, theme } from 'antd';
import {
  ThunderboltOutlined,
  BellOutlined,
  SearchOutlined,
  PlusOutlined,
  ReloadOutlined,
  FullscreenOutlined,
  SunOutlined,
  MoonOutlined,
  SaveOutlined,
  CloseOutlined,
  CopyOutlined,
  EditOutlined,
  EnterOutlined,
  SettingOutlined,
  FolderOpenOutlined,
  MinusOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;

interface ShortcutCategory {
  title: string;
  shortcuts: ShortcutItem[];
}

interface ShortcutItem {
  keys: string[];
  description: string;
  icon?: React.ReactNode;
}

export const keyboardShortcuts: ShortcutCategory[] = [
  {
    title: '文件操作',
    shortcuts: [
      { keys: ['⌘', 'N'], description: '新建连接', icon: <PlusOutlined /> },
      { keys: ['⌘', 'S'], description: '保存', icon: <SaveOutlined /> },
      { keys: ['⌘', 'O'], description: '打开连接', icon: <FolderOpenOutlined /> },
      { keys: ['⌘', 'W'], description: '关闭标签页', icon: <CloseOutlined /> },
    ],
  },
  {
    title: '查询操作',
    shortcuts: [
      { keys: ['⌘', '↵'], description: '执行查询', icon: <ThunderboltOutlined /> },
      { keys: ['⌘', 'Shift', 'N'], description: '新建查询', icon: <PlusOutlined /> },
      { keys: ['⌘', 'K'], description: '格式化 SQL', icon: <EditOutlined /> },
    ],
  },
  {
    title: '视图操作',
    shortcuts: [
      { keys: ['⌘', 'R'], description: '刷新', icon: <ReloadOutlined /> },
      { keys: ['F11'], description: '全屏切换', icon: <FullscreenOutlined /> },
      { keys: ['⌘', '='], description: '放大', icon: <PlusOutlined /> },
      { keys: ['⌘', '-'], description: '缩小', icon: <MinusOutlined /> },
    ],
  },
  {
    title: '编辑操作',
    shortcuts: [
      { keys: ['⌘', 'Z'], description: '撤销' },
      { keys: ['⌘', 'Shift', 'Z'], description: '重做' },
      { keys: ['⌘', 'C'], description: '复制', icon: <CopyOutlined /> },
      { keys: ['⌘', 'V'], description: '粘贴' },
      { keys: ['⌘', 'A'], description: '全选' },
      { keys: ['⌘', 'F'], description: '查找', icon: <SearchOutlined /> },
    ],
  },
  {
    title: '标签页操作',
    shortcuts: [
      { keys: ['⌘', 'Tab'], description: '切换到下一个标签' },
      { keys: ['⌘', 'Shift', 'Tab'], description: '切换到上一个标签' },
      { keys: ['⌘', 'W'], description: '关闭当前标签' },
    ],
  },
  {
    title: '系统设置',
    shortcuts: [
      { keys: ['⌘', ','], description: '打开设置', icon: <SettingOutlined /> },
      { keys: ['⌘', 'Shift', 'L'], description: '切换主题', icon: <MoonOutlined /> },
    ],
  },
];

interface KeyboardShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({ open, onClose }) => {
  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';

  return (
    <Modal
      title={
        <Space>
          <BellOutlined />
          <span>键盘快捷键</span>
        </Space>
      }
      open={open}
      onCancel={onClose}
      footer={null}
      width={680}
      centered
      transitionName=""
      maskTransitionName=""
    >
      <div
        style={{
          maxHeight: 500,
          overflowY: 'auto',
          padding: '8px 0',
        }}
      >
        {keyboardShortcuts.map((category, categoryIndex) => (
          <div key={categoryIndex} style={{ marginBottom: 16 }}>
            <Text
              strong
              style={{
                fontSize: 13,
                color: 'var(--color-primary)',
                marginBottom: 8,
                display: 'block',
              }}
            >
              {category.title}
            </Text>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 8,
              }}
            >
              {category.shortcuts.map((shortcut, shortcutIndex) => (
                <div
                  key={shortcutIndex}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    background: 'var(--background-toolbar)',
                    borderRadius: 6,
                    border: '1px solid var(--border)',
                  }}
                >
                  <Space size={4}>
                    {shortcut.icon}
                    <Text style={{ fontSize: 12 }}>{shortcut.description}</Text>
                  </Space>
                  <Space size={2}>
                    {shortcut.keys.map((key, keyIndex) => (
                      <React.Fragment key={keyIndex}>
                        <Tag
                          style={{
                            margin: 0,
                            padding: '0 6px',
                            fontSize: 11,
                            fontFamily: 'SF Mono, Monaco, Inconsolata, monospace',
                            background: 'var(--background-card)',
                            border: '1px solid var(--border-light)',
                          }}
                        >
                          {key}
                        </Tag>
                        {keyIndex < shortcut.keys.length - 1 && (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>+</span>
                        )}
                      </React.Fragment>
                    ))}
                  </Space>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
};

export const useKeyboardShortcuts = (handlers: Record<string, () => void>) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const key: string[] = [];
      if (e.metaKey || e.ctrlKey) key.push('meta');
      if (e.shiftKey) key.push('shift');
      if (e.altKey) key.push('alt');
      if (e.key !== 'Control' && e.key !== 'Meta' && e.key !== 'Shift' && e.key !== 'Alt') {
        key.push(e.key.toLowerCase());
      }

      const keyCombo = key.join('+');

      for (const [combo, handler] of Object.entries(handlers)) {
        const comboParts = combo.split('+');
        const isMatch =
          comboParts.length === key.length &&
          comboParts.every((part) => key.includes(part.toLowerCase()));

        if (isMatch) {
          e.preventDefault();
          handler();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
};

export const useConnectionAnimation = () => {
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'connecting' | 'success' | 'error'>('idle');

  const startConnecting = useCallback(() => {
    setConnectionStatus('connecting');
  }, []);

  const connectionSuccess = useCallback(() => {
    setConnectionStatus('success');
    setTimeout(() => setConnectionStatus('idle'), 2000);
  }, []);

  const connectionError = useCallback(() => {
    setConnectionStatus('error');
    setTimeout(() => setConnectionStatus('idle'), 3000);
  }, []);

  return { connectionStatus, startConnecting, connectionSuccess, connectionError };
};

export const ConnectionStatusIndicator: React.FC<{ status: 'idle' | 'connecting' | 'success' | 'error' }> = ({
  status,
}) => {
  const getStatusColor = () => {
    switch (status) {
      case 'connecting':
        return 'var(--color-warning)';
      case 'success':
        return 'var(--color-success)';
      case 'error':
        return 'var(--color-error)';
      default:
        return 'var(--text-disabled)';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'connecting':
        return '连接中...';
      case 'success':
        return '已连接';
      case 'error':
        return '连接失败';
      default:
        return '';
    }
  };

  if (status === 'idle') return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 12px',
        background: 'var(--background-toolbar)',
        borderRadius: 16,
        border: `1px solid ${getStatusColor()}`,
        animation: 'fadeIn 0.3s ease',
      }}
    >
      <div
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: getStatusColor(),
          animation: status === 'connecting' ? 'pulse 1s infinite' : undefined,
        }}
      />
      <Text style={{ fontSize: 12, color: getStatusColor() }}>{getStatusText()}</Text>
    </div>
  );
};
