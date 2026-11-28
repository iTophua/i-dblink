import { useEffect, useMemo, useRef } from 'react';
import { SetNativeWindowAppearance } from '../../bindings/idblink/backend/app';
import { api } from '../api';
import { applyThemeVars } from '../styles/applyTheme';
import { getThemeConfig, type ThemeMode, type ThemePreset } from '../styles/theme';
import { applyWindowBackground } from '../utils/windowBackground';

const themeKey = (mode: ThemeMode, preset: ThemePreset) => `${mode}|${preset}`;

/**
 * 把主题设置落到界面上：CSS 变量和 data-theme 标记、原生窗口的外观和底色，并把这次的主题记给
 * 后端，供下次启动用。
 *
 * 挂载后的第一次不算切换：主题令牌在渲染前已经由 main.tsx 的 applyThemeBeforeRender 写好，
 * 这里只是把原生窗口同步过去，不带过渡。不能在这一步等「设置读完」——设置存在 localStorage，
 * store 创建时已经同步读完，onFinishHydration 在挂载之前就触发完了。此前主题要等启动画面结束
 * 才应用，深色用户每次启动先看到 1.2 秒的浅色启动画面，再渐变成深色。
 */
export function useAppTheme(themeMode: ThemeMode, themePreset: ThemePreset) {
  const effectiveMode: ThemeMode =
    themeMode === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : themeMode;

  // 缓存主题配置，避免每次渲染都重新计算
  const themeConfig = useMemo(
    () => getThemeConfig(effectiveMode, themePreset),
    [effectiveMode, themePreset]
  );

  // 上次应用的是哪套主题。和启动时写好的那套相同就不算切换——StrictMode 把挂载期的 effect
  // 跑两遍，第二遍也不该带上过渡
  const appliedKey = useRef(themeKey(themeMode, themePreset));

  useEffect(() => {
    const isSwitch = appliedKey.current !== themeKey(themeMode, themePreset);
    appliedKey.current = themeKey(themeMode, themePreset);

    const applyVars = () => {
      // CSS 变量 + data-theme 标记统一由 applyThemeVars 注入（主窗口/托盘面板共用）
      const { config } = applyThemeVars(themeMode, themePreset, { transition: isSwitch });

      // 同步原生窗口外观（macOS 标题栏/红绿灯按钮/窗口边框/菜单栏）
      // 后端通过 CGO+ObjC 调 NSWindow.setAppearance:（仅 darwin 生效，其他平台空实现）
      // themeMode='system' 时传 'system' 让后端移除覆盖、跟随系统
      const nativeMode = themeMode === 'system' ? 'system' : effectiveMode;
      void SetNativeWindowAppearance(nativeMode);

      // 同步窗口背景色：webview 透明时露出来的就是它，跟着主题 background 走
      applyWindowBackground(config.neutralColors.background);

      // 原生窗口下次启动时的底色：窗口一创建、前端还没画出第一帧时露出来的就是它，后端得
      // 提前知道。两种外观的底色都给，跟随系统的由后端按启动时的系统外观挑
      void api
        .saveStartupTheme(
          getThemeConfig('light', themePreset).neutralColors.background,
          getThemeConfig('dark', themePreset).neutralColors.background,
          themeMode
        )
        .catch(() => {});
    };

    // 切换放到下一帧，和 antd 主题的重新渲染对齐；首次直接同步
    if (isSwitch) {
      requestAnimationFrame(applyVars);
    } else {
      applyVars();
    }
  }, [effectiveMode, themeMode, themePreset]);

  return { effectiveMode, themeConfig };
}
