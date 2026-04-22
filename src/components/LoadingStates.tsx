import React from 'react';
import { Skeleton, Card, Space, Typography, Empty, Button } from 'antd';
import { useThemeColors } from '../hooks/useThemeColors';
import {
  DatabaseOutlined,
  TableOutlined,
  PlusOutlined,
  FolderOpenOutlined,
  ThunderboltOutlined,
  BranchesOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;

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
        padding: '40px 20px',
        minHeight: 300,
        animation: 'fadeIn 0.4s ease',
      }}
    >
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--row-hover-bg) 0%, var(--background-card) 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
          border: `2px solid var(--row-selected-bg)`,
        }}
      >
        {icon || <DatabaseOutlined style={{ fontSize: 36, color: 'var(--color-primary)' }} />}
      </div>

      <Title level={4} style={{ marginBottom: 8, textAlign: 'center' }}>
        {title}
      </Title>

      {description && (
        <Text
          type="secondary"
          style={{
            fontSize: 14,
            textAlign: 'center',
            maxWidth: 400,
            marginBottom: 20,
            display: 'block',
          }}
        >
          {description}
        </Text>
      )}

      <Space direction="vertical" size={12} style={{ width: '100%', maxWidth: 300 }}>
        {action && (
          <Button
            type={action.type || 'primary'}
            icon={action.icon || <PlusOutlined />}
            onClick={action.onClick}
            size="large"
            block
            style={{
              height: 44,
              fontSize: 15,
              borderRadius: 8,
            }}
          >
            {action.label}
          </Button>
        )}

        {secondaryAction && (
          <Button
            icon={secondaryAction.icon || <FolderOpenOutlined />}
            onClick={secondaryAction.onClick}
            size="large"
            block
            style={{
              height: 44,
              fontSize: 15,
              borderRadius: 8,
            }}
          >
            {secondaryAction.label}
          </Button>
        )}
      </Space>

      {tips && tips.length > 0 && (
        <div
          style={{
            marginTop: 32,
            padding: '16px 20px',
            background: 'var(--background-toolbar)',
            borderRadius: 12,
            border: `1px solid var(--border)`,
            maxWidth: 500,
            width: '100%',
          }}
        >
          <Text
            strong
            style={{
              fontSize: 12,
              color: 'var(--color-primary)',
              display: 'block',
              marginBottom: 12,
            }}
          >
            💡 提示
          </Text>
          <ul
            style={{
              margin: 0,
              paddingLeft: 20,
              color: 'var(--text-secondary)',
              fontSize: 13,
              lineHeight: 1.8,
            }}
          >
            {tips.map((tip, index) => (
              <li key={index}>{tip}</li>
            ))}
          </ul>
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

export const QuickStartGuide: React.FC<{
  onCreateConnection: () => void;
  onImportConnection: () => void;
}> = ({ onCreateConnection, onImportConnection }) => {
  const tc = useThemeColors();

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: 16,
        padding: '0 20px 20px',
      }}
    >
      <Card
        hoverable
        onClick={onCreateConnection}
        style={{
          borderRadius: 12,
          border: `1px solid var(--border)`,
          transition: 'all 0.3s ease',
        }}
        styles={{
          body: {
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          },
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--primary-active) 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <PlusOutlined style={{ fontSize: 24, color: '#fff' }} />
        </div>
        <Text strong style={{ fontSize: 15 }}>
          新建连接
        </Text>
        <Text type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>
          创建新的数据库连接
        </Text>
      </Card>

      <Card
        hoverable
        onClick={onImportConnection}
        style={{
          borderRadius: 12,
          border: `1px solid var(--border)`,
          transition: 'all 0.3s ease',
        }}
        styles={{
          body: {
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          },
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            background: 'linear-gradient(135deg, var(--color-success) 0%, #389e0d 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FolderOpenOutlined style={{ fontSize: 24, color: '#fff' }} />
        </div>
        <Text strong style={{ fontSize: 15 }}>
          导入连接
        </Text>
        <Text type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>
          从文件导入连接配置
        </Text>
      </Card>

      <Card
        hoverable
        style={{
          borderRadius: 12,
          border: `1px solid var(--border)`,
          transition: 'all 0.3s ease',
        }}
        styles={{
          body: {
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          },
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 12,
            background: 'linear-gradient(135deg, var(--color-warning) 0%, #d48806 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <BranchesOutlined style={{ fontSize: 24, color: '#fff' }} />
        </div>
        <Text strong style={{ fontSize: 15 }}>
          快速入门
        </Text>
        <Text type="secondary" style={{ fontSize: 12, textAlign: 'center' }}>
          查看使用教程
        </Text>
      </Card>
    </div>
  );
};
