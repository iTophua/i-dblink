import React, { type JSX, useCallback, useState } from 'react';
import { Layout, Button, Dropdown, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();

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
    {
      key: 'new-connection',
      icon: <PlusOutlined />,
      label: `${t('common.newConnectionLabel')} (N)`,
    },
    {
      key: 'open-connection',
      icon: <FolderOpenOutlined />,
      label: `${t('common.openConnectionLabel')} (O)`,
    },
    { type: 'divider' },
    { key: 'save', icon: <SaveOutlined />, label: `${t('common.saveLabel')} (S)` },
    { key: 'save-as', label: `${t('common.saveAs')} (A)` },
    { type: 'divider' },
    { key: 'import', icon: <ImportOutlined />, label: `${t('common.importLabel')} (I)` },
    { key: 'export', icon: <ExportOutlined />, label: `${t('common.exportLabel')} (E)` },
    { type: 'divider' },
    { key: 'exit', label: `${t('common.exitLabel')} (X)` },
  ];

  const editMenuItems: MenuProps['items'] = [
    {
      key: 'undo',
      label: `${t('common.undoLabel')} (U)`,
      icon: <span style={{ fontFamily: 'monospace' }}>↩</span>,
    },
    {
      key: 'redo',
      label: `${t('common.redoLabel')} (R)`,
      icon: <span style={{ fontFamily: 'monospace' }}>↪</span>,
    },
    { type: 'divider' },
    { key: 'cut', label: `${t('common.cutLabel')} (T)` },
    { key: 'copy', label: `${t('common.copyLabel')} (C)` },
    { key: 'paste', label: `${t('common.pasteLabel')} (P)` },
    { key: 'delete', label: `${t('common.deleteLabel')} (D)` },
    { type: 'divider' },
    { key: 'select-all', label: `${t('common.selectAllLabel')} (A)` },
    { key: 'find', label: `${t('common.findReplaceLabel')} (F)` },
  ];

  const viewMenuItems: MenuProps['items'] = [
    { key: 'refresh', icon: <ReloadOutlined />, label: `${t('common.refreshLabel')} (R)` },
    { type: 'divider' },
    { key: 'zoom-in', label: `${t('common.zoomInLabel')} (I)` },
    { key: 'zoom-out', label: `${t('common.zoomOutLabel')} (O)` },
    { key: 'zoom-reset', label: `${t('common.actualSizeLabel')} (Z)` },
    { type: 'divider' },
    { key: 'fullscreen', label: `${t('common.fullscreenLabel')} (B)` },
  ];

  const connectionMenuItems: MenuProps['items'] = [
    {
      key: 'connect-selected',
      icon: <LinkOutlined />,
      label: `${t('common.connectSelected')} (C)`,
    },
    { key: 'disconnect', icon: <DisconnectOutlined />, label: `${t('common.disconnect')} (D)` },
    { type: 'divider' },
    { key: 'new-query', icon: <CodeOutlined />, label: `${t('common.sqlEditor.newQuery')} (Q)` },
    {
      key: 'execute-query',
      icon: <PlayCircleOutlined />,
      label: `${t('common.executeQuery')} (E)`,
    },
    { type: 'divider' },
    { key: 'close-all', label: `${t('common.closeAllConnections')} (L)` },
  ];

  const toolsMenuItems: MenuProps['items'] = [
    { key: 'options', icon: <SettingOutlined />, label: `${t('common.options')} (O)` },
    { type: 'divider' },
    {
      key: 'data-sync',
      icon: <SyncOutlined />,
      label: `${t('common.dataSync')} (S)`,
      disabled: true,
    },
    {
      key: 'backup',
      icon: <DatabaseOutlined />,
      label: `${t('common.backupDatabase')} (B)`,
      disabled: true,
    },
    {
      key: 'restore',
      icon: <DatabaseOutlined />,
      label: `${t('common.restoreDatabase')} (R)`,
      disabled: true,
    },
    { type: 'divider' },
    { key: 'model-designer', label: `${t('common.modelDesigner')} (M)`, disabled: true },
  ];

  const windowMenuItems: MenuProps['items'] = [
    { key: 'new-tab', label: `${t('common.newTab')} (N)` },
    { key: 'close-tab', label: `${t('common.closeTab')} (C)` },
    { type: 'divider' },
    { key: 'next-tab', label: `${t('common.nextTab')}` },
    { key: 'prev-tab', label: `${t('common.prevTab')}` },
  ];

  const helpMenuItems: MenuProps['items'] = [
    { key: 'documentation', label: `${t('common.documentationLabel')} (D)` },
    { key: 'search', label: `${t('common.searchLabel')} (S)` },
    { type: 'divider' },
    { key: 'check-update', label: `${t('common.checkUpdateLabel')} (U)` },
    { type: 'divider' },
    { key: 'about', label: `${t('common.aboutLabel')} (A)` },
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
        data-testid="toolbar-new-connection"
      >
        {t('common.newConnectionBtn')}
      </Button>
      <Button
        type="text"
        size="small"
        icon={<ReloadOutlined />}
        onClick={() => handleMenuAction('refresh')}
        style={buttonStyle}
        data-testid="toolbar-refresh"
      >
        {t('common.refreshBtn')}
      </Button>
      <Button
        type="text"
        size="small"
        icon={<CodeOutlined />}
        onClick={() => handleMenuAction('new-query')}
        style={buttonStyle}
        data-testid="toolbar-new-query"
      >
        {t('common.newQueryBtn')}
      </Button>
    </>
  );

  const renderAppButtons = () => (
    <>
      <Tooltip title={t('common.shortcutsTitle') + ' (?'} placement="bottom">
        <Button
          type="text"
          size="small"
          icon={<KeyOutlined />}
          onClick={() => setShortcutsModalOpen(true)}
          style={buttonStyle}
          data-testid="toolbar-shortcuts"
        />
      </Tooltip>
      <Button
        type="text"
        size="small"
        icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />}
        onClick={handleToggleTheme}
        style={buttonStyle}
        data-testid="toolbar-theme-toggle"
      >
        {isDarkMode ? t('common.lightModeBtn') : t('common.darkModeBtn')}
      </Button>
      <Button
        type="text"
        size="small"
        icon={<SettingOutlined />}
        onClick={() => handleMenuAction('options')}
        style={buttonStyle}
        data-testid="toolbar-settings"
      >
        {t('common.settingsBtn')}
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
