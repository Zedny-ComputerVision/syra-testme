import { useState, ReactElement, PropsWithChildren } from 'react';
import { Box, Drawer, Toolbar } from '@mui/material';
import Topbar from './Topbar/Topbar';
import Sidebar from './Sidebar/Sidebar';
import Footer from './Footer/Footer';
import { drawerOpenWidth, drawerCloseWidth } from './constants';

const MainLayout = ({ children }: PropsWithChildren): ReactElement => {
    const [open, setOpen] = useState<boolean>(true);
    const handleDrawerToggle = () => setOpen(!open);

    return (
        <>
            <Box sx={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
                <Topbar open={open} handleDrawerToggle={handleDrawerToggle} />
                {/* Mobile Drawer */}
                <Drawer
                    variant="temporary"
                    open={open}
                    onClose={handleDrawerToggle}
                    ModalProps={{
                        keepMounted: true,
                    }}
                    sx={{
                        display: { xs: 'block', sm: 'none' },
                        '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerOpenWidth },
                    }}
                >
                    <Sidebar open={open} />
                </Drawer>
                {/* Desktop Drawer */}
                <Drawer
                    variant="permanent"
                    component="aside"
                    open={open}
                    sx={{
                        display: { xs: 'none', sm: 'block' },
                        width: open ? drawerOpenWidth : drawerCloseWidth,
                        '& .MuiDrawer-paper': {
                            width: open ? drawerOpenWidth : drawerCloseWidth,
                            bgcolor: '#111827', // Force dark background
                            borderRight: '1px solid rgba(255,255,255,0.1)'
                        },
                    }}
                >
                    <Sidebar open={open} />
                </Drawer>
                <Box
                    component="main"
                    sx={{
                        width: 1,
                        flexGrow: 1,
                        height: '100%',
                        overflow: 'auto',
                        pt: 5,
                        pr: { xs: 3, sm: 5.175 },
                        pb: 6.25,
                        pl: { xs: 3, sm: 5.25 },
                    }}
                >
                    <Toolbar
                        sx={{
                            height: 96,
                        }}
                    />
                    {children}
                </Box>
            </Box>
            <Footer open={open} />
        </>
    );
};

export default MainLayout;
