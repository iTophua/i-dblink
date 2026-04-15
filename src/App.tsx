import { Welcome } from './components/Welcome';
import { MainLayout } from './components/MainLayout';
import { ConfigProvider, theme, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import './style.css';
import './App.css';

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  // 监听来自后端的菜单事件
  useEffect(() => {
    const unlisten = listen<string>('menu-action', (event) => {
      console.log('Menu action received:', event.payload);
      window.dispatchEvent(new CustomEvent('menu-action', {
        detail: { action: event.payload }
      }));
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  useEffect(() => {
    const handleAppAction = (event: CustomEvent<{ action: string }>) => {
      const { action } = event.detail;
      if (action === 'toggle-theme') {
        setIsDarkMode(prev => !prev);
      }
    };

    window.addEventListener('app-action' as any, handleAppAction as any);
    return () => {
      window.removeEventListener('app-action' as any, handleAppAction as any);
    };
  }, []);

  // 应用主题到 data 属性
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDarkMode ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1890ff',
          borderRadius: 6,
          fontSize: 14,
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
        },
        components: {
          Layout: {
            headerBg: isDarkMode ? '#141414' : '#f0f0f0',
            siderBg: isDarkMode ? '#1f1f1f' : '#ffffff',
          },
          Menu: {
            itemBg: isDarkMode ? '#1f1f1f' : '#ffffff',
            itemSelectedBg: isDarkMode ? '#111d2c' : '#e6f7ff',
          },
          Tabs: {
            cardBg: isDarkMode ? '#1f1f1f' : '#ffffff',
          },
        },
      }}
    >
      <AntdApp>
        <MainLayout>
          <Welcome />
        </MainLayout>
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
