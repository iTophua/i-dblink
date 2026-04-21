import { MainLayout } from './components/MainLayout';
import { ConfigProvider, theme, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useEffect } from 'react';
import { listen } from '@tauri-apps/api/event';
import { useSettingsStore } from './stores/settingsStore';
import { THEMES, getThemeConfig, ThemePreset, ThemeMode } from './styles/theme';
import './style.css';
import './App.css';

function App() {
  const { settings, updateSettings } = useSettingsStore();
  const { themePreset, themeMode, themeSyncSystem } = settings;

  const effectiveMode: ThemeMode = themeSyncSystem
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : themeMode;

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
        const newMode = effectiveMode === 'dark' ? 'light' : 'dark';
        updateSettings({ themeMode: newMode, themeSyncSystem: false });
      }
    };

    window.addEventListener('app-action' as any, handleAppAction as any);
    return () => {
      window.removeEventListener('app-action' as any, handleAppAction as any);
    };
  }, [effectiveMode, updateSettings]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (themeSyncSystem) {
        window.dispatchEvent(new CustomEvent('app-action', {
          detail: { action: 'system-theme-changed', isDark: e.matches }
        }));
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeSyncSystem]);

  useEffect(() => {
    const themeConfig = getThemeConfig(themePreset, effectiveMode);
    const root = document.documentElement;

    Object.entries(themeConfig.colors).forEach(([key, value]) => {
      root.style.setProperty(`--color-${key}`, value);
    });

    Object.entries(themeConfig.neutralColors).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });

    Object.entries(themeConfig.dbTypeColors).forEach(([key, value]) => {
      root.style.setProperty(`--db-color-${key}`, value);
    });

    root.setAttribute('data-theme', effectiveMode);
    root.setAttribute('data-theme-preset', themePreset);
  }, [themePreset, effectiveMode]);

  const themeConfig = getThemeConfig(themePreset, effectiveMode);
  const antdThemeConfig = {
    algorithm: effectiveMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: themeConfig.colors.primary,
      colorPrimaryHover: themeConfig.colors.primaryHover,
      colorPrimaryActive: themeConfig.colors.primaryActive,
      colorSuccess: themeConfig.colors.success,
      colorSuccessHover: themeConfig.colors.successHover,
      colorWarning: themeConfig.colors.warning,
      colorWarningHover: themeConfig.colors.warningHover,
      colorError: themeConfig.colors.error,
      colorErrorHover: themeConfig.colors.errorHover,
      colorInfo: themeConfig.colors.info,
      colorInfoHover: themeConfig.colors.infoHover,
      borderRadius: 6,
      fontSize: 14,
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    },
    components: {
      Layout: {
        headerBg: themeConfig.neutralColors.backgroundToolbar,
        siderBg: themeConfig.neutralColors.backgroundCard,
      },
      Menu: {
        itemBg: themeConfig.neutralColors.backgroundCard,
        itemSelectedBg: themeConfig.neutralColors.backgroundActive,
        itemHoverBg: themeConfig.neutralColors.backgroundHover,
      },
      Tabs: {
        cardBg: themeConfig.neutralColors.backgroundCard,
      },
      Table: {
        headerBg: themeConfig.neutralColors.backgroundToolbar,
        rowHoverBg: themeConfig.neutralColors.backgroundHover,
      },
      Card: {
        colorBgContainer: themeConfig.neutralColors.backgroundCard,
      },
      Modal: {
        contentBg: themeConfig.neutralColors.backgroundCard,
        headerBg: themeConfig.neutralColors.backgroundCard,
      },
      Input: {
        colorBgContainer: themeConfig.neutralColors.backgroundCard,
      },
      Select: {
        colorBgContainer: themeConfig.neutralColors.backgroundCard,
      },
    },
  };

  return (
    <ConfigProvider
      locale={zhCN}
      theme={antdThemeConfig}
    >
      <AntdApp>
        <MainLayout />
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
