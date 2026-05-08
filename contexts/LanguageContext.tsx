import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import * as Localization from 'expo-localization';
import { i18n } from '../i18n';
import { initDB, getSetting, setSetting } from '../db/db';

export type Language = 'zh' | 'en';

type LanguageCtx = {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
};

const LanguageContext = createContext<LanguageCtx>({
  language: 'zh',
  setLanguage: async () => {},
});

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>('zh');

  useEffect(() => {
    (async () => {
      try {
        await initDB();
        const saved = await getSetting('language');
        if (saved === 'zh' || saved === 'en') {
          setLanguageState(saved);
          i18n.locale = saved;
        } else {
          const deviceLang = Localization.getLocales()[0]?.languageCode;
          const defaultLang: Language = deviceLang === 'zh' ? 'zh' : 'en';
          const defaultCountry = deviceLang === 'zh' ? 'TW' : 'OFF';
          await setSetting('language', defaultLang);
          await setSetting('country', defaultCountry);
          setLanguageState(defaultLang);
          i18n.locale = defaultLang;
        }
      } catch {}
    })();
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    i18n.locale = lang;
    try {
      await setSetting('language', lang);
    } catch {}
  }, []);

  return (
    <LanguageContext.Provider value={{ language, setLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
