import React, { useCallback } from 'react';
import type { MenuConfigItem, MenuItemConfig } from './types';

interface ContextMenuProps {
  items: MenuConfigItem[];
  visible: boolean;
  x: number;
  y: number;
  onClose: () => void;
}

function MenuItem({ item }: { item: MenuItemConfig }) {
  const { icon, label, disabled, danger, onClick } = item;
  return (
    <div
      style={{
        padding: '6px 12px',
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        color: danger ? 'var(--color-error)' : disabled ? 'var(--text-disabled)' : 'var(--text-primary)',
        opacity: disabled ? 0.5 : 1,
      }}
      onClick={(e) => {
        if (disabled) return;
        e.stopPropagation();
        onClick();
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = 'var(--background-hover)';
      }}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {icon}
      {label}
    </div>
  );
}

export function ContextMenu({ items, visible, x, y, onClose }: ContextMenuProps) {
  if (!visible) return null;

  // Filter hidden items and empty groups
  const visibleItems = items.filter((item) => {
    if (item.type === 'item') return !item.hidden;
    if (item.type === 'group') return item.items.some((i) => !i.hidden);
    return true; // divider
  });

  return (
    <>
      {/* Click overlay to close */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 1999 }} onClick={onClose} />
      {/* Menu */}
      <div
        style={{
          position: 'fixed',
          top: y,
          left: x,
          zIndex: 2000,
          background: 'var(--background-card)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          padding: '4px 0',
          minWidth: 180,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {visibleItems.map((item, index) => {
          if (item.type === 'divider') {
            return <div key={`divider-${index}`} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />;
          }
          if (item.type === 'group') {
            return (
              <div key={item.label || `group-${index}`}>
                {item.label && (
                  <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>
                    {item.label}
                  </div>
                )}
                {item.items
                  .filter((i) => !i.hidden)
                  .map((subItem) => (
                    <MenuItem key={subItem.key} item={subItem} />
                  ))}
              </div>
            );
          }
          return <MenuItem key={item.key} item={item} />;
        })}
      </div>
    </>
  );
}

export default ContextMenu;
