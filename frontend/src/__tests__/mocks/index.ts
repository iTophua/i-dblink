/// <reference types="node" />
import { vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
  emit: vi.fn(),
}));

export const mockTauriInvoke = vi.fn();

vi.mock('monaco-editor', () => ({
  editor: {
    create: vi.fn(() => ({
      onDidChangeModelContent: vi.fn(),
      getValue: vi.fn(() => ''),
      getModel: vi.fn(),
      getSelection: vi.fn(),
      addCommand: vi.fn(),
      dispose: vi.fn(),
    })),
    languages: {
      CompletionItemKind: { Keyword: 1, Function: 2, Field: 3, Class: 4 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 1 },
      registerCompletionItemProvider: vi.fn(),
      MarkerSeverity: { Error: 8 },
      KeyMod: 0x10000,
      KeyCode: { Enter: 2 },
    },
    MarkerSeverity: { Error: 8 },
  },
}));

vi.mock('@monaco-editor/react', () => ({
  default: vi.fn(() => null),
}));

vi.mock('ag-grid-react', () => ({
  AgGridReact: vi.fn(() => null),
}));

vi.mock('ag-grid-community', () => ({
  __esModule: true,
  AgGridReact: vi.fn(() => null),
}));

vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: vi.fn(),
}));

vi.mock('antd', () => ({
  theme: {
    useToken: () => ({ token: {} }),
  },
  ConfigProvider: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../stores/settingsStore', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useSettingsStore: Original } = require('./mocks/settingsStore');
  return { useSettingsStore: Original };
});

vi.mock('../stores/workspaceStore', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useWorkspaceStore: Original } = require('./mocks/workspaceStore');
  return { useWorkspaceStore: Original };
});
