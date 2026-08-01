import { MainLayout } from './components/MainLayout';
import { ConfigProvider, Modal, theme, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { useEffect, useMemo, useState } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { getThemeConfig, ThemeMode } from './styles/theme';
import { SplashScreen } from './components/SplashScreen';
import i18n from './i18n';
import './style.css';
import './App.css';
import { EventsOn } from './api';

// NOTE: Modal 过渡动画已通过全局 CSS 禁用（style.css 中覆盖 rc-motion 相关样式）

// Check if running in Wails environment
const isWails =
  typeof window !== 'undefined' &&
  !!(window as unknown as Record<string, unknown>).runtime;

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

  const themeMode = settings.themeMode;
  const themePreset = settings.themePreset;

  const effectiveMode: ThemeMode = themeMode === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : themeMode;

  // 缓存主题配置，避免每次渲染都重新计算
  const themeConfig = useMemo(
    () => getThemeConfig(effectiveMode, themePreset),
    [effectiveMode, themePreset]
  );

  useEffect(() => {
    if (isWails) {
      document.documentElement.classList.add('wails');
    }
    return () => {
      document.documentElement.classList.remove('wails');
    };
  }, []);

  useEffect(() => {
    if (!isWails) return;

    const cleanup = EventsOn('menu-action', (action: string) => {
      console.log('Menu action received:', action);
      window.dispatchEvent(
        new CustomEvent('menu-action', {
          detail: { action },
        })
      );
    });

    return () => {
      cleanup();
    };
  }, []);

  useEffect(() => {
    const handleAppAction = (event: CustomEvent<{ action: string }>) => {
      const { action } = event.detail;
      if (action === 'toggle-theme') {
        const newMode = effectiveMode === 'dark' ? 'light' : 'dark';
        updateSettings({ themeMode: newMode });
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
      if (themeMode === 'system') {
        // 强制重新渲染以应用新的系统主题
        updateSettings({});
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeMode]);

  useEffect(() => {
    if (!isHydrated) return;

    const root = document.documentElement;

    const applyVars = () => {
      // 启用主题过渡 class（CSS 里针对 .theme-transitioning 加 color transition），
      // 300ms 后移除，避免影响日常 hover/动画
      root.classList.add('theme-transitioning');

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

      window.setTimeout(() => {
        root.classList.remove('theme-transitioning');
      }, 300);
    };

    requestAnimationFrame(() => {
      applyVars();
    });
  }, [effectiveMode, themePreset, isHydrated]);

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
      colorTextLightSolid: themeConfig.neutralColors.background,
      borderRadius: 8,
      borderRadiusLG: 10,
      borderRadiusSM: 6,
      fontSize: 14,
      fontSizeHeading1: 20,
      fontSizeHeading2: 16,
      fontSizeHeading3: 14,
      fontFamily:
        "'Inter', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      fontFamilyCode:
        "'JetBrains Mono', 'Fira Code', 'Consolas', 'Courier New', monospace",
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
        fontSize: 14,
        horizontalItemPadding: '12px 16px',
      },
      Table: {
        headerBg: themeConfig.neutralColors.backgroundToolbar,
        rowHoverBg: themeConfig.neutralColors.backgroundHover,
        headerBorderRadius: 8,
        cellFontSize: 13,
        cellFontSizeMD: 13,
        headerFontSize: 13,
      },
      Card: {
        colorBgContainer: themeConfig.neutralColors.backgroundCard,
      },
      Tree: {
        nodeSelectedBg: 'transparent',
        nodeSelectedColor: themeConfig.colors.primary,
      },
      Modal: {
        contentBg: themeConfig.neutralColors.backgroundCard,
        headerBg: themeConfig.neutralColors.backgroundCard,
        footerBg: themeConfig.neutralColors.backgroundCard,
      },
      Input: {
        colorBgContainer: themeConfig.neutralColors.backgroundCard,
        borderRadius: 8,
        controlHeight: 32,
        controlHeightSM: 28,
      },
      Select: {
        colorBgContainer: themeConfig.neutralColors.backgroundCard,
        borderRadius: 8,
        controlHeight: 32,
        controlHeightSM: 28,
      },
      Button: {
        primaryColor: themeConfig.neutralColors.background,
        borderRadius: 8,
        borderRadiusLG: 10,
        borderRadiusSM: 6,
        controlHeight: 32,
        controlHeightSM: 28,
        controlHeightLG: 40,
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
        colorTextDescription: themeConfig.neutralColors.textSecondary,
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
