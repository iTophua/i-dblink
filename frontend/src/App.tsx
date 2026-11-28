import { MainLayout } from './components/MainLayout';
import { ConfigProvider, theme, App as AntdApp } from 'antd';
import { registerAppModal } from './utils/appModal';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { useCallback, useEffect, useState } from 'react';
import { useSettingsStore } from './stores/settingsStore';
import { useAppTheme } from './hooks/useAppTheme';
import { SplashScreen } from './components/SplashScreen';
import { ErrorBoundary } from './components/ErrorBoundary';
import { api } from './api';
import i18n from './i18n';
import './style.css';
import './App.css';
import { EventsOn } from './api';

// NOTE: Modal 过渡动画已通过全局 CSS 禁用（style.css 中覆盖 rc-motion 相关样式）

// Check if running in Wails environment
// v2 挂 window.runtime，v3（@wailsio/runtime）挂 window._wails
const isWails =
  typeof window !== 'undefined' &&
  (!!(window as unknown as Record<string, unknown>)._wails ||
    !!(window as unknown as Record<string, unknown>).runtime);

function App() {
  const { settings, updateSettings } = useSettingsStore();
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const off = useSettingsStore.persist.onFinishHydration((state) => {
      if (state?.settings?.language) {
        i18n.changeLanguage(state.settings.language);
      }
    });
    return off;
  }, []);

  useEffect(() => {
    if (settings.language) {
      i18n.changeLanguage(settings.language);
    }
  }, [settings.language]);

  // 主题：CSS 变量在渲染前已经由 main.tsx 写好，这里同步原生窗口，之后跟着设置切换
  const { effectiveMode, themeConfig } = useAppTheme(settings.themeMode, settings.themePreset);

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

    // 托盘「外观」菜单：直接落主题设置（无需主界面动作路由）
    const offTheme = EventsOn('tray-set-theme', (mode: string) => {
      if (mode === 'light' || mode === 'dark' || mode === 'system') {
        updateSettings({ themeMode: mode });
      }
    });
    return () => {
      offTheme();
    };
  }, [updateSettings]);

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
      if (settings.themeMode === 'system') {
        // 强制重新渲染以应用新的系统主题
        updateSettings({});
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [settings.themeMode, updateSettings]);

  // F12 / Cmd+Opt+I 打开 DevTools：走后端 ShowDevTools（macOS 内部用 WebKit
  // 私有 API，比 runtime 直调更可靠）；生产包需带 devtools tag 构建。
  useEffect(() => {
    const isWailsEnv =
      typeof window !== 'undefined' && !!(window as unknown as Record<string, unknown>)._wails;
    if (!isWailsEnv) return;
    const handler = (e: KeyboardEvent) => {
      const isDevToolsKey =
        e.key === 'F12' || ((e.metaKey || e.ctrlKey) && e.altKey && e.key.toLowerCase() === 'i');
      if (!isDevToolsKey) return;
      e.preventDefault();
      void api.showDevTools().catch(() => {});
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // 启动画面是覆盖层：主界面在它下面立即挂载、开始加载连接，不再干等固定时长。
  // 画面不透明，挂载期的布局抖动被盖住。主题令牌在渲染前就已经应用（main.tsx 的
  // applyThemeBeforeRender），启动画面本身画的就是用户选的主题。
  // useCallback：SplashScreen 的计时器跟着 onFinish 走，主界面挂载引发的重渲染不能把计时重置
  const finishSplash = useCallback(() => {
    setShowSplash(false);
  }, []);

  const antdThemeConfig = {
    algorithm: effectiveMode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: themeConfig.colors.primary,
      colorPrimaryHover: themeConfig.colors.primaryHover,
      colorPrimaryActive: themeConfig.colors.primaryActive,
      colorSuccess: themeConfig.colors.success,
      colorSuccessHover: themeConfig.colors.successHover,
      colorSuccessActive: themeConfig.colors.successActive,
      colorWarning: themeConfig.colors.warning,
      colorWarningHover: themeConfig.colors.warningHover,
      colorWarningActive: themeConfig.colors.warningActive,
      colorError: themeConfig.colors.error,
      colorErrorHover: themeConfig.colors.errorHover,
      colorErrorActive: themeConfig.colors.errorActive,
      colorInfo: themeConfig.colors.info,
      colorInfoHover: themeConfig.colors.infoHover,
      colorInfoActive: themeConfig.colors.infoActive,
      colorBgContainer: themeConfig.neutralColors.backgroundCard,
      // 浮层必须比容器亮一档，否则弹窗/下拉与卡片同色，antd 的 elevation 层次被抹平
      colorBgElevated: themeConfig.neutralColors.surfaceElevated,
      colorBgLayout: themeConfig.neutralColors.surfaceCanvas,
      colorBorder: themeConfig.neutralColors.border,
      colorBorderSecondary: themeConfig.neutralColors.borderLight,
      colorText: themeConfig.neutralColors.textPrimary,
      colorTextSecondary: themeConfig.neutralColors.textSecondary,
      colorTextTertiary: themeConfig.neutralColors.textTertiary,
      colorTextQuaternary: themeConfig.neutralColors.textDisabled,
      // 主按钮文字色：旧值取 background（近白），窗口底压深后必须固定为浅色系
      colorTextLightSolid: effectiveMode === 'dark' ? '#F5F7FA' : '#FFFFFF',
      borderRadius: 8,
      borderRadiusLG: 10,
      borderRadiusSM: 6,
      fontSize: 14,
      fontSizeHeading1: 20,
      fontSizeHeading2: 16,
      fontSizeHeading3: 14,
      fontFamily:
        "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
      fontFamilyCode:
        "ui-monospace, 'SF Mono', 'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Consolas, 'Courier New', monospace",
      // antd 自绘浮层（Popover/Tooltip/Select 下拉等）的阴影系列：
      // 此前未配置，走 antd 默认冷蓝灰阴影，与界面的暖中性阴影体系脱节
      boxShadow:
        effectiveMode === 'dark'
          ? '0 0 0 1px rgba(255, 255, 255, 0.06), 0 3px 6px -4px rgba(0, 0, 0, 0.48), 0 6px 16px 0 rgba(0, 0, 0, 0.32), 0 9px 28px 8px rgba(0, 0, 0, 0.2)'
          : '0 0 0 1px rgba(28, 28, 26, 0.04), 0 3px 6px -4px rgba(28, 28, 26, 0.08), 0 6px 16px 0 rgba(28, 28, 26, 0.08), 0 9px 28px 8px rgba(28, 28, 26, 0.05)',
      boxShadowSecondary:
        effectiveMode === 'dark'
          ? '0 0 0 1px rgba(255, 255, 255, 0.06), 0 6px 16px -8px rgba(0, 0, 0, 0.4), 0 9px 28px 0 rgba(0, 0, 0, 0.28)'
          : '0 0 0 1px rgba(28, 28, 26, 0.04), 0 6px 16px -8px rgba(28, 28, 26, 0.1), 0 9px 28px 0 rgba(28, 28, 26, 0.07)',
      boxShadowTertiary:
        effectiveMode === 'dark'
          ? '0 0 0 1px rgba(255, 255, 255, 0.06), 0 1px 2px rgba(0, 0, 0, 0.32)'
          : '0 0 0 1px rgba(28, 28, 26, 0.04), 0 1px 2px rgba(28, 28, 26, 0.05)',
    },
    components: {
      Layout: {
        headerBg: themeConfig.neutralColors.backgroundToolbar,
        // 侧栏使用最深的窗口底，内容区用工作区画布，两者不再同色
        siderBg: themeConfig.neutralColors.background,
        bodyBg: themeConfig.neutralColors.surfaceCanvas,
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
        inkBarColor: themeConfig.colors.primary,
        fontSize: 14,
        horizontalItemPadding: '12px 16px',
      },
      Table: {
        headerBg: themeConfig.neutralColors.backgroundToolbar,
        headerColor: themeConfig.neutralColors.textSecondary,
        headerSplitColor: themeConfig.neutralColors.border,
        borderColor: themeConfig.neutralColors.borderLight,
        rowHoverBg: themeConfig.neutralColors.backgroundHover,
        headerBorderRadius: 8,
        cellFontSize: 13,
        cellFontSizeMD: 13,
        headerFontSize: 12,
      },
      Card: {
        colorBgContainer: themeConfig.neutralColors.backgroundCard,
      },
      Tree: {
        nodeSelectedBg: 'transparent',
        nodeSelectedColor: themeConfig.colors.primary,
      },
      Modal: {
        contentBg: themeConfig.neutralColors.surfaceElevated,
        headerBg: themeConfig.neutralColors.surfaceElevated,
        footerBg: themeConfig.neutralColors.surfaceElevated,
        // 弹窗半径与标题字号：与主界面的卡片语汇保持一致
        borderRadiusLG: 14,
        titleFontSize: 14,
      },
      Drawer: {
        colorBgElevated: themeConfig.neutralColors.surfaceElevated,
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
        // 亮色为白字 / 暗色为深字，跟随浮层色阶，主色按钮始终清晰
        primaryColor: themeConfig.neutralColors.surfaceElevated,
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
        itemMarginBottom: 16,
      },
      Dropdown: {
        colorBgElevated: themeConfig.neutralColors.surfaceElevated,
        borderRadiusLG: 10,
      },
      Tooltip: {
        colorBgSpotlight: themeConfig.neutralColors.backgroundCard,
        colorTextLightSolid: themeConfig.neutralColors.textPrimary,
        borderRadius: 6,
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
        colorBgElevated: themeConfig.neutralColors.surfaceElevated,
        colorText: themeConfig.neutralColors.textPrimary,
      },
    },
  };

  const antdLocale = settings.language === 'en-US' ? enUS : zhCN;

  return (
    <ConfigProvider locale={antdLocale} theme={antdThemeConfig}>
      <AntdApp>
        <ErrorBoundary>
          <AppInner />
        </ErrorBoundary>
      </AntdApp>
      {showSplash && <SplashScreen onFinish={finishSplash} />}
    </ConfigProvider>
  );
}

/** 内部组件：在 AntdApp 内注册 modal 实例，使 appModal.confirm 等继承主题 */
function AppInner() {
  const { modal } = AntdApp.useApp();
  useEffect(() => {
    registerAppModal(modal);
  }, [modal]);
  return <MainLayout />;
}

export default App;
