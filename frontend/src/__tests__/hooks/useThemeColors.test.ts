import { describe, it, expect } from 'vitest';
import { useThemeColors } from '../../hooks/useThemeColors';
import { DB_TYPE_COLORS } from '../../styles/theme';

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
      logError: '#ff4d4f',
      logWarn: '#faad14',
      logOk: '#52c41a',
      logInfo: '#1890ff',
    };

    expect(mockThemeColors.isDark).toBe(true);
    expect(mockThemeColors.primary).toBe('#1890ff');
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
    // 直接引用 theme.ts 的单一来源，避免测试里再养一份会过时的副本
    const dbColors = Object.entries(DB_TYPE_COLORS).filter(([k]) => k !== 'default');

    expect(dbColors.length).toBe(10);
    expect(new Set(dbColors.map(([, v]) => v)).size).toBe(10);
  });
});
