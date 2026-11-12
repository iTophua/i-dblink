import React from 'react';
import { Skeleton, Card, Space, Typography, Empty, Button } from 'antd';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../hooks/useThemeColors';
import { isMacOS } from '../constants/menuShortcuts';
import { DB_TYPE_COLORS } from '../styles/theme';
import {
  DatabaseOutlined,
  TableOutlined,
  PlusOutlined,
  FolderOpenOutlined,
  FileTextOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';

const { Text } = Typography;

export interface EnhancedEmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    type?: 'primary' | 'default';
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
    icon?: React.ReactNode;
    disabled?: boolean;
  };
  tips?: string[];
}

export const EnhancedEmptyState: React.FC<EnhancedEmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  secondaryAction,
  tips,
}) => {
  const tc = useThemeColors();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 20px',
        minHeight: 240,
        animation: 'fadeIn 0.4s ease',
      }}
    >
      {/* 紧凑方形图标位：48px squircle，替代旧版 80px 大圆环，
          去掉描边只留 alpha 底色，更像原生应用的占位图形 */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: 'var(--color-primary-alpha-15)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
        }}
      >
        {icon || <DatabaseOutlined style={{ fontSize: 22, color: 'var(--color-primary)' }} />}
      </div>

      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--text-primary)',
          marginBottom: 4,
          textAlign: 'center',
        }}
      >
        {title}
      </div>

      {description && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-tertiary)',
            textAlign: 'center',
            maxWidth: 260,
            marginBottom: 16,
            lineHeight: 1.6,
          }}
        >
          {description}
        </div>
      )}

      <Space orientation="vertical" size={8} style={{ width: '100%', maxWidth: 220 }}>
        {action && (
          <Button
            type={action.type || 'primary'}
            icon={action.icon || <PlusOutlined />}
            onClick={action.onClick}
            block
            style={{
              height: 30,
              fontSize: 12.5,
              borderRadius: 7,
            }}
          >
            {action.label}
          </Button>
        )}

        {secondaryAction && (
          <Button
            type="text"
            icon={secondaryAction.icon || <FolderOpenOutlined />}
            onClick={secondaryAction.onClick}
            disabled={secondaryAction.disabled}
            block
            style={{
              height: 28,
              fontSize: 12.5,
              borderRadius: 7,
              color: 'var(--text-secondary)',
            }}
          >
            {secondaryAction.label}
          </Button>
        )}
      </Space>

      {tips && tips.length > 0 && (
        <div
          style={{
            marginTop: 24,
            padding: '12px 14px',
            background: 'var(--background-hover)',
            borderRadius: 10,
            maxWidth: 280,
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 7,
          }}
        >
          {tips.map((tip, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 8,
                fontSize: 12,
                color: 'var(--text-secondary)',
                lineHeight: 1.55,
              }}
            >
              {/* 2px 微点：替代旧版 ul 圆点列表的「文档感」 */}
              <span
                style={{
                  width: 3,
                  height: 3,
                  borderRadius: '50%',
                  background: 'var(--text-tertiary)',
                  flexShrink: 0,
                  marginTop: 8,
                }}
              />
              <span>{tip}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export const ConnectionTreeSkeleton: React.FC = () => {
  const tc = useThemeColors();

  return (
    <div style={{ padding: '12px 8px' }}>
      <Skeleton.Input active size="small" style={{ width: 200, marginBottom: 16 }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Skeleton.Avatar active size="small" style={{ flexShrink: 0 }} />
            <Skeleton.Input
              active
              size="small"
              style={{
                width: 120 + Math.random() * 60,
                background: 'var(--background-hover)',
              }}
            />
          </div>
        ))}

        <div
          style={{
            marginLeft: 24,
            marginTop: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Skeleton.Input active size="small" style={{ width: 16 }} />
              <Skeleton.Input
                active
                size="small"
                style={{
                  width: 80 + Math.random() * 40,
                  background: 'var(--background-hover)',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export const TableDataSkeleton: React.FC<{ rows?: number; cols?: number }> = ({
  rows = 5,
  cols = 4,
}) => {
  const tc = useThemeColors();

  return (
    <div
      style={{
        padding: 16,
        background: 'var(--background-card)',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 12,
          marginBottom: 16,
          paddingBottom: 12,
          borderBottom: `1px solid var(--border)`,
        }}
      >
        {[...Array(cols)].map((_, i) => (
          <Skeleton.Input
            key={i}
            active
            size="small"
            style={{
              width: 80 + Math.random() * 60,
              background: 'var(--background-hover)',
            }}
          />
        ))}
      </div>

      {[...Array(rows)].map((_, rowIndex) => (
        <div
          key={rowIndex}
          style={{
            display: 'flex',
            gap: 12,
            marginBottom: 12,
            animation: `fadeSlideIn 0.3s ease ${rowIndex * 0.05}s both`,
          }}
        >
          {[...Array(cols)].map((_, colIndex) => (
            <Skeleton.Input
              key={colIndex}
              active
              size="small"
              style={{
                width: 80 + Math.random() * 60,
                background: 'var(--background-hover)',
              }}
            />
          ))}
        </div>
      ))}
    </div>
  );
};

export const QueryResultSkeleton: React.FC = () => {
  const tc = useThemeColors();

  return (
    <div
      style={{
        padding: 16,
        background: 'var(--background-card)',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          marginBottom: 20,
        }}
      >
        <Skeleton.Avatar active size="large" />
        <div style={{ flex: 1 }}>
          <Skeleton.Input active size="small" style={{ width: '60%', marginBottom: 8 }} />
          <Skeleton.Input active size="small" style={{ width: '40%' }} />
        </div>
      </div>

      <TableDataSkeleton rows={6} cols={5} />
    </div>
  );
};

/**
 * 工作台首页（未选连接时的首个界面）
 *
 * 设计原则：
 * - 左对齐工作台，不做居中营销页；两块卡各自按内容高度排布，不强行拉平
 * - CTA 只在这里出现一次（侧栏空状态已收敛为一行静默占位）
 * - 右侧优先展示「最近使用」，没有最近记录时回退到快捷键
 */
export interface RecentDatabaseItem {
  connectionId: string;
  database: string;
  connectionName: string;
  dbType: string;
  connected: boolean;
  lastUsed: number;
}

export const QuickStartGuide: React.FC<{
  connectionCount: number;
  recentDatabases: RecentDatabaseItem[];
  onOpenRecentDatabase?: (connectionId: string, database: string) => void;
  onCreateConnection: () => void;
  onImportConnection: () => void;
  onOpenSqlFile?: () => void;
  onShowShortcuts: () => void;
}> = ({
  connectionCount,
  recentDatabases,
  onOpenRecentDatabase,
  onCreateConnection,
  onImportConnection,
  onOpenSqlFile,
  onShowShortcuts,
}) => {
  const { t } = useTranslation();

  const shortcuts = [
    { keys: isMacOS() ? '⌘K' : 'Ctrl+K', label: t('common.commandPalette.title') },
    { keys: isMacOS() ? '⌘N' : 'Ctrl+N', label: t('common.newConnection') },
    { keys: isMacOS() ? '⌘/' : 'Ctrl+/', label: t('common.shortcutsTitle') },
  ];

  const dbTypes = [
    { key: 'mysql', label: 'MySQL', abbr: 'My' },
    { key: 'postgresql', label: 'PostgreSQL', abbr: 'Pg' },
    { key: 'sqlite', label: 'SQLite', abbr: 'Lt' },
    { key: 'sqlserver', label: 'SQL Server', abbr: 'Ms' },
    { key: 'oracle', label: 'Oracle', abbr: 'Or' },
    { key: 'dameng', label: t('common.damengLabel'), abbr: 'Dm' },
  ];

  const steps = [
    { title: t('common.welcome.step1Title'), desc: t('common.welcome.step1Desc') },
    { title: t('common.welcome.step2Title'), desc: t('common.welcome.step2Desc') },
    { title: t('common.welcome.step3Title'), desc: t('common.welcome.step3Desc') },
  ];

  // 相对时间只用于展示，不参与状态推导；渲染期取一次当前时间即可
  // eslint-disable-next-line react-hooks/purity
  const nowTs = Date.now();

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const diffMs = nowTs - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t('common.justNow');
    if (diffMins < 60) return t('common.minutesAgo', { count: diffMins });
    if (diffHours < 24) return t('common.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('common.daysAgo', { count: diffDays });
    return date.toLocaleDateString();
  };

  return (
    <div style={{ width: '100%', maxWidth: 1100, padding: '32px 40px 28px' }}>
      <div
        style={{
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          color: 'var(--text-primary)',
        }}
      >
        {t('common.welcome.getStarted')}
      </div>
      <div
        style={{
          fontSize: 12.5,
          color: 'var(--text-tertiary)',
          marginTop: 6,
          marginBottom: 22,
        }}
      >
        {connectionCount === 0
          ? t('common.welcome.noConnectionHint')
          : t('common.welcome.selectConnectionHint')}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 1.1fr) minmax(300px, 0.9fr)',
          gap: 16,
          // 两块卡按内容自然高度排布：不再用 stretch 把主卡撑出空洞
          alignItems: 'start',
        }}
      >
        {/* 主卡：连接数据库 + 三步引导 */}
        <div
          style={{
            background: 'var(--background-card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'var(--color-primary-gradient)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 16,
                flexShrink: 0,
                boxShadow: '0 4px 14px var(--color-primary-alpha-30)',
              }}
            >
              <DatabaseOutlined />
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('common.createNewDatabaseConnection')}
            </div>
          </div>

          {/* 支持类型：品牌色圆点 chips；限宽 330 保证固定三列两行（窄窗口自动 2 列） */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              maxWidth: 330,
            }}
          >
            {dbTypes.map((d) => (
              <span
                key={d.key}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '3px 8px',
                  borderRadius: 999,
                  border: '1px solid var(--border-color-light)',
                  background: 'var(--background-toolbar)',
                  fontSize: 11,
                  color: 'var(--text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: DB_TYPE_COLORS[d.key] || DB_TYPE_COLORS.default,
                  }}
                />
                {d.label}
              </span>
            ))}
          </div>

          {/* 三步引导：填满主卡纵向空间，比把按钮推到卡片底部更自然 */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 2 }}>
            {steps.map((s, index) => (
              <div key={s.title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: '50%',
                    flexShrink: 0,
                    marginTop: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'var(--color-primary)',
                    background: 'var(--color-primary-alpha-15)',
                  }}
                >
                  {index + 1}
                </span>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)' }}>
                    {s.title}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      lineHeight: 1.6,
                      color: 'var(--text-tertiary)',
                      marginTop: 1,
                    }}
                  >
                    {s.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={onCreateConnection}>
              {t('common.newConnection')}
            </Button>
            <Button icon={<FolderOpenOutlined />} onClick={onImportConnection}>
              {t('common.importConnections')}
            </Button>
            <Button type="text" icon={<FileTextOutlined />} onClick={onOpenSqlFile}>
              {t('common.openSqlFile')}
            </Button>
          </div>
        </div>

        {/* 副卡：最近使用 / 快捷键 */}
        <div
          style={{
            background: 'var(--background-card)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {recentDatabases.length > 0 ? (
            <>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: 8,
                }}
              >
                {t('common.recentDatabases')}
              </div>
              {recentDatabases.map((r) => {
                const badge = dbTypes.find((d) => d.key === r.dbType);
                return (
                <button
                  key={`${r.connectionId}-${r.database}`}
                  type="button"
                  className="hoverable"
                  onClick={() => onOpenRecentDatabase?.(r.connectionId, r.database)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '7px 8px',
                    border: 'none',
                    borderRadius: 8,
                    background: 'transparent',
                    textAlign: 'left',
                    font: 'inherit',
                    color: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  {/* 与侧栏一致的字母徽标：官方 logo 在 16px 下发灰，辨识度不如品牌色块 */}
                  <span
                    aria-hidden="true"
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 8,
                      fontWeight: 600,
                      color: '#fff',
                      background: DB_TYPE_COLORS[r.dbType] || DB_TYPE_COLORS.default,
                      boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    {badge?.abbr || 'Db'}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      minWidth: 0,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 1,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12.5,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.database}
                    </span>
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 5,
                        fontSize: 11,
                        color: 'var(--text-tertiary)',
                        minWidth: 0,
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: '50%',
                          flexShrink: 0,
                          background: r.connected
                            ? 'var(--color-success)'
                            : 'var(--text-disabled)',
                        }}
                      />
                      <span
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {r.connectionName}
                      </span>
                    </span>
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--text-tertiary)',
                      flexShrink: 0,
                    }}
                  >
                    {formatTime(r.lastUsed)}
                  </span>
                </button>
                );
              })}
              <div style={{ marginTop: 10 }}>
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, height: 'auto', fontSize: 12 }}
                  onClick={onShowShortcuts}
                >
                  {t('common.viewShortcuts')}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  marginBottom: 10,
                }}
              >
                {t('common.shortcutsTitle')}
              </div>
              {shortcuts.map((s) => (
                <div
                  key={s.keys}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '7px 8px',
                    margin: '0 -8px',
                    fontSize: 12.5,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <kbd
                    style={{
                      minWidth: 42,
                      textAlign: 'center',
                      fontFamily: 'var(--font-family-code)',
                      fontSize: 11,
                      padding: '1px 6px',
                      borderRadius: 5,
                      border: '1px solid var(--border)',
                      background: 'var(--background-toolbar)',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    {s.keys}
                  </kbd>
                  {s.label}
                </div>
              ))}
              <div style={{ marginTop: 10 }}>
                <Button
                  type="link"
                  size="small"
                  style={{ padding: 0, height: 'auto', fontSize: 12 }}
                  onClick={onShowShortcuts}
                >
                  {t('common.viewShortcuts')}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
