import React, { useRef, useLayoutEffect, useState, useEffect } from 'react';
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
  const menuRef = useRef<HTMLDivElement>(null);
  const [adjustedPos, setAdjustedPos] = useState<{ x: number; y: number } | null>(null);

  // 边界检测：确保菜单不超出视口
  useLayoutEffect(() => {
    if (!visible || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let newX = x;
    let newY = y;

    // 水平边界
    if (x + rect.width > vw) {
      newX = Math.max(0, vw - rect.width - 8);
    }
    // 垂直边界：底部超出则向上展开
    if (y + rect.height > vh) {
      newY = Math.max(0, y - rect.height);
    }
    // 确保不超出顶部
    if (newY < 0) {
      newY = 8;
    }

    if (newX !== x || newY !== y) {
      setAdjustedPos({ x: newX, y: newY });
    }
  }, [x, y, visible]);

  // Reset adjusted position when menu is hidden
  useEffect(() => {
    if (!visible) {
      setAdjustedPos(null);
    }
  }, [visible]);

  // 点击/右键菜单外部时关闭菜单。
  // 使用 mousedown（在 contextmenu 之前触发），右键时先关闭菜单，
  // 随后 contextmenu 事件自然冒泡到网格触发新菜单。
  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [visible, onClose]);

  if (!visible) return null;

  // Filter hidden items and empty groups
  const visibleItems = items.filter((item) => {
    if (item.type === 'item') return !item.hidden;
    if (item.type === 'group') return item.items.some((i) => !i.hidden);
    return true; // divider
  });

  const finalX = adjustedPos?.x ?? x;
  const finalY = adjustedPos?.y ?? y;

  return (
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: finalY,
        left: finalX,
        zIndex: 2000,
        background: 'var(--background-card)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        padding: '4px 0',
        minWidth: 180,
        maxHeight: 'calc(100vh - 16px)',
        overflowY: 'auto',
      }}
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
  );
}

export default ContextMenu;
