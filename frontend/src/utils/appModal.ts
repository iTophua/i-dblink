/**
 * App Modal 包装 — 解决 antd 静态 Modal.confirm 等不受 ConfigProvider 主题影响的问题。
 *
 * antd v5/v6 的静态方法（Modal.confirm/info/...）在 React 树外挂载，不消费
 * ConfigProvider 的主题 Context，导致暗色主题下弹窗仍是白底。
 *
 * 方案：App 组件初始化时调用 registerAppModal(App.useApp().modal) 注册实例，
 * 后续所有地方用 appModal.confirm(...) 即继承主题。
 * 未注册时 fallback 到静态方法（向后兼容）。
 */
import { Modal } from 'antd';
import type { ModalFuncProps } from 'antd';

// 持有 App.useApp().modal 实例（由顶层 App 组件注册）
let appModalInstance: ReturnType<typeof Modal.useModal>[0] | null = null;

const defaultConfig = { transitionName: '', maskTransitionName: '' };

export function registerAppModal(instance: ReturnType<typeof Modal.useModal>[0]) {
  appModalInstance = instance;
}

export const appModal = {
  confirm: (config: ModalFuncProps) => {
    if (appModalInstance) return appModalInstance.confirm({ ...defaultConfig, ...config });
    return Modal.confirm({ ...defaultConfig, ...config });
  },
  info: (config: ModalFuncProps) => {
    if (appModalInstance) return appModalInstance.info({ ...defaultConfig, ...config });
    return Modal.info({ ...defaultConfig, ...config });
  },
  success: (config: ModalFuncProps) => {
    if (appModalInstance) return appModalInstance.success({ ...defaultConfig, ...config });
    return Modal.success({ ...defaultConfig, ...config });
  },
  error: (config: ModalFuncProps) => {
    if (appModalInstance) return appModalInstance.error({ ...defaultConfig, ...config });
    return Modal.error({ ...defaultConfig, ...config });
  },
  warning: (config: ModalFuncProps) => {
    if (appModalInstance) return appModalInstance.warning({ ...defaultConfig, ...config });
    return Modal.warning({ ...defaultConfig, ...config });
  },
};

export default appModal;
