import { Theme } from '@glideapps/glide-data-grid';
import type { ThemeColors } from '../../hooks/useThemeColors';

type GlideThemeInput = Pick<ThemeColors, 'isDark' | 'primary' | 'primaryHover' | 'primaryActive' | 'textPrimary' | 'textSecondary' | 'textTertiary' | 'textDisabled' | 'background' | 'backgroundCard' | 'backgroundToolbar' | 'backgroundHover' | 'backgroundActive' | 'border' | 'borderLight'>;

export function buildGlideTheme(tc: GlideThemeInput): Partial<Theme> {
  const p = tc.primary;
  const ph = tc.primaryHover;
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  if (tc.isDark) {
    return {
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      baseFontStyle: '12px',
      headerFontStyle: '600 12px',
      editorFontSize: '12px',
      cellHorizontalPadding: 8,
      cellVerticalPadding: 2,
      borderColor: tc.border || '#1E3A5F',
      drilldownBorder: tc.border || '#1E3A5F',
      accentColor: ph,
      accentLight: hexToRgba(ph, 0.15),
      accentFg: '#FFFFFF',
      textDark: tc.textPrimary,
      textMedium: tc.textTertiary,
      textLight: hexToRgba(tc.textTertiary, 0.5),
      textBubble: tc.background,
      textHeader: tc.textPrimary,
      textHeaderSelected: ph,
      bgIconHeader: tc.backgroundToolbar,
      fgIconHeader: tc.textTertiary,
      bgHeader: tc.backgroundToolbar,
      bgHeaderHasFocus: tc.backgroundActive,
      bgHeaderHovered: tc.backgroundToolbar,
      bgBubble: tc.border || '#1E3A5F',
      bgBubbleSelected: tc.backgroundCard,
      bgSearchResult: '#2A2510',
      bgCell: tc.background,
      bgCellMedium: tc.backgroundToolbar,
      linkColor: ph,
      headerIconSize: 16,
      markerFontStyle: '11px',
      lineHeight: 20,
    };
  }

  return {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    baseFontStyle: '12px',
    headerFontStyle: '600 12px',
    editorFontSize: '12px',
    cellHorizontalPadding: 8,
    cellVerticalPadding: 2,
    borderColor: tc.borderLight || '#E2E8F0',
    drilldownBorder: tc.borderLight || '#E2E8F0',
    accentColor: p,
    accentLight: hexToRgba(p, 0.08),
    accentFg: '#FFFFFF',
    textDark: tc.textPrimary,
    textMedium: tc.textSecondary,
    textLight: tc.textTertiary,
    textBubble: '#FFFFFF',
    textHeader: tc.textPrimary,
    textHeaderSelected: p,
    bgIconHeader: tc.backgroundToolbar,
    fgIconHeader: tc.textSecondary,
    bgHeader: tc.backgroundToolbar,
    bgHeaderHasFocus: tc.backgroundActive,
    bgHeaderHovered: tc.backgroundToolbar,
    bgBubble: tc.backgroundToolbar,
    bgBubbleSelected: tc.backgroundActive || '#DBEAFE',
    bgSearchResult: '#FEF3C7',
    bgCell: tc.backgroundCard,
    bgCellMedium: tc.backgroundToolbar,
    linkColor: p,
    headerIconSize: 16,
    markerFontStyle: '11px',
    lineHeight: 20,
  };
}

export const lightGlideTheme: Partial<Theme> = buildGlideTheme({
  isDark: false,
  primary: '#1E3A8A',
  primaryHover: '#2563EB',
  primaryActive: '#1D4ED8',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textTertiary: '#94A3B8',
  textDisabled: '#CBD5E1',
  background: '#FFFFFF',
  backgroundCard: '#FFFFFF',
  backgroundToolbar: '#F8FAFC',
  backgroundHover: '#EFF6FF',
  backgroundActive: '#DBEAFE',
  border: '#E2E8F0',
  borderLight: '#E2E8F0',
});

export const darkGlideTheme: Partial<Theme> = buildGlideTheme({
  isDark: true,
  primary: '#3B82F6',
  primaryHover: '#60A5FA',
  primaryActive: '#2563EB',
  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textTertiary: '#64748B',
  textDisabled: '#475569',
  background: '#0B1426',
  backgroundCard: '#0D1B2E',
  backgroundToolbar: '#0D1B2E',
  backgroundHover: '#112840',
  backgroundActive: '#112840',
  border: '#1E3A5F',
  borderLight: '#1E3A5F',
});
