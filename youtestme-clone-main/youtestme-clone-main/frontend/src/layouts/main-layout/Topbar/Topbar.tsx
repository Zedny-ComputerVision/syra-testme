import {
    Badge,
    Stack,
    AppBar,
    Toolbar,
    TextField,
    IconButton,
    InputAdornment,
} from '@mui/material';
import IconifyIcon from '../../../components/base/IconifyIcon'; // Adjusted path
import { ReactElement } from 'react';
import { drawerCloseWidth, drawerOpenWidth } from '../constants';
import UserDropdown from './UserDropdown';
import { useBreakpoints } from '../../../providers/BreakpointsProvider'; // Adjusted path

const Topbar = ({
    open,
    handleDrawerToggle,
}: {
    open: boolean;
    handleDrawerToggle: () => void;
}): ReactElement => {
    const { down } = useBreakpoints();

    const isMobileScreen = down('sm');

    return (
        <AppBar
            position="fixed"
            sx={{
                left: 0,
                ml: isMobileScreen ? 0 : open ? `${drawerOpenWidth}px` : `${drawerCloseWidth}px`,
                width: isMobileScreen
                    ? '100%'
                    : open
                        ? `calc(100% - ${drawerOpenWidth}px)`
                        : `calc(100% - ${drawerCloseWidth}px)`,
                paddingRight: '0 !important',
                bgcolor: 'transparent',
                boxShadow: 'none',
                transition: 'width 0.2s, margin 0.2s',
            }}
        >
            <Toolbar
                disableGutters
                sx={{
                    px: 3,
                    bgcolor: 'rgba(255, 255, 255, 0.7)',
                    backdropFilter: 'blur(10px)',
                    height: 80,
                    borderBottom: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 2,
                }}
            >
                {/* LEFT: Menu Toggle - Pinned to start */}
                <Stack direction="row" alignItems="center" sx={{ flexShrink: 0 }}>
                    <IconButton
                        color="inherit"
                        aria-label="open drawer"
                        onClick={handleDrawerToggle}
                        edge="start"
                        sx={{
                            color: 'text.primary',
                            bgcolor: 'background.paper',
                            boxShadow: '0px 2px 4px rgba(0,0,0,0.05)',
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 2,
                            p: 1,
                            '&:hover': { bgcolor: 'action.hover', borderColor: 'primary.main' }
                        }}
                    >
                        <IconifyIcon icon={open ? 'ri:menu-unfold-4-line' : 'ri:menu-unfold-3-line'} width={20} height={20} />
                    </IconButton>
                </Stack>

                {/* CENTER: Search Bar - True Center */}
                <Stack
                    direction="row"
                    alignItems="center"
                    justifyContent="center"
                    sx={{
                        flexGrow: 1,
                        maxWidth: 600,
                        mx: 'auto'
                    }}
                >
                    <TextField
                        variant="outlined"
                        fullWidth
                        placeholder="Search anything..."
                        sx={{
                            display: { xs: 'none', md: 'flex' },
                            '& .MuiOutlinedInput-root': {
                                bgcolor: 'background.paper',
                                borderRadius: 50, // Pill shape for modern feel
                                pr: 1,
                                pl: 2,
                                height: 48,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                                '& fieldset': { border: '1px solid', borderColor: 'transparent' },
                                '&:hover fieldset': { borderColor: 'primary.main' },
                                '&.Mui-focused fieldset': { borderColor: 'primary.main' }
                            }
                        }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <IconifyIcon icon="akar-icons:search" color="text.secondary" width={20} height={20} />
                                </InputAdornment>
                            ),
                            endAdornment: (
                                <IconButton size="small" sx={{ bgcolor: 'action.hover', p: 0.5 }}>
                                    <IconifyIcon icon="mdi:filter-variant" width={16} />
                                </IconButton>
                            )
                        }}
                    />
                </Stack>

                {/* RIGHT: Profile - Pinned to end */}
                <Stack direction="row" alignItems="center" gap={1.5} sx={{ flexShrink: 0 }}>
                    <IconButton
                        sx={{
                            color: 'text.secondary',
                            bgcolor: 'background.paper',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                            '&:hover': { color: 'primary.main' }
                        }}
                    >
                        <Badge color="error" variant="dot">
                            <IconifyIcon icon="ph:bell-bold" width={22} height={22} />
                        </Badge>
                    </IconButton>
                    <UserDropdown />
                </Stack>
            </Toolbar>
        </AppBar>
    );
};

export default Topbar;
