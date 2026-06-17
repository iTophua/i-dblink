import { useState, useCallback } from 'react';
import type { ContextMenuState, ContextMenuTarget } from './types';

export interface UseContextMenuReturn {
  menuState: ContextMenuState;
  menuTarget: ContextMenuTarget;
  openMenu: (x: number, y: number, target: ContextMenuTarget) => void;
  closeMenu: () => void;
}

export function useContextMenu(): UseContextMenuReturn {
  const [menuState, setMenuState] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
  });
  const [menuTarget, setMenuTarget] = useState<ContextMenuTarget>({});

  const openMenu = useCallback((x: number, y: number, target: ContextMenuTarget) => {
    setMenuState({ visible: true, x, y });
    setMenuTarget(target);
  }, []);

  const closeMenu = useCallback(() => {
    setMenuState((prev) => ({ ...prev, visible: false }));
  }, []);

  return {
    menuState,
    menuTarget,
    openMenu,
    closeMenu,
  };
}

export default useContextMenu;