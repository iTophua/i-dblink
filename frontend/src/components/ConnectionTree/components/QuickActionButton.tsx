import React from 'react';
import { Tooltip } from 'antd';

interface QuickActionButtonProps {
  icon: React.ReactNode;
  tooltip: string;
  onClick: (e: React.MouseEvent) => void;
  visible: boolean;
}

export const QuickActionButton: React.FC<QuickActionButtonProps> = ({
  icon,
  tooltip,
  onClick,
  visible,
}) => {
  if (!visible) return null;

  return (
    <Tooltip title={tooltip} placement="right">
      <span
        onClick={onClick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: 4,
          cursor: 'pointer',
          fontSize: 12,
          background: 'var(--background-hover)',
          color: 'var(--text-secondary)',
          transition: 'all 0.2s ease',
          marginLeft: 4,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'var(--border-color)';
          e.currentTarget.style.color = 'var(--color-primary)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'var(--background-hover)';
          e.currentTarget.style.color = 'var(--text-secondary)';
        }}
      >
        {icon}
      </span>
    </Tooltip>
  );
};
