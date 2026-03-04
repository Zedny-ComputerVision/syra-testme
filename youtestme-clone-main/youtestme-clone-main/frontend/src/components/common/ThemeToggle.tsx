import { IconButton, Tooltip } from '@mui/material';
import IconifyIcon from '../base/IconifyIcon';
import { useThemeContext } from 'context/ThemeContext';

interface ThemeToggleProps {
    sx?: object;
}

const ThemeToggle = ({ sx }: ThemeToggleProps) => {
    const { mode, toggleTheme } = useThemeContext();

    return (
        <Tooltip title={mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
            <IconButton
                onClick={toggleTheme}
                sx={{
                    color: 'text.primary',
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                    width: 40,
                    height: 40,
                    transition: 'all 0.2s',
                    '&:hover': {
                        transform: 'scale(1.1)',
                        bgcolor: 'action.hover'
                    },
                    ...sx
                }}
            >
                <IconifyIcon
                    icon={mode === 'dark' ? 'ph:sun-bold' : 'ph:moon-bold'}
                    width={20}
                    height={20}
                />
            </IconButton>
        </Tooltip>
    );
};

export default ThemeToggle;
