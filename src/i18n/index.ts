import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCommon from './locales/zh-CN/common.json';
import enCommon from './locales/en-US/common.json';

i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { common: zhCommon },
    'en-US': { common: enCommon },
  },
  lng: 'zh-CN',
  fallbackLng: 'en-US',
  defaultNS: 'common',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
