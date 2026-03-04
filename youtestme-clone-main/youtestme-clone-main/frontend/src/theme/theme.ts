import { createTheme } from '@mui/material';
import breakpoints from './breakpoints';

const createAppTheme = (mode: 'light' | 'dark') => {
    return createTheme({
        breakpoints: breakpoints,
        palette: {
            mode,
            ...(mode === 'dark' ? {
                background: {
                    default: '#121212',
                    paper: '#1e1e1e',
                },
                text: {
                    primary: '#ffffff',
                    secondary: '#b0bec5',
                }
            } : {})
        }
    });
};

export default createAppTheme;
