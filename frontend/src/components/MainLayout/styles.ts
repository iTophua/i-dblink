export const getMainLayoutStyles = () => ({
  root: { height: '100vh' as const, overflow: 'hidden' as const },
  mainLayout: { flex: 1, overflow: 'hidden' as const, display: 'flex' as const },
  sider: {
    // 侧栏与窗口底板同色，作为「底板」的一部分直接铺到窗口边缘，
    // 不再画右描边/投影——右侧卡片的描边和投影负责边界
    background: 'var(--app-base)',
    height: '100%',
  },
  siderContent: { display: 'flex' as const, flexDirection: 'column' as const, height: '100%' },
  searchContainer: { padding: '10px 10px 6px', flexShrink: 0 },
  searchInput: {
    borderRadius: 6,
    background: 'var(--background-card)',
  },
  connectionTreeContainer: { flex: 1, minHeight: 0, overflow: 'auto' as const, marginBottom: 0 },
  collapseButton: {
    height: 28,
    flexShrink: 0,
    background: 'var(--background)',
    borderTop: '1px solid var(--border-color)',
    display: 'flex' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    cursor: 'pointer' as const,
    transition: 'background 0.2s ease',
  },
  collapseButtonText: {
    color: 'var(--text-secondary)',
    fontSize: 12,
    display: 'flex' as const,
    alignItems: 'center' as const,
    gap: 4,
  },
  content: {
    flex: 1,
    // 工作区底色与右侧面板的卡片底色一致，卡片边界由外层圆角面板提供；
    // 原先用 surface-canvas 会在此处形成第二层灰底，和白卡片拼出斑块
    background: 'var(--background-card)',
    margin: 0,
    marginLeft: 0,
    padding: 0,
    borderRadius: 0,
    overflow: 'hidden' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    minHeight: 0,
  },
  tabPanelContainer: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column' as const,
  },
});
