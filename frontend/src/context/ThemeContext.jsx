import React, { createContext, useEffect, useState, useCallback, useMemo } from 'react';

export const ThemeContext = createContext(null);

const STORAGE_KEY = 'syra_theme';
const ACCENT_KEY = 'syra_accent';
const THEMES = ['light', 'dark'];

const ACCENTS = {
  emerald: { primary: '#10b981', hover: '#0d9668' },
  indigo:  { primary: '#6366f1', hover: '#4f46e5' },
  cyan:    { primary: '#06b6d4', hover: '#0891b2' },
  amber:   { primary: '#f59e0b', hover: '#d97706' },
  pink:    { primary: '#ec4899', hover: '#db2777' },
};

/**
 * Resolve the initial theme from:
 *   1. localStorage preference
 *   2. OS-level prefers-color-scheme
 *   3. fallback to 'dark'
 */
function getInitialTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && THEMES.includes(stored)) return stored;
  } catch {
    // Storage unavailable — continue to fallback
  }

  if (typeof window !== 'undefined' && window.matchMedia) {
    if (window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
  }

  return 'dark';
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme);
  const [accent, setAccentState] = useState(() => {
    try {
      const stored = localStorage.getItem(ACCENT_KEY);
      if (stored && ACCENTS[stored]) return stored;
    } catch {}
    return 'emerald';
  });

  /* Apply theme attribute to <body> and persist to localStorage */
  useEffect(() => {
    document.body.dataset.theme = theme;

    // Also set on documentElement for CSS :root selectors
    document.documentElement.setAttribute('data-theme', theme);

    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Ignore storage errors (e.g. private browsing quota)
    }
  }, [theme]);

  /* Apply accent colors to CSS variables */
  useEffect(() => {
    const scheme = ACCENTS[accent] || ACCENTS.emerald;
    const root = document.documentElement;
    root.style.setProperty('--color-primary', scheme.primary);
    root.style.setProperty('--color-primary-hover', scheme.hover);
    root.style.setProperty('--color-accent', scheme.primary);
    root.style.setProperty('--color-accent-hover', scheme.hover);
    try { localStorage.setItem(ACCENT_KEY, accent); } catch {}
  }, [accent]);

  /* Listen for OS-level theme changes when no explicit preference is stored */
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    function handleChange(e) {
      const stored = localStorage.getItem(STORAGE_KEY);
      // Only auto-switch if the user hasn't explicitly chosen
      if (!stored) {
        setTheme(e.matches ? 'dark' : 'light');
      }
    }

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const setSpecificTheme = useCallback((newTheme) => {
    if (THEMES.includes(newTheme)) {
      setTheme(newTheme);
    }
  }, []);

  const setAccent = useCallback((name) => {
    if (ACCENTS[name]) setAccentState(name);
  }, []);

  const isDark = theme === 'dark';

  const value = useMemo(
    () => ({
      theme,
      isDark,
      toggleTheme,
      accent,
      setAccent,
      setTheme: setSpecificTheme,
    }),
    [theme, isDark, toggleTheme, setSpecificTheme, accent, setAccent]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
