import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCommon from './locales/zh-CN/common.json';
import enCommon from './locales/en-US/common.json';

const initialLang =
  typeof window !== 'undefined'
    ? localStorage.getItem('idblink-settings')
      ? JSON.parse(localStorage.getItem('idblink-settings')!).settings?.language
      : undefined
    : undefined;

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'zh-CN': { common: zhCommon },
      'en-US': { common: enCommon },
    },
    lng: initialLang || 'zh-CN',
    fallbackLng: 'en-US',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
