import { MainLayout } from './components/MainLayout';
import { ConfigProvider, theme, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { getThemeConfig, ThemeMode } from './styles/theme';
import { SplashScreen } from './components/SplashScreen';
import i18n from './i18n';
import './style.css';
import './App.css';

// Check if running in Tauri environment
const isTauri =
  typeof window !== 'undefined' &&
  !!(window as Record<string, unknown>).__TAURI__;

// Lazy load Tauri APIs to avoid errors in browser
const loadTauriAPI = async () => {
  if (!isTauri) return null;
  try {
    const { listen } = await import('@tauri-apps/api/event');
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return { listen, getCurrentWindow };
  } catch (e) {
    console.warn('Failed to load Tauri APIs:', e);
    return null;
  }
};

function App() {
  const { settings, updateSettings } = useSettingsStore();
  const [isHydrated, setIsHydrated] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const off = useSettingsStore.persist.onFinishHydration((state) => {
      if (state?.settings?.language) {
        i18n.changeLanguage(state.settings.language);
      }
      setIsHydrated(true);
    });
    return off;
  }, []);

  useEffect(() => {
    if (isHydrated && settings.language) {
      i18n.changeLanguage(settings.language);
    }
  }, [isHydrated, settings.language]);

  const themePreset = settings.themePreset;
  const themeMode = settings.themeMode;
  const themeSyncSystem = settings.themeSyncSystem;

  const effectiveMode: ThemeMode = themeSyncSystem
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
    : themeMode;

  // 缓存主题配置，避免每次渲染都重新计算
  const themeConfig = useMemo(
    () => getThemeConfig(themePreset, effectiveMode),
    [themePreset, effectiveMode]
  );

  useEffect(() => {
    if (!isTauri) return;
    
    let cleanup: (() => void) | undefined;
    
    loadTauriAPI().then((api) => {
      if (!api) return;
      api.listen<string>('menu-action', (event) => {
        console.log('Menu action received:', event.payload);
        window.dispatchEvent(
          new CustomEvent('menu-action', {
            detail: { action: event.payload },
          })
        );
      }).then((unlistenFn) => {
        cleanup = unlistenFn;
      });
    });

    return () => {
      if (cleanup) cleanup();
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

    window.addEventListener('app-action', handleAppAction);
    return () => {
      window.removeEventListener('app-action', handleAppAction);
    };
  }, [effectiveMode, updateSettings]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (themeSyncSystem) {
        const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        updateSettings({ themeMode: isDark ? 'dark' : 'light' });
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeSyncSystem]);

  useEffect(() => {
    if (!isHydrated) return;

    const root = document.documentElement;

    const applyVars = () => {
      Object.entries(themeConfig.colors).forEach(([key, value]) => {
        root.style.setProperty(`--color-${key}`, value);
      });

      Object.entries(themeConfig.neutralColors).forEach(([key, value]) => {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        root.style.setProperty(`--${cssKey}`, value);
      });

      Object.entries(themeConfig.dbTypeColors).forEach(([key, value]) => {
        root.style.setProperty(`--db-color-${key}`, value);
      });

      Object.entries(themeConfig.glassEffect).forEach(([key, value]) => {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        root.style.setProperty(`--glass-${cssKey}`, value);
      });

      Object.entries(themeConfig.focusStyle).forEach(([key, value]) => {
        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
        if (typeof value === 'number') {
          root.style.setProperty(`--focus-${cssKey}`, `${value}px`);
        } else {
          root.style.setProperty(`--focus-${cssKey}`, value);
        }
      });

      root.setAttribute('data-theme', effectiveMode);
      root.setAttribute('data-theme-preset', themePreset);
    };

    requestAnimationFrame(() => {
      applyVars();

      if (isTauri) {
        loadTauriAPI().then((api) => {
          if (!api) return;
          try {
            const appWindow = api.getCurrentWindow();
            appWindow.setTheme(effectiveMode === 'dark' ? 'dark' : 'light');
          } catch (e) {
            console.error('Failed to set window theme:', e);
          }
        });
      }
    });
  }, [themePreset, effectiveMode, isHydrated]);

  if (showSplash) {
    return (
      <SplashScreen
        onFinish={() => {
          setShowSplash(false);
          setIsHydrated(true);
        }}
      />
    );
  }

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
      colorBgContainer: themeConfig.neutralColors.backgroundCard,
      colorBgElevated: themeConfig.neutralColors.backgroundCard,
      colorBgLayout: themeConfig.neutralColors.background,
      colorBorder: themeConfig.neutralColors.border,
      colorBorderSecondary: themeConfig.neutralColors.borderLight,
      colorText: themeConfig.neutralColors.textPrimary,
      colorTextSecondary: themeConfig.neutralColors.textSecondary,
      colorTextTertiary: themeConfig.neutralColors.textTertiary,
      colorTextQuaternary: themeConfig.neutralColors.textDisabled,
      borderRadius: 6,
      fontSize: 14,
      fontFamily:
        "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    },
    components: {
      Layout: {
        headerBg: themeConfig.neutralColors.backgroundToolbar,
        siderBg: themeConfig.neutralColors.backgroundCard,
        bodyBg: themeConfig.neutralColors.background,
      },
      Menu: {
        itemBg: themeConfig.neutralColors.backgroundCard,
        itemSelectedBg: themeConfig.neutralColors.backgroundActive,
        itemHoverBg: themeConfig.neutralColors.backgroundHover,
        darkItemBg: themeConfig.neutralColors.backgroundCard,
        darkItemSelectedBg: themeConfig.neutralColors.backgroundActive,
        darkItemHoverBg: themeConfig.neutralColors.backgroundHover,
      },
      Tabs: {
        cardBg: themeConfig.neutralColors.backgroundCard,
        itemSelectedColor: themeConfig.colors.primary,
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
      Button: {
        primaryColor: '#ffffff',
      },
      Form: {
        labelColor: themeConfig.neutralColors.textPrimary,
        labelRequiredMarkColor: themeConfig.colors.error,
        itemMarginBottom: 24,
      },
      Dropdown: {
        colorBgElevated: themeConfig.neutralColors.backgroundCard,
      },
      Tooltip: {
        colorBgSpotlight: themeConfig.neutralColors.backgroundCard,
        colorTextLightSolid: themeConfig.neutralColors.textPrimary,
      },
      Tag: {
        defaultBg: themeConfig.neutralColors.backgroundHover,
        defaultColor: themeConfig.neutralColors.textPrimary,
      },
      Typography: {
        colorTextHeading: themeConfig.neutralColors.textPrimary,
        colorTextLabel: themeConfig.neutralColors.textSecondary,
        colorTextDescription: themeConfig.neutralColors.textTertiary,
        colorTextDisabled: themeConfig.neutralColors.textDisabled,
      },
      Message: {
        colorBgElevated: themeConfig.neutralColors.backgroundCard,
        colorText: themeConfig.neutralColors.textPrimary,
      },
    },
  };

  const antdLocale = settings.language === 'en-US' ? enUS : zhCN;

  return (
    <ConfigProvider locale={antdLocale} theme={antdThemeConfig}>
      <AntdApp>
        <MainLayout />
      </AntdApp>
    </ConfigProvider>
  );
}

export default App;
