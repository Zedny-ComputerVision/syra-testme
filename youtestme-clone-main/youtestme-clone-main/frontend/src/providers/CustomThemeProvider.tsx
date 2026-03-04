import { ReactNode, useState, useMemo } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { ThemeContext } from 'context/ThemeContext';
import createAppTheme from 'theme/theme';
import BreakpointsProvider from 'providers/BreakpointsProvider';

interface CustomThemeProviderProps {
    children: ReactNode;
}

const CustomThemeProvider = ({ children }: CustomThemeProviderProps) => {
    const [mode, setMode] = useState<'light' | 'dark'>('light');

    const toggleTheme = () => {
        setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
    };

    const theme = useMemo(() => createAppTheme(mode), [mode]);

    const contextValue = useMemo(() => ({
        mode,
        toggleTheme
    }), [mode]);

    return (
        <ThemeContext.Provider value={contextValue}>
            <ThemeProvider theme={theme}>
                <BreakpointsProvider>
                    <CssBaseline />
                    {children}
                </BreakpointsProvider>
            </ThemeProvider>
        </ThemeContext.Provider>
    );
};

export default CustomThemeProvider;
