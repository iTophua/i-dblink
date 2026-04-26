import { DB_TYPE_COLORS } from '../styles/theme';

interface DatabaseIconProps {
  type: string;
  size?: number;
  showLabel?: boolean;
}

const DB_LABELS: Record<string, string> = {
  mysql: 'My',
  postgresql: 'Pg',
  sqlite: 'Sq',
  sqlserver: 'SS',
  oracle: 'Or',
  mariadb: 'Ma',
  dameng: 'DM',
  kingbase: 'KB',
  highgo: 'HG',
  vastbase: 'VB',
};

export function DatabaseIcon({ type, size = 20, showLabel = true }: DatabaseIconProps) {
  const color = DB_TYPE_COLORS[type as keyof typeof DB_TYPE_COLORS] || DB_TYPE_COLORS.default;
  const label = DB_LABELS[type] || type.slice(0, 2).toUpperCase();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: 4,
        backgroundColor: color,
        color: '#fff',
        fontSize: size * 0.55,
        fontWeight: 600,
        fontFamily: 'monospace',
        flexShrink: 0,
      }}
    >
      {showLabel ? label : ''}
    </span>
  );
}

export function DatabaseIconWithLabel({ type, size = 20 }: DatabaseIconProps) {
  const color = DB_TYPE_COLORS[type as keyof typeof DB_TYPE_COLORS] || DB_TYPE_COLORS.default;
  const label = DB_LABELS[type] || type.slice(0, 2).toUpperCase();

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <DatabaseIcon type={type} size={size} />
      <span style={{ color, fontWeight: 600, fontSize: 13 }}>{label}</span>
    </span>
  );
}
