import { theme } from 'antd';
import { useSettingsStore } from '../stores/settingsStore';
import { getThemeConfig } from '../styles/theme';

export interface ThemeColors {
  isDark: boolean;
  // 基础色
  primary: string;
  primaryHover: string;
  primaryActive: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  // 文本色
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  // 背景色
  background: string;
  backgroundCard: string;
  backgroundToolbar: string;
  backgroundHover: string;
  backgroundActive: string;
  surfaceElevated: string;
  // 边框色
  border: string;
  borderLight: string;
  // 表格/列表语义色
  rowHoverBg: string;
  rowSelectedBg: string;
  rowStripeBg: string;
  headerBg: string;
  // 滚动条
  scrollbarThumb: string;
  scrollbarTrack: string;
  // 数据库类型色
  dbMysql: string;
  dbPostgresql: string;
  dbSqlite: string;
  dbSqlserver: string;
  dbOracle: string;
  dbMariadb: string;
  dbDameng: string;
  dbKingbase: string;
  dbHighgo: string;
  dbVastbase: string;
  // 日志级别色
  logError: string;
  logWarn: string;
  logOk: string;
  logInfo: string;
}

export function useThemeColors(): ThemeColors {
  const { token } = theme.useToken();
  const { settings } = useSettingsStore();
  const { themePreset, themeMode, themeSyncSystem } = settings;

  const effectiveMode = themeSyncSystem
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'
    : themeMode;

  const config = getThemeConfig(themePreset, effectiveMode);
  const isDark = effectiveMode === 'dark';
  const n = config.neutralColors;
  const c = config.colors;

  return {
    isDark,
    primary: c.primary,
    primaryHover: c.primaryHover,
    primaryActive: c.primaryActive,
    success: c.success,
    warning: c.warning,
    error: c.error,
    info: c.info,
    textPrimary: n.textPrimary,
    textSecondary: n.textSecondary,
    textTertiary: n.textTertiary,
    textDisabled: n.textDisabled,
    background: n.background,
    backgroundCard: n.backgroundCard,
    backgroundToolbar: n.backgroundToolbar,
    backgroundHover: n.backgroundHover,
    backgroundActive: n.backgroundActive,
    surfaceElevated: n.surfaceElevated,
    border: n.border,
    borderLight: n.borderLight,
    rowHoverBg: n.rowHoverBg,
    rowSelectedBg: n.rowSelectedBg,
    rowStripeBg: n.rowStripeBg,
    headerBg: n.headerBg,
    scrollbarThumb: n.scrollbarThumb,
    scrollbarTrack: n.scrollbarTrack,
    dbMysql: config.dbTypeColors.mysql,
    dbPostgresql: config.dbTypeColors.postgresql,
    dbSqlite: config.dbTypeColors.sqlite,
    dbSqlserver: config.dbTypeColors.sqlserver,
    dbOracle: config.dbTypeColors.oracle,
    dbMariadb: config.dbTypeColors.mariadb,
    dbDameng: config.dbTypeColors.dameng,
    dbKingbase: config.dbTypeColors.kingbase,
    dbHighgo: config.dbTypeColors.highgo,
    dbVastbase: config.dbTypeColors.vastbase,
    logError: c.error,
    logWarn: c.warning,
    logOk: c.success,
    logInfo: c.info,
  };
}
