/// <reference types="vite/client" />

interface SqlHistoryApi {
  addHistory: (item: {
    sql: string;
    success: boolean;
    duration?: number;
    rowCount?: number;
  }) => void;
}

declare global {
  interface WindowEventMap {
    'app-action': CustomEvent<{ action: string }>;
    'menu-action': CustomEvent<{ action: string }>;
  }

  interface Window {
    __sqlHistoryApi?: SqlHistoryApi;
  }
}

export {};
