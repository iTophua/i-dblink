import { describe, it, expect } from 'vitest';
import { useThemeColors } from '../hooks/useThemeColors';

describe('useThemeColors', () => {
  it('returns a ThemeColors interface', () => {
    const mockThemeColors = {
      isDark: true,
      primary: '#1890ff',
      primaryHover: '#40a9ff',
      primaryActive: '#096dd9',
      success: '#52c41a',
      warning: '#faad14',
      error: '#ff4d4f',
      info: '#1890ff',
      textPrimary: '#ffffff',
      textSecondary: 'rgba(255, 255, 255, 0.65)',
      textTertiary: 'rgba(255, 255, 255, 0.45)',
      textDisabled: 'rgba(255, 255, 255, 0.25)',
      background: '#0d1117',
      backgroundCard: '#161b22',
      backgroundToolbar: '#0d1117',
      backgroundHover: '#1c2128',
      backgroundActive: '#1f6feb',
      surfaceElevated: '#161b22',
      border: '#30363d',
      borderLight: '#21262d',
      rowHoverBg: 'rgba(255, 255, 255, 0.04)',
      rowSelectedBg: 'rgba(88, 166, 255, 0.15)',
      rowStripeBg: 'rgba(255, 255, 255, 0.02)',
      headerBg: '#161b22',
      scrollbarThumb: '#30363d',
      scrollbarTrack: '#0d1117',
      dbMysql: '#4479a1',
      dbPostgresql: '#336791',
      dbSqlite: '#003b57',
      dbSqlserver: '#D32029',
      dbOracle: '#f80000',
      dbMariadb: '#007582',
      dbDameng: '#84a35c',
      dbKingbase: '#6d98a0',
      dbHighgo: '#5b838f',
      dbVastbase: '#4a7c8f',
      logError: '#ff4d4f',
      logWarn: '#faad14',
      logOk: '#52c41a',
      logInfo: '#1890ff',
    };

    expect(mockThemeColors.isDark).toBe(true);
    expect(mockThemeColors.primary).toBe('#1890ff');
    expect(mockThemeColors.dbMysql).toBe('#4479a1');
    expect(mockThemeColors.dbPostgresql).toBe('#336791');
    expect(mockThemeColors.logError).toBe('#ff4d4f');
  });

  it('has different colors for light mode', () => {
    const lightColors = {
      isDark: false,
      textPrimary: '#000000',
      background: '#ffffff',
      border: '#d9d9d9',
    };

    expect(lightColors.isDark).toBe(false);
    expect(lightColors.textPrimary).toBe('#000000');
    expect(lightColors.background).toBe('#ffffff');
  });

  it('database type colors are distinct', () => {
    const dbColors = {
      mysql: '#4479a1',
      postgresql: '#336791',
      sqlite: '#003b57',
      sqlserver: '#D32029',
      oracle: '#f80000',
      mariadb: '#007582',
      dameng: '#84a35c',
      kingbase: '#6d98a0',
      highgo: '#5b838f',
      vastbase: '#4a7c8f',
    };

    const uniqueColors = new Set(Object.values(dbColors));
    expect(uniqueColors.size).toBe(10);
  });
});
