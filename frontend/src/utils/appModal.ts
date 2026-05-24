/** App Modal 包装 - 统一禁用过渡动画，避免全局修改 Modal 静态方法 */
import { Modal } from 'antd';
import type { ModalFuncProps } from 'antd';

const defaultConfig = { transitionName: '', maskTransitionName: '' };

export const appModal = {
  confirm: (config: ModalFuncProps) => Modal.confirm({ ...defaultConfig, ...config }),
  info: (config: ModalFuncProps) => Modal.info({ ...defaultConfig, ...config }),
  success: (config: ModalFuncProps) => Modal.success({ ...defaultConfig, ...config }),
  error: (config: ModalFuncProps) => Modal.error({ ...defaultConfig, ...config }),
  warning: (config: ModalFuncProps) => Modal.warning({ ...defaultConfig, ...config }),
};

export default appModal;
