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
        className="hoverable hoverable-primary"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 18,
          height: 18,
          borderRadius: 4,
          fontSize: 12,
          background: 'var(--background-hover)',
          color: 'var(--text-secondary)',
          marginLeft: 4,
        }}
      >
        {icon}
      </span>
    </Tooltip>
  );
};
