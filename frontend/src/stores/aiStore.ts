import { create } from 'zustand';
import { api, type AICloudConfig, type AICloudConfigInput, type AIConnTestResult, type AIModel, type AIModelsRequest } from '../api';

interface AIState {
  // 从后端同步的配置快照（API Key 仅为掩码）
  enabled: boolean;
  ready: boolean;
  provider: string;
  baseUrl: string;
  apiKeyMask: string;
  model: string;

  // 动态拉取的模型列表
  models: AIModel[];
  loadingModels: boolean;

  // 加载状态
  loading: boolean;

  // Actions
  loadConfig: () => Promise<void>;
  checkStatus: () => Promise<void>;
  saveConfig: (config: AICloudConfigInput) => Promise<void>;
  testConnection: (config: AICloudConfigInput) => Promise<AIConnTestResult>;
  loadModels: (req: AIModelsRequest) => Promise<AIModel[]>;
  clearModels: () => void;
}

export const useAIStore = create<AIState>((set) => ({
  enabled: false,
  ready: false,
  provider: '',
  baseUrl: '',
  apiKeyMask: '',
  model: '',
  models: [],
  loadingModels: false,
  loading: false,

  loadConfig: async () => {
    set({ loading: true });
    try {
      const config: AICloudConfig = await api.getAICloudConfig();
      set({
        enabled: config.enabled,
        provider: config.provider,
        baseUrl: config.baseUrl,
        apiKeyMask: config.apiKeyMask,
        model: config.model,
        loading: false,
      });
    } catch (err) {
      set({ loading: false });
      console.error('Failed to load AI config:', err);
    }
  },

  checkStatus: async () => {
    try {
      const status = await api.getAIStatus();
      set({ enabled: status.enabled, ready: status.ready });
    } catch (err) {
      console.error('Failed to check AI status:', err);
    }
  },

  saveConfig: async (config: AICloudConfigInput) => {
    await api.saveAICloudConfig(config);
    // 保存后重新加载配置 + 检查状态
    const [cfg, status] = await Promise.all([api.getAICloudConfig(), api.getAIStatus()]);
    set({
      enabled: cfg.enabled,
      ready: status.ready,
      provider: cfg.provider,
      baseUrl: cfg.baseUrl,
      apiKeyMask: cfg.apiKeyMask,
      model: cfg.model,
    });
  },

  testConnection: async (config: AICloudConfigInput) => {
    return await api.testAIConnection(config);
  },

  loadModels: async (req: AIModelsRequest) => {
    set({ loadingModels: true });
    try {
      const models = await api.getAIModels(req);
      set({ models, loadingModels: false });
      return models;
    } catch (err) {
      set({ loadingModels: false });
      throw err;
    }
  },

  clearModels: () => set({ models: [] }),
}));
