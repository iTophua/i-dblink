import React, { useCallback } from 'react';
import { Layout, Menu, Space, Button, Divider } from 'antd';
import {
  DatabaseOutlined,
  FolderOpenOutlined,
  SaveOutlined,
  UploadOutlined,
  DownloadOutlined,
  SearchOutlined,
  UndoOutlined,
  RedoOutlined,
  ScissorOutlined,
  CopyOutlined,
  PushpinOutlined,
  ReloadOutlined,
  SettingOutlined,
  SunOutlined,
  MoonOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  DeleteOutlined,
  LinkOutlined,
} from '@ant-design/icons';
import { theme } from 'antd';

type HeaderStyle = React.CSSProperties;

const { Header } = Layout;

export function Toolbar(): JSX.Element {
  const { token } = theme.useToken();
  const isDarkMode = token.colorBgLayout === '#1f1f1f';

  const isMacOS = typeof navigator !== 'undefined' && (navigator.platform === 'MacIntel' || navigator.platform === 'MacPPC' || navigator.platform === 'Mac68K' || navigator.userAgent.includes('Mac'));
  // macOS 使用系统菜单栏，不显示应用内菜单
  const showAppMenu = !isMacOS;

  const handleMenuAction = useCallback((action: string) => {
    window.dispatchEvent(new CustomEvent('menu-action', { detail: { action } }));
  }, []);

  const handleToggleTheme = useCallback(() => {
    handleMenuAction('toggle-theme');
  }, [handleMenuAction]);

  
  const headerStyle: HeaderStyle = {
    height: 32,
    lineHeight: '32px',
    background: isDarkMode ? '#141414' : '#f0f0f0',
    borderBottom: `1px solid ${isDarkMode ? '#434343' : '#d9d9d9'}`,
    padding: '0 16px',
    display: 'flex',
    alignItems: 'center',
  };

  const menuStyle: React.CSSProperties = {
    flex: 1,
    borderBottom: 'none',
    background: 'transparent',
  };

  
  const secondaryBar: React.CSSProperties = {
    height: 40,
    lineHeight: '40px',
    background: isDarkMode ? '#1f1f1f' : '#fff',
    borderBottom: `1px solid ${isDarkMode ? '#303030' : '#e8e8e8'}`,
    padding: '0 16px',
    display: 'flex',
    alignItems: 'center',
  };

  return (
    <>
      {showAppMenu && (
        <Header style={headerStyle}>
          <Menu
            mode="horizontal"
            style={menuStyle}
            items={[
              { key: 'file', label: '文件 (F)', children: [
                { key: 'new-connection', label: '新建连接 (N)', icon: <PlusOutlined /> },
                { key: 'open-connection', label: '打开连接 (O)', icon: <FolderOpenOutlined /> },
                { type: 'divider' },
                { key: 'save', label: '保存 (S)', icon: <SaveOutlined /> },
                { key: 'save-as', label: '另存为... (A)' },
                { type: 'divider' },
                { key: 'import', label: '导入 (I)', icon: <UploadOutlined /> },
                { key: 'export', label: '导出 (E)', icon: <DownloadOutlined /> },
                { type: 'divider' },
                { key: 'exit', label: '退出 (X)' },
              ]},
              { key: 'edit', label: '编辑 (E)', children: [
                { key: 'undo', label: '撤销 (U)', icon: <UndoOutlined /> },
                { key: 'redo', label: '重做 (R)', icon: <RedoOutlined /> },
                { type: 'divider' },
                { key: 'cut', label: '剪切 (T)', icon: <ScissorOutlined /> },
                { key: 'copy', label: '复制 (C)', icon: <CopyOutlined /> },
                { key: 'paste', label: '粘贴 (P)', icon: <PushpinOutlined /> },
                { key: 'delete', label: '删除 (D)', icon: <DeleteOutlined /> },
                { type: 'divider' },
                { key: 'select-all', label: '全选 (A)' },
                { key: 'find', label: '查找/替换... (F)', icon: <SearchOutlined /> },
              ]},
              { key: 'view', label: '查看 (V)', children: [
                { key: 'refresh', label: '刷新 (R)', icon: <ReloadOutlined /> },
                { type: 'divider' },
                { key: 'zoom-in', label: '放大 (I)' },
                { key: 'zoom-out', label: '缩小 (O)' },
                { key: 'zoom-reset', label: '实际大小 (Z)' },
                { type: 'divider' },
                { key: 'fullscreen', label: '全屏切换 (B)' },
              ]},
              { key: 'connection', label: '连接 (C)', children: [
                { key: 'connect-selected', label: '连接所选 (C)' },
                { key: 'disconnect', label: '断开连接 (D)' },
                { type: 'divider' },
                { key: 'new-query', label: '新建查询 (Q)' },
                { key: 'execute-query', label: '执行查询 (E)' },
                { type: 'divider' },
                { key: 'close-all', label: '关闭所有连接 (L)' },
              ]},
              { key: 'tools', label: '工具 (T)', children: [
                { key: 'options', label: '选项/设置... (O)', icon: <SettingOutlined /> },
                { type: 'divider' },
                { key: 'data-sync', label: '数据同步... (S)' },
                { key: 'backup', label: '备份数据库... (B)' },
                { key: 'restore', label: '恢复数据库... (R)' },
                { type: 'divider' },
                { key: 'model-designer', label: '模型设计器... (M)' },
              ]},
              { key: 'window', label: '窗口 (W)', children: [
                { key: 'new-tab', label: '新建标签页 (N)' },
                { key: 'close-tab', label: '关闭标签页 (C)' },
                { type: 'divider' },
                { key: 'next-tab', label: '切换到下一个标签页' },
                { key: 'prev-tab', label: '切换到上一个标签页' },
              ]},
              { key: 'help', label: '帮助 (H)', children: [
                { key: 'documentation', label: '文档 (D)' },
                { key: 'search', label: '搜索... (S)' },
                { type: 'divider' },
                { key: 'check-update', label: '检查更新... (U)' },
                { type: 'divider' },
                { key: 'about', label: '关于 i-dblink (A)' },
              ]},
            ]}
          />
        </Header>
      )}

      <div style={secondaryBar}>
        <Space size="small" split={<Divider type="vertical" />}>
          <Space size="small">
            <Button icon={<PlusOutlined />} size="small" type="primary" onClick={() => handleMenuAction('new-connection')}>新建</Button>
            <Button icon={<FolderOpenOutlined />} size="small" onClick={() => handleMenuAction('open-connection')}>打开</Button>
            <Button icon={<SaveOutlined />} size="small" onClick={() => handleMenuAction('save')}>保存</Button>
          </Space>

          <Space size="small">
            <Button icon={<ScissorOutlined />} size="small" onClick={() => handleMenuAction('cut')} />
            <Button icon={<CopyOutlined />} size="small" onClick={() => handleMenuAction('copy')} />
            <Button icon={<PushpinOutlined />} size="small" onClick={() => handleMenuAction('paste')} />
          </Space>

          <Space size="small">
            <Button icon={<UndoOutlined />} size="small" onClick={() => handleMenuAction('undo')} />
            <Button icon={<RedoOutlined />} size="small" onClick={() => handleMenuAction('redo')} />
          </Space>

          <Space size="small">
            <Button icon={<ReloadOutlined />} size="small" onClick={() => handleMenuAction('refresh')}>刷新</Button>
          </Space>

          <Space size="small">
            <Button icon={<UploadOutlined />} size="small" onClick={() => handleMenuAction('import')}>导入</Button>
            <Button icon={<DownloadOutlined />} size="small" onClick={() => handleMenuAction('export')}>导出</Button>
          </Space>

          <Space size="small" style={{ marginLeft: 'auto' }}>
            <Button icon={<SearchOutlined />} size="small" onClick={() => handleMenuAction('find')}>搜索</Button>
            <Button 
              icon={isDarkMode ? <SunOutlined /> : <MoonOutlined />} 
              size="small"
              onClick={handleToggleTheme}
            >
              {isDarkMode ? '浅色' : '深色'}
            </Button>
            <Button icon={<SettingOutlined />} size="small" onClick={() => handleMenuAction('options')}>设置</Button>
          </Space>
        </Space>
      </div>
    </>
  );
}

export default Toolbar;
