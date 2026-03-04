import { ReactElement, useState } from 'react';
import { List, Toolbar, ListItem, ListItemButton, ListItemIcon, ListItemText, Collapse, Box, Tooltip, Link, Typography } from '@mui/material';
import { navSections } from '../../../data/nav-items'; // Adjusted path
import SimpleBar from 'simplebar-react';
import 'simplebar-react/dist/simplebar.min.css';
import { drawerCloseWidth, drawerOpenWidth } from '../constants';
import Image from '../../../components/base/Image'; // Adjusted path
import IconifyIcon from '../../../components/base/IconifyIcon'; // Adjusted path
const logo = '/home-logo.png'; // Direct usage instead of import to avoid vite processing issues if file missing
import { rootPaths } from '../../../routes/paths'; // Adjusted path
import { useLocation, Link as RouterLink } from 'react-router-dom';

const Sidebar = ({ open }: { open: boolean }): ReactElement => {
    const { pathname } = useLocation();
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        'home': true,
        'assignments': false,
        'users': false,
        'tests': true,
        'testing-center': false,
        'surveys': false,
        'training': false,
        'reporting': false,
        'system': false,
    });

    const toggleSection = (sectionId: string) => {
        setExpandedSections(prev => ({
            ...prev,
            [sectionId]: !prev[sectionId],
        }));
    };

    return (
        <>
            <Toolbar
                sx={{
                    position: 'fixed',
                    height: 105,
                    zIndex: 1,
                    bgcolor: '#111827', // Force dark background
                    p: 0,
                    justifyContent: 'center',
                    width: open ? drawerOpenWidth - 1 : drawerCloseWidth - 1,
                    borderBottom: '1px solid rgba(255,255,255,0.1)'
                }}
            >
                <Link
                    component={RouterLink}
                    to={rootPaths.homeRoot}
                    sx={{
                        mt: open ? 0 : 3,
                        display: 'flex',
                        alignItems: 'center',
                        transition: 'opacity 0.2s',
                        textDecoration: 'none',
                        '&:hover': { opacity: 0.8 }
                    }}
                >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        <Image
                            src={logo}
                            alt="Zedny Test Me"
                            height={50}
                            sx={{ maxWidth: 50, objectFit: 'contain' }}
                        />
                        {open && (
                            <Typography
                                variant="h5"
                                color="text.primary"
                                sx={{
                                    fontWeight: 700,
                                    whiteSpace: 'nowrap',
                                    background: 'linear-gradient(45deg, #2196F3 30%, #21CBF3 90%)',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent'
                                }}
                            >
                                Zedny Test Me
                            </Typography>
                        )}
                    </Box>
                </Link>
            </Toolbar>
            <SimpleBar style={{ maxHeight: '100vh' }}>
                <List
                    component="nav"
                    sx={{
                        mt: 14.5,
                        py: 1,
                        px: open ? 1.5 : 0.5,
                    }}
                >
                    {navSections.map((section) => (
                        <Box key={section.id} sx={{ mb: 0.5 }}>
                            <>
                                {/* Section Header - Collapsible button */}
                                <Tooltip title={!open ? section.title : ''} placement="right">
                                    <ListItemButton
                                        onClick={() => open && toggleSection(section.id)}
                                        component={!open ? RouterLink : 'div'}
                                        to={!open && section.items.length > 0 ? section.items[0].path : undefined}
                                        sx={{
                                            borderRadius: 2,
                                            py: 1.25,
                                            px: open ? 2 : 1,
                                            justifyContent: open ? 'flex-start' : 'center',
                                            bgcolor: expandedSections[section.id] ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.04)',
                                            transition: 'all 0.2s ease-in-out',
                                            '&:hover': {
                                                bgcolor: 'rgba(76, 175, 80, 0.16)', // Green tint
                                                transform: open ? 'translateX(4px)' : 'none',
                                                '& .MuiListItemIcon-root': {
                                                    color: '#4caf50', // Green
                                                },
                                                '& .MuiListItemText-primary': {
                                                    color: '#4caf50', // Green
                                                },
                                                '& .iconify': {
                                                    color: '#4caf50', // Green
                                                }
                                            },
                                        }}
                                    >
                                        <ListItemIcon sx={{ minWidth: open ? 36 : 'auto', color: 'grey.400', justifyContent: 'center', transition: 'color 0.2s' }}>
                                            {section.icon.includes('/') || section.icon.includes('.') ? (
                                                <Box component="img" src={section.icon} alt={section.title} sx={{ width: 22, height: 22, objectFit: 'contain' }} />
                                            ) : (
                                                <IconifyIcon icon={section.icon} width={22} height={22} />
                                            )}
                                        </ListItemIcon>
                                        {open && (
                                            <>
                                                <ListItemText
                                                    primary={section.title}
                                                    primaryTypographyProps={{
                                                        fontSize: '0.9rem',
                                                        fontWeight: 500,
                                                        color: 'grey.300',
                                                        sx: { transition: 'color 0.2s' }
                                                    }}
                                                />
                                                <IconifyIcon
                                                    icon={expandedSections[section.id] ? 'mdi:chevron-up' : 'mdi:chevron-down'}
                                                    width={20}
                                                    height={20}
                                                    color="grey.500"
                                                    style={{ transition: 'color 0.2s' }}
                                                />
                                            </>
                                        )}
                                    </ListItemButton>
                                </Tooltip>

                                {/* Section Items - Show when expanded AND sidebar is open */}
                                {open && (
                                    <Collapse in={expandedSections[section.id]} timeout="auto">
                                        <List component="div" disablePadding sx={{ pt: 0.5 }}>
                                            {section.items.map((item) => {
                                                const isActive = pathname === item.path;
                                                return (
                                                    <ListItem
                                                        key={item.id}
                                                        disablePadding
                                                        sx={{
                                                            borderLeft: isActive ? '3px solid' : '3px solid transparent',
                                                            borderColor: isActive ? '#4caf50' : 'transparent',
                                                            bgcolor: isActive ? 'rgba(255, 255, 255, 0.05)' : 'transparent',
                                                            transition: 'all 0.2s ease-in-out',
                                                            '&:hover': {
                                                                bgcolor: isActive ? 'rgba(76, 175, 80, 0.16)' : 'rgba(76, 175, 80, 0.08)',
                                                                borderColor: isActive ? '#4caf50' : '#81c784',
                                                            }
                                                        }}
                                                    >
                                                        <ListItemButton
                                                            component={RouterLink}
                                                            to={item.path}
                                                            sx={{
                                                                py: 0.75,
                                                                pl: 4,
                                                                transition: 'all 0.2s ease-in-out',
                                                                '&:hover': {
                                                                    bgcolor: 'transparent',
                                                                    pl: 5,
                                                                    '& .MuiListItemText-primary': {
                                                                        color: '#4caf50',
                                                                    },
                                                                },
                                                            }}
                                                        >
                                                            <ListItemText
                                                                primary={item.title}
                                                                primaryTypographyProps={{
                                                                    fontSize: '0.85rem',
                                                                    color: isActive ? 'primary.light' : 'grey.400',
                                                                    fontWeight: isActive ? 500 : 400,
                                                                    sx: { transition: 'color 0.2s' }
                                                                }}
                                                            />
                                                        </ListItemButton>
                                                    </ListItem>
                                                );
                                            })}
                                        </List>
                                    </Collapse>
                                )}
                            </>
                        </Box>
                    ))}
                </List>
            </SimpleBar>
        </>
    );
};

export default Sidebar;
