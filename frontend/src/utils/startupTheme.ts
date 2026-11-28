import { useSettingsStore } from '../stores/settingsStore';
import { applyThemeVars } from '../styles/applyTheme';

/**
 * 首帧渲染之前把主题令牌写到文档上。
 *
 * 设置存在 localStorage，store 创建的时候已经同步读完（zustand persist 对同步存储是同步
 * hydrate 的），所以不用等挂载、更不用等启动画面结束。放到 effect 里已经晚了：启动画面会
 * 先用默认的浅色令牌画出来，深色用户看到的就是「先浅色、再变深色」。
 */
export function applyThemeBeforeRender(): void {
  const { themeMode, themePreset } = useSettingsStore.getState().settings;
  applyThemeVars(themeMode, themePreset);
}
