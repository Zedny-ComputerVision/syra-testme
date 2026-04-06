import { createContext, createElement, useContext, useState, useCallback, useMemo } from 'react';
import { translations, languages, rtlLanguages } from '../locales';

const LanguageContext = createContext(null);

function applyDocumentAttributes(code) {
  const meta = languages.find((l) => l.code === code);
  if (meta) {
    document.documentElement.dir = meta.dir;
    document.documentElement.lang = code;
    document.documentElement.style.setProperty(
      '--font-family-lang',
      meta.fontFamily || "'Inter', system-ui, sans-serif"
    );
  }
}

function getInitialLang() {
  try {
    const stored = localStorage.getItem('syra_lang');
    if (stored && translations[stored]) return stored;
  } catch {
    // Ignore storage errors
  }
  return 'en';
}

/**
 * Language provider — wrap the app once at the top level.
 *
 * Usage:
 *   <LanguageProvider><App /></LanguageProvider>
 */
export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const initial = getInitialLang();
    applyDocumentAttributes(initial);
    return initial;
  });

  const t = useCallback(
    (key, vars) => {
      let str = translations[lang]?.[key] ?? translations.en?.[key] ?? key;
      if (vars && typeof vars === 'object') {
        Object.entries(vars).forEach(([k, v]) => {
          str = str.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v ?? ''));
        });
      }
      return str;
    },
    [lang]
  );

  const setLanguage = useCallback((code) => {
    if (!translations[code]) return;
    setLang(code);
    try {
      localStorage.setItem('syra_lang', code);
    } catch {
      // Ignore
    }
    applyDocumentAttributes(code);
  }, []);

  const dir = useMemo(() => (rtlLanguages.includes(lang) ? 'rtl' : 'ltr'), [lang]);

  const fontFamily = useMemo(() => {
    const meta = languages.find((l) => l.code === lang);
    return meta?.fontFamily || null;
  }, [lang]);

  const value = useMemo(
    () => ({ lang, t, setLanguage, dir, fontFamily, languages }),
    [lang, t, setLanguage, dir, fontFamily]
  );

  return createElement(LanguageContext.Provider, { value }, children);
}

/**
 * Language hook — consumes the shared LanguageContext.
 *
 * Usage:
 *   const { lang, t, setLanguage, dir, fontFamily, languages } = useLanguage();
 *   <h1>{t('welcome')}</h1>
 */
export default function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within a <LanguageProvider>');
  }
  return ctx;
}
