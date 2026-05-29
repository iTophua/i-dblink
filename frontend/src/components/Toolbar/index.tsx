import React, { type JSX, useCallback, useState } from 'react';
import { Layout, Button, Dropdown } from 'antd';
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
  SyncOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { KeyboardShortcutsModal } from '../../utils/uxEnhancements';
import { getShortcutMenuLabel, isMacOS } from '../../constants/menuShortcuts';
import { useSettingsStore } from '../../stores/settingsStore';

type ToolbarStyle = React.CSSProperties;

const { Header } = Layout;

export function Toolbar(): JSX.Element {
  const tc = useThemeColors();
  const isDarkMode = tc.isDark;
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const { t } = useTranslation();
  const shortcuts = useSettingsStore((s) => s.settings.shortcuts || {});
  const isMac = isMacOS();

  const getLabel = (key: string, text: string) => `${text}${getShortcutMenuLabel(key, shortcuts, isMac)}`;

  const handleMenuAction = useCallback((action: string) => {
    window.dispatchEvent(new CustomEvent('menu-action', { detail: { action } }));
  }, []);

  const handleToggleTheme = useCallback(() => {
    window.dispatchEvent(new CustomEvent('menu-action', { detail: { action: 'toggle-theme' } }));
  }, []);

  const toolbarStyle: ToolbarStyle = {
    height: 44,
    lineHeight: '44px',
    background: 'var(--background)',
    borderBottom: '1px solid var(--border-color)',
    padding: '0 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  };

  const dividerStyle: React.CSSProperties = {
    width: 1,
    height: 24,
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
    fontSize: 12,
    color: 'var(--text-tertiary)',
  };

  const renderToolbarButtons = () => (
    <>
      <div
        onClick={() => handleMenuAction('new-connection')}
        data-testid="toolbar-new-connection"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 12px',
          height: 30,
          borderRadius: 6,
          background: 'var(--color-primary)',
          color: '#fff',
          fontSize: 12,
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: '0 2px 8px rgba(29,78,216,0.2)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-1px)';
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(29,78,216,0.3)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(29,78,216,0.2)';
        }}
      >
        <PlusOutlined />
        {t('common.newConnectionBtn')}
      </div>
      <div
        onClick={() => handleMenuAction('new-query')}
        data-testid="toolbar-new-query"
        className="toolbar-btn-bordered"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 12px',
          height: 30,
          borderRadius: 6,
          background: 'var(--background-hover)',
          color: 'var(--text-secondary)',
          fontSize: 12,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
          border: '1px solid var(--border-color)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--color-primary)';
          e.currentTarget.style.color = 'var(--color-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-color)';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }}
      >
        <CodeOutlined />
        {t('common.newQueryBtn')}
      </div>
      <div
        onClick={() => handleMenuAction('refresh')}
        data-testid="toolbar-refresh"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 12px',
          height: 30,
          borderRadius: 6,
          color: 'var(--text-tertiary)',
          fontSize: 12,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--background-hover)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-tertiary)';
        }}
      >
        <ReloadOutlined />
        {t('common.refreshLabel')}
      </div>
    </>
  );

  const renderAppButtons = () => (
    <>
      <div
        onClick={() => setShortcutsModalOpen(true)}
        data-testid="toolbar-shortcuts"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 12px',
          height: 30,
          borderRadius: 6,
          color: 'var(--text-tertiary)',
          fontSize: 12,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--background-hover)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-tertiary)';
        }}
      >
        <KeyOutlined />
        {t('common.shortcutsTitle')}
      </div>
      <div
        onClick={handleToggleTheme}
        data-testid="toolbar-theme-toggle"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 12px',
          height: 30,
          borderRadius: 6,
          color: 'var(--text-tertiary)',
          fontSize: 12,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--background-hover)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-tertiary)';
        }}
      >
        {isDarkMode ? <SunOutlined /> : <MoonOutlined />}
        {isDarkMode ? t('common.lightMode') : t('common.darkMode')}
      </div>
      <div
        onClick={() => handleMenuAction('options')}
        data-testid="toolbar-settings"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '0 12px',
          height: 30,
          borderRadius: 6,
          color: 'var(--text-tertiary)',
          fontSize: 12,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--background-hover)';
          e.currentTarget.style.color = 'var(--text-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.color = 'var(--text-tertiary)';
        }}
      >
        <SettingOutlined />
        {t('common.options')}
      </div>
    </>
  );

  return (
    <>
      <Header style={toolbarStyle} className="toolbar-enhanced">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
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
