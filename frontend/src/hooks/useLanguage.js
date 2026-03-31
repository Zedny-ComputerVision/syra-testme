import { useState, useCallback, useMemo } from 'react';
import { translations, languages, rtlLanguages } from '../locales';

/**
 * Language hook with 10-language support.
 *
 * Usage:
 *   const { lang, t, setLanguage, dir, fontFamily, languages } = useLanguage();
 *   <h1>{t('welcome')}</h1>
 */
export default function useLanguage() {
  const [lang, setLang] = useState(() => {
    try {
      const stored = localStorage.getItem('syra_lang');
      if (stored && translations[stored]) return stored;
    } catch {
      // Ignore storage errors
    }
    return 'en';
  });

  /** Translate a key, falling back to English then to the key itself */
  const t = useCallback(
    (key) => {
      return translations[lang]?.[key] ?? translations.en?.[key] ?? key;
    },
    [lang]
  );

  /** Set language by code */
  const setLanguage = useCallback((code) => {
    if (!translations[code]) return;
    setLang(code);
    try {
      localStorage.setItem('syra_lang', code);
    } catch {
      // Ignore
    }
    // Update document attributes for RTL and font
    const meta = languages.find((l) => l.code === code);
    if (meta) {
      document.documentElement.dir = meta.dir;
      document.documentElement.lang = code;
      document.documentElement.style.setProperty(
        '--font-family-lang',
        meta.fontFamily || "'Inter', system-ui, sans-serif"
      );
    }
  }, []);

  /** Text direction for the current language */
  const dir = useMemo(() => (rtlLanguages.includes(lang) ? 'rtl' : 'ltr'), [lang]);

  /** Font family for the current language */
  const fontFamily = useMemo(() => {
    const meta = languages.find((l) => l.code === lang);
    return meta?.fontFamily || null;
  }, [lang]);

  // Set document attributes on initial render
  useMemo(() => {
    const meta = languages.find((l) => l.code === lang);
    if (meta) {
      document.documentElement.dir = meta.dir;
      document.documentElement.lang = lang;
      document.documentElement.style.setProperty(
        '--font-family-lang',
        meta.fontFamily || "'Inter', system-ui, sans-serif"
      );
    }
  }, [lang]);

  return { lang, t, setLanguage, dir, fontFamily, languages };
}
