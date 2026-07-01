/**
 * SQL 方言转换提示 Banner
 *
 * 当检测到 SQL 语法与目标数据库不匹配时，显示在编辑器顶部。
 */

import { Alert, Button, Space, Tag, Tooltip, Typography } from 'antd';
import { BulbOutlined, ExperimentOutlined, CloseOutlined } from '@ant-design/icons';
import type { DatabaseType } from '../types/api';

const { Text } = Typography;

/** 数据库方言显示名称 */
const DB_DISPLAY_NAMES: Record<string, string> = {
  mysql: 'MySQL',
  mariadb: 'MariaDB',
  postgresql: 'PostgreSQL',
  sqlite: 'SQLite',
  sqlserver: 'SQL Server',
  oracle: 'Oracle',
  dameng: '达梦',
  kingbase: '人大金仓',
  highgo: '瀚高',
  vastbase: 'VastBase',
};

export interface SqlDialectBannerProps {
  /** 识别出的源方言 */
  sourceDialect: DatabaseType;
  /** 当前连接的目标方言 */
  targetDialect: DatabaseType;
  /** 匹配到的特征列表 */
  matchedFeatures: string[];
  /** 规则引擎快速转换（Free） */
  onQuickConvert: () => void;
  /** AI 增强转换（Pro） */
  onAIConvert?: () => void;
  /** 忽略本次提示 */
  onDismiss: () => void;
}

export function SqlDialectBanner({
  sourceDialect,
  targetDialect,
  matchedFeatures,
  onQuickConvert,
  onAIConvert,
  onDismiss,
}: SqlDialectBannerProps) {
  const sourceName = DB_DISPLAY_NAMES[sourceDialect] ?? sourceDialect;
  const targetName = DB_DISPLAY_NAMES[targetDialect] ?? targetDialect;

  const featureTags = matchedFeatures.slice(0, 4).map((f, i) => (
    <Tag key={i} bordered={false} style={{ margin: 0, fontSize: 11 }}>
      {f}
    </Tag>
  ));
  const extraCount = matchedFeatures.length - 4;

  return (
    <Alert
      type="info"
      showIcon
      icon={<BulbOutlined />}
      banner
      style={{
        borderRadius: 0,
        border: 'none',
        borderBottom: '1px solid var(--border)',
        padding: '4px 12px',
        fontSize: 12,
      }}
      message={
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          {/* 左侧：提示信息 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              检测到 <Text strong style={{ fontSize: 12 }}>{sourceName}</Text> 语法，当前连接为{' '}
              <Text strong style={{ fontSize: 12 }}>{targetName}</Text>
            </Text>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {featureTags}
              {extraCount > 0 && (
                <Tooltip title={matchedFeatures.slice(4).join('、')}>
                  <Tag bordered={false} style={{ margin: 0, fontSize: 11 }}>
                    +{extraCount}
                  </Tag>
                </Tooltip>
              )}
            </div>
          </div>

          {/* 右侧：操作按钮 */}
          <Space size={4}>
            <Tooltip title="使用规则引擎转换常见语法差异">
              <Button
                size="small"
                type="primary"
                icon={<BulbOutlined />}
                onClick={onQuickConvert}
                style={{ fontSize: 12, height: 24 }}
              >
                快速转换
              </Button>
            </Tooltip>
            {onAIConvert && (
              <Tooltip title="使用 AI 模型进行深度转换（Pro）">
                <Button
                  size="small"
                  icon={<ExperimentOutlined />}
                  onClick={onAIConvert}
                  style={{ fontSize: 12, height: 24 }}
                >
                  AI 转换
                </Button>
              </Tooltip>
            )}
            <Tooltip title="本次编辑会话不再提示">
              <Button
                size="small"
                type="text"
                icon={<CloseOutlined />}
                onClick={onDismiss}
                style={{ fontSize: 12, height: 24, color: 'var(--color-text-tertiary)' }}
              />
            </Tooltip>
          </Space>
        </div>
      }
    />
  );
}
