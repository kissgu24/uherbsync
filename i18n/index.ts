import { I18n } from 'i18n-js';
import { zh } from '../locales/zh';
import { en } from '../locales/en';

export const i18n = new I18n({ zh, en });
i18n.defaultLocale = 'zh';
i18n.locale = 'zh';
i18n.enableFallback = true;
