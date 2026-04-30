import React, { useCallback, useState } from 'react';
import { Layout, Button, Dropdown, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { useThemeColors } from '../../hooks/useThemeColors';
import {
  PlusOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
  FolderOpenOutlined,
  SaveOutlined,
  ImportOutlined,
  ExportOutlined,
  SettingOutlined,
  SunOutlined,
  MoonOutlined,
  LinkOutlined,
  DisconnectOutlined,
  DatabaseOutlined,
  CodeOutlined,
  SyncOutlined,
  QuestionCircleOutlined,
  ThunderboltOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { KeyboardShortcutsModal } from '../../utils/uxEnhancements';

type ToolbarStyle = React.CSSProperties;

const { Header } = Layout;

const isMacOS =
  typeof navigator !== 'undefined' &&
  (navigator.platform === 'MacIntel' ||
    navigator.platform === 'MacPPC' ||
    navigator.platform === 'Mac68K' ||
    navigator.userAgent.includes('Mac'));

export function Toolbar(): JSX.Element {
  const tc = useThemeColors();
  const isDarkMode = tc.isDark;
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);

  const handleMenuAction = useCallback((action: string) => {
    window.dispatchEvent(new CustomEvent('menu-action', { detail: { action } }));
  }, []);

  const handleToggleTheme = useCallback(() => {
    window.dispatchEvent(new CustomEvent('menu-action', { detail: { action: 'toggle-theme' } }));
  }, []);

  const toolbarStyle: ToolbarStyle = {
    height: 36,
    lineHeight: '36px',
    background: 'var(--background-toolbar)',
    borderBottom: '1px solid var(--border-color)',
    padding: '0 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const dividerStyle: React.CSSProperties = {
    width: 1,
    height: 20,
    background: 'var(--border-color)',
    margin: '0 8px',
  };

  const fileMenuItems: MenuProps['items'] = [
    { key: 'new-connection', icon: <PlusOutlined />, label: '新建连接 (N)' },
    { key: 'open-connection', icon: <FolderOpenOutlined />, label: '打开连接 (O)' },
    { type: 'divider' },
    { key: 'save', icon: <SaveOutlined />, label: '保存 (S)' },
    { key: 'save-as', label: '另存为... (A)' },
    { type: 'divider' },
    { key: 'import', icon: <ImportOutlined />, label: '导入 (I)' },
    { key: 'export', icon: <ExportOutlined />, label: '导出 (E)' },
    { type: 'divider' },
    { key: 'exit', label: '退出 (X)' },
  ];

  const editMenuItems: MenuProps['items'] = [
    { key: 'undo', label: '撤销 (U)', icon: <span style={{ fontFamily: 'monospace' }}>↩</span> },
    { key: 'redo', label: '重做 (R)', icon: <span style={{ fontFamily: 'monospace' }}>↪</span> },
    { type: 'divider' },
    { key: 'cut', label: '剪切 (T)' },
    { key: 'copy', label: '复制 (C)' },
    { key: 'paste', label: '粘贴 (P)' },
    { key: 'delete', label: '删除 (D)' },
    { type: 'divider' },
    { key: 'select-all', label: '全选 (A)' },
    { key: 'find', label: '查找/替换... (F)' },
  ];

  const viewMenuItems: MenuProps['items'] = [
    { key: 'refresh', icon: <ReloadOutlined />, label: '刷新 (R)' },
    { type: 'divider' },
    { key: 'zoom-in', label: '放大 (I)' },
    { key: 'zoom-out', label: '缩小 (O)' },
    { key: 'zoom-reset', label: '实际大小 (Z)' },
    { type: 'divider' },
    { key: 'fullscreen', label: '全屏切换 (B)' },
  ];

  const connectionMenuItems: MenuProps['items'] = [
    { key: 'connect-selected', icon: <LinkOutlined />, label: '连接所选 (C)' },
    { key: 'disconnect', icon: <DisconnectOutlined />, label: '断开连接 (D)' },
    { type: 'divider' },
    { key: 'new-query', icon: <CodeOutlined />, label: '新建查询 (Q)' },
    { key: 'execute-query', icon: <PlayCircleOutlined />, label: '执行查询 (E)' },
    { type: 'divider' },
    { key: 'close-all', label: '关闭所有连接 (L)' },
  ];

  const toolsMenuItems: MenuProps['items'] = [
    { key: 'options', icon: <SettingOutlined />, label: '选项/设置... (O)' },
    { type: 'divider' },
    { key: 'data-sync', icon: <SyncOutlined />, label: '数据同步... (S)' },
    { key: 'backup', icon: <DatabaseOutlined />, label: '备份数据库... (B)' },
    { key: 'restore', icon: <DatabaseOutlined />, label: '恢复数据库... (R)' },
    { type: 'divider' },
    { key: 'model-designer', label: '模型设计器... (M)' },
  ];

  const windowMenuItems: MenuProps['items'] = [
    { key: 'new-tab', label: '新建标签页 (N)' },
    { key: 'close-tab', label: '关闭标签页 (C)' },
    { type: 'divider' },
    { key: 'next-tab', label: '切换到下一个标签页' },
    { key: 'prev-tab', label: '切换到上一个标签页' },
  ];

  const helpMenuItems: MenuProps['items'] = [
    { key: 'documentation', label: '文档 (D)' },
    { key: 'search', label: '搜索... (S)' },
    { type: 'divider' },
    { key: 'check-update', label: '检查更新... (U)' },
    { type: 'divider' },
    { key: 'about', label: '关于 i-dblink (A)' },
  ];

  const buttonStyle: React.CSSProperties = {
    fontSize: 12,
    color: 'var(--text-primary)',
  };

  const renderToolbarButtons = () => (
    <>
      <Button
        type="text"
        size="small"
        icon={<PlusOutlined />}
        onClick={() => handleMenuAction('new-connection')}
        style={buttonStyle}
      >
        新建连接
      </Button>
      <Button
        type="text"
        size="small"
        icon={<ReloadOutlined />}
        onClick={() => handleMenuAction('refresh')}
        style={buttonStyle}
      >
        刷新
      </Button>
      <Button
        type="text"
        size="small"
        icon={<CodeOutlined />}
        onClick={() => handleMenuAction('new-query')}
        style={buttonStyle}
      >
        新建查询
      </Button>
    </>
  );

  const renderAppButtons = () => (
    <>
      <Tooltip title="快捷键 (?)" placement="bottom">
        <Button
          type="text"
          size="small"
          icon={<KeyOutlined />}
          onClick={() => setShortcutsModalOpen(true)}
          style={buttonStyle}
        />
      </Tooltip>
      <Button
        type="text"
        size="small"
        icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
        onClick={handleToggleTheme}
        style={buttonStyle}
      >
        {isDarkMode ? '浅色' : '深色'}
      </Button>
      <Button
        type="text"
        size="small"
        icon={<SettingOutlined />}
        onClick={() => handleMenuAction('options')}
        style={buttonStyle}
      >
        设置
      </Button>
    </>
  );

  return (
    <>
      <Header style={toolbarStyle} className="toolbar-enhanced">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {!isMacOS && (
            <>
              <Dropdown
                menu={{ items: fileMenuItems, onClick: ({ key }) => handleMenuAction(key) }}
                trigger={['click']}
              >
                <Button type="text" size="small" style={buttonStyle} className="toolbar-btn">
                  文件
                </Button>
              </Dropdown>
              <Dropdown
                menu={{ items: editMenuItems, onClick: ({ key }) => handleMenuAction(key) }}
                trigger={['click']}
              >
                <Button type="text" size="small" style={buttonStyle} className="toolbar-btn">
                  编辑
                </Button>
              </Dropdown>
              <Dropdown
                menu={{ items: viewMenuItems, onClick: ({ key }) => handleMenuAction(key) }}
                trigger={['click']}
              >
                <Button type="text" size="small" style={buttonStyle} className="toolbar-btn">
                  查看
                </Button>
              </Dropdown>
              <Dropdown
                menu={{ items: connectionMenuItems, onClick: ({ key }) => handleMenuAction(key) }}
                trigger={['click']}
              >
                <Button type="text" size="small" style={buttonStyle} className="toolbar-btn">
                  连接
                </Button>
              </Dropdown>
              <Dropdown
                menu={{ items: toolsMenuItems, onClick: ({ key }) => handleMenuAction(key) }}
                trigger={['click']}
              >
                <Button type="text" size="small" style={buttonStyle} className="toolbar-btn">
                  工具
                </Button>
              </Dropdown>
              <Dropdown
                menu={{ items: windowMenuItems, onClick: ({ key }) => handleMenuAction(key) }}
                trigger={['click']}
              >
                <Button type="text" size="small" style={buttonStyle} className="toolbar-btn">
                  窗口
                </Button>
              </Dropdown>
              <Dropdown
                menu={{ items: helpMenuItems, onClick: ({ key }) => handleMenuAction(key) }}
                trigger={['click']}
              >
                <Button type="text" size="small" style={buttonStyle} className="toolbar-btn">
                  帮助
                </Button>
              </Dropdown>
              <div style={dividerStyle} />
            </>
          )}
          {renderToolbarButtons()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>{renderAppButtons()}</div>
      </Header>

      <KeyboardShortcutsModal
        open={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />
    </>
  );
}

export default Toolbar;
