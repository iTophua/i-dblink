import React, { type JSX, useCallback, useState } from 'react';
import { Layout, Button, Dropdown, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../hooks/useThemeColors';
import {
  PlusOutlined,
  ReloadOutlined,
  PlayCircleOutlined,
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
  ConsoleSqlOutlined,
  SyncOutlined,
  KeyOutlined,
  RobotOutlined,
  LayoutOutlined,
} from '@ant-design/icons';
import { KeyboardShortcutsModal } from '../../utils/uxEnhancements';
import { getShortcutMenuLabel, isMacOS } from '../../constants/menuShortcuts';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAIStore } from '../../stores/aiStore';
import { useAIChatStore } from '../../stores/aiChatStore';

type ToolbarStyle = React.CSSProperties;

const { Header } = Layout;

interface ToolbarProps {
  /** 侧边栏是否已折叠（用于切换图标） */
  sidebarCollapsed?: boolean;
  /** 点击折叠/展开按钮的回调 */
  onToggleSidebar?: () => void;
}

export function Toolbar({ sidebarCollapsed, onToggleSidebar }: ToolbarProps = {}): JSX.Element {
  const tc = useThemeColors();
  const isDarkMode = tc.isDark;
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const { t } = useTranslation();
  const shortcuts = useSettingsStore((s) => s.settings.shortcuts || {});
  const isMac = isMacOS();
  const aiReady = useAIStore((s) => s.ready);
  const setChatPanelVisible = useAIChatStore((s) => s.setPanelVisible);

  const getLabel = (key: string, text: string) => `${text}${getShortcutMenuLabel(key, shortcuts, isMac)}`;

  const handleMenuAction = useCallback((action: string) => {
    window.dispatchEvent(new CustomEvent('menu-action', { detail: { action } }));
  }, []);

  const handleToggleTheme = useCallback(() => {
    window.dispatchEvent(new CustomEvent('menu-action', { detail: { action: 'toggle-theme' } }));
  }, []);

  const toolbarStyle: ToolbarStyle = {
    height: 38,
    lineHeight: '38px',
    background: 'var(--background-card)',
    borderBottom: '1px solid var(--border-color)',
    // macOS 隐藏标题栏后，左侧留出红绿灯空间（红绿灯 ~52px + 较大安全边距，避免按钮紧贴）
    // 非 macOS 不需要留红绿灯空间，正常 padding
    padding: isMac ? '0 12px 0 92px' : '0 12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const dividerStyle: React.CSSProperties = {
    width: 1,
    height: 20,
    background: 'var(--border-color)',
    margin: '0 10px',
  };

  const fileMenuItems: MenuProps['items'] = [
    {
      key: 'new-connection',
      icon: <PlusOutlined />,
      label: getLabel('new-connection', t('common.newConnectionLabel')),
    },
    { type: 'divider' },
    { key: 'save', icon: <SaveOutlined />, label: getLabel('save', t('common.saveLabel')) },
    { key: 'save-as', label: getLabel('save-as', t('common.saveAs')) },
    { type: 'divider' },
    { key: 'import', icon: <ImportOutlined />, label: getLabel('import', t('common.importLabel')) },
    { key: 'export', icon: <ExportOutlined />, label: getLabel('export', t('common.exportLabel')) },
    { type: 'divider' },
    { key: 'exit', label: getLabel('exit', t('common.exitLabel')) },
  ];

  const editMenuItems: MenuProps['items'] = [
    {
      key: 'undo',
      label: getLabel('undo', t('common.undoLabel')),
      icon: <span style={{ fontFamily: 'monospace' }}>↩</span>,
    },
    {
      key: 'redo',
      label: getLabel('redo', t('common.redoLabel')),
      icon: <span style={{ fontFamily: 'monospace' }}>↪</span>,
    },
    { type: 'divider' },
    { key: 'cut', label: getLabel('cut', t('common.cutLabel')) },
    { key: 'copy', label: getLabel('copy', t('common.copyLabel')) },
    { key: 'paste', label: getLabel('paste', t('common.pasteLabel')) },
    { key: 'delete', label: getLabel('delete', t('common.deleteLabel')) },
    { type: 'divider' },
    { key: 'select-all', label: getLabel('select-all', t('common.selectAllLabel')) },
    { key: 'find', label: getLabel('find', t('common.findReplaceLabel')) },
  ];

  const viewMenuItems: MenuProps['items'] = [
    { key: 'refresh', icon: <ReloadOutlined />, label: getLabel('refresh', t('common.refreshLabel')) },
    { type: 'divider' },
    { key: 'zoom-in', label: getLabel('zoom-in', t('common.zoomInLabel')) },
    { key: 'zoom-out', label: getLabel('zoom-out', t('common.zoomOutLabel')) },
    { key: 'zoom-reset', label: getLabel('zoom-reset', t('common.actualSizeLabel')) },
    { type: 'divider' },
    { key: 'fullscreen', label: getLabel('fullscreen', t('common.fullscreenLabel')) },
  ];

  const connectionMenuItems: MenuProps['items'] = [
    {
      key: 'connect-selected',
      icon: <LinkOutlined />,
      label: getLabel('connect-selected', t('common.connectSelected')),
    },
    { key: 'disconnect', icon: <DisconnectOutlined />, label: getLabel('disconnect', t('common.disconnect')) },
    { type: 'divider' },
    { key: 'new-query', icon: <CodeOutlined />, label: getLabel('new-query', t('common.sqlEditor.newQuery')) },
    {
      key: 'execute-query',
      icon: <PlayCircleOutlined />,
      label: getLabel('execute-query', t('common.executeQuery')),
    },
    { type: 'divider' },
    { key: 'close-all', label: getLabel('close-all', t('common.closeAllConnections')) },
  ];

  const toolsMenuItems: MenuProps['items'] = [
    { key: 'options', icon: <SettingOutlined />, label: getLabel('options', t('common.options')) },
    { type: 'divider' },
    {
      key: 'data-sync',
      icon: <SyncOutlined />,
      label: getLabel('data-sync', t('common.dataSync')),
      disabled: true,
    },
    {
      key: 'backup',
      icon: <DatabaseOutlined />,
      label: getLabel('backup', t('common.backupDatabase')),
      disabled: true,
    },
    {
      key: 'restore',
      icon: <DatabaseOutlined />,
      label: getLabel('restore', t('common.restoreDatabase')),
      disabled: true,
    },
    { type: 'divider' },
    { key: 'model-designer', label: getLabel('model-designer', t('common.modelDesigner')), disabled: true },
  ];

  const windowMenuItems: MenuProps['items'] = [
    { key: 'new-tab', label: getLabel('new-tab', t('common.newTab')) },
    { key: 'close-tab', label: getLabel('close-tab', t('common.closeTab')) },
    { type: 'divider' },
    { key: 'next-tab', label: getLabel('next-tab', t('common.nextTab')) },
    { key: 'prev-tab', label: getLabel('prev-tab', t('common.prevTab')) },
  ];

  const helpMenuItems: MenuProps['items'] = [
    { key: 'documentation', label: getLabel('documentation', t('common.documentationLabel')) },
    { key: 'search', label: getLabel('search', t('common.searchLabel')) },
    { type: 'divider' },
    { key: 'check-update', label: getLabel('check-update', t('common.checkUpdateLabel')) },
    { type: 'divider' },
    { key: 'about', label: getLabel('about', t('common.aboutLabel')) },
  ];

  const buttonStyle: React.CSSProperties = {
    fontSize: 13,
    color: 'var(--text-secondary)',
  };

  const renderToolbarButtons = () => (
    <>
      {/* 侧边栏显隐按钮：固定用 LayoutOutlined，颜色区分状态（展开=primary 强调，隐藏=弱化） */}
      {onToggleSidebar && (
        <Tooltip title={sidebarCollapsed ? t('common.expand') : t('common.collapse')}>
          <Button
            type="text"
            size="small"
            icon={<LayoutOutlined />}
            onClick={onToggleSidebar}
            data-testid="toolbar-toggle-sidebar"
            style={{
              borderRadius: 6,
              color: sidebarCollapsed ? 'var(--text-tertiary)' : 'var(--color-primary)',
            }}
          />
        </Tooltip>
      )}
      <Button
        type="primary"
        size="small"
        icon={<DatabaseOutlined />}
        onClick={() => handleMenuAction('new-connection')}
        data-testid="toolbar-new-connection"
        className="toolbar-btn-primary"
        style={{
          borderRadius: 6,
          fontWeight: 500,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {t('common.newConnectionBtn')}
      </Button>
      <Button
        size="small"
        icon={<ConsoleSqlOutlined />}
        onClick={() => handleMenuAction('new-query')}
        data-testid="toolbar-new-query"
        className="toolbar-btn"
        style={{
          borderRadius: 6,
          fontWeight: 500,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--color-primary)',
          borderColor: 'var(--color-primary-alpha-30)',
        }}
      >
        {t('common.newQueryBtn')}
      </Button>
    </>
  );

  const renderAppButtons = () => (
    <>
      <Tooltip title={aiReady ? t('common.ai') : t('common.aiSettings.notConfigured')}>
        <Button
          type="text"
          size="small"
          icon={<RobotOutlined />}
          onClick={() => setChatPanelVisible(true)}
          data-testid="toolbar-ai"
          style={{
            borderRadius: 6,
            color: aiReady ? 'var(--color-primary)' : 'var(--text-tertiary)',
          }}
        />
      </Tooltip>
      <div style={dividerStyle} />
      <Tooltip title={t('common.shortcutsTitle')}>
        <Button
          type="text"
          size="small"
          icon={<KeyOutlined />}
          onClick={() => setShortcutsModalOpen(true)}
          data-testid="toolbar-shortcuts"
          style={{ borderRadius: 6, color: 'var(--text-secondary)' }}
        />
      </Tooltip>
      <Tooltip title={isDarkMode ? t('common.lightMode') : t('common.darkMode')}>
        <Button
          type="text"
          size="small"
          icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
          onClick={handleToggleTheme}
          data-testid="toolbar-theme-toggle"
          style={{ borderRadius: 6, color: 'var(--text-secondary)' }}
        />
      </Tooltip>
      <Tooltip title={t('common.options')}>
        <Button
          type="text"
          size="small"
          icon={<SettingOutlined />}
          onClick={() => handleMenuAction('options')}
          data-testid="toolbar-settings"
          style={{ borderRadius: 6, color: 'var(--text-secondary)' }}
        />
      </Tooltip>
    </>
  );

  return (
    <>
      <Header style={toolbarStyle} className="toolbar-enhanced toolbar-drag-region">
        <div className="toolbar-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {!isMac && (
            <>
              <Dropdown
                menu={{ items: fileMenuItems, onClick: ({ key }) => handleMenuAction(key) }}
                trigger={['click']}
              >
                <Button type="text" size="small" style={buttonStyle} className="toolbar-btn">
                  {t('common.fileMenu')}
                </Button>
              </Dropdown>
              <Dropdown
                menu={{ items: editMenuItems, onClick: ({ key }) => handleMenuAction(key) }}
                trigger={['click']}
              >
                <Button type="text" size="small" style={buttonStyle} className="toolbar-btn">
                  {t('common.editMenu')}
                </Button>
              </Dropdown>
              <Dropdown
                menu={{ items: viewMenuItems, onClick: ({ key }) => handleMenuAction(key) }}
                trigger={['click']}
              >
                <Button type="text" size="small" style={buttonStyle} className="toolbar-btn">
                  {t('common.viewMenu')}
                </Button>
              </Dropdown>
              <Dropdown
                menu={{ items: connectionMenuItems, onClick: ({ key }) => handleMenuAction(key) }}
                trigger={['click']}
              >
                <Button type="text" size="small" style={buttonStyle} className="toolbar-btn">
                  {t('common.connectionMenu')}
                </Button>
              </Dropdown>
              <Dropdown
                menu={{ items: toolsMenuItems, onClick: ({ key }) => handleMenuAction(key) }}
                trigger={['click']}
              >
                <Button type="text" size="small" style={buttonStyle} className="toolbar-btn">
                  {t('common.toolsMenu')}
                </Button>
              </Dropdown>
              <Dropdown
                menu={{ items: windowMenuItems, onClick: ({ key }) => handleMenuAction(key) }}
                trigger={['click']}
              >
                <Button type="text" size="small" style={buttonStyle} className="toolbar-btn">
                  {t('common.windowMenu')}
                </Button>
              </Dropdown>
              <Dropdown
                menu={{ items: helpMenuItems, onClick: ({ key }) => handleMenuAction(key) }}
                trigger={['click']}
              >
                <Button type="text" size="small" style={buttonStyle} className="toolbar-btn">
                  {t('common.helpMenu')}
                </Button>
              </Dropdown>
              <div style={dividerStyle} />
            </>
          )}
          {renderToolbarButtons()}
        </div>
        <div className="toolbar-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {renderAppButtons()}
        </div>
      </Header>

      <KeyboardShortcutsModal
        open={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
      />
    </>
  );
}

export default Toolbar;
