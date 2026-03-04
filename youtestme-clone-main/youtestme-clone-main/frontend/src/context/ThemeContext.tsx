import { createContext, useContext } from 'react';

type ThemeMode = 'light' | 'dark';

interface ThemeContextType {
    mode: ThemeMode;
    toggleTheme: () => void;
}

export const ThemeContext = createContext<ThemeContextType>({
    mode: 'dark',
    toggleTheme: () => { }
});

export const useThemeContext = () => useContext(ThemeContext);
