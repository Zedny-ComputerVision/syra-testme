import { useState } from 'react';
import {
    Box,
    Typography,
    Button,
    ToggleButtonGroup,
    ToggleButton,
    Paper,
    Link,
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';

const MyFavoriteReports = () => {
    const [view, setView] = useState('my-favorites');

    const handleViewChange = (_: any, newView: string) => {
        if (newView !== null) {
            setView(newView);
        }
    };

    return (
        <Box p={3}>
            {/* Header */}
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
                <Box>
                    <Typography variant="body2" color="primary" gutterBottom sx={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                        My favorite reports
                    </Typography>
                    <Typography variant="h5" fontWeight="bold">My favorite reports</Typography>
                    <Typography variant="body2" color="text.secondary">
                        View the list of reports you've marked as favorites. You can also add new ones from the predefined reports list. <Link href="#">Play video</Link>
                    </Typography>
                </Box>
                <Box display="flex" flexDirection="column" alignItems="flex-end" gap={1}>
                    <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 'medium' }}>View</Typography>
                    <ToggleButtonGroup
                        value={view}
                        exclusive
                        onChange={handleViewChange}
                        size="small"
                        sx={{ bgcolor: 'white' }}
                    >
                        <ToggleButton value="my-favorites" sx={{ textTransform: 'none', px: 3, '&.Mui-selected': { bgcolor: '#0f172a', color: 'white', '&:hover': { bgcolor: '#1e293b' } } }}>
                            My favorite reports
                        </ToggleButton>
                        <ToggleButton value="role-favorites" sx={{ textTransform: 'none', px: 3, '&.Mui-selected': { bgcolor: '#0f172a', color: 'white', '&:hover': { bgcolor: '#1e293b' } } }}>
                            My role favorite reports
                        </ToggleButton>
                    </ToggleButtonGroup>
                </Box>
            </Box>

            {/* Empty State */}
            <Paper variant="outlined" sx={{
                borderRadius: 2,
                minHeight: '400px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                bgcolor: 'transparent',
                borderStyle: 'dashed'
            }}>
                <Box sx={{
                    width: 80,
                    height: 80,
                    bgcolor: '#f1f5f9',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    mb: 3
                }}>
                    <HelpOutlineIcon sx={{ fontSize: 40, color: '#94a3b8' }} />
                </Box>
                <Typography variant="body2" color="text.secondary" mb={3} textAlign="center">
                    Click on the <strong>"Add favorite report"</strong> button to add selected<br />
                    predefined reports to your favorite reports list.
                </Typography>
                <Button
                    variant="contained"
                    sx={{
                        bgcolor: '#0f172a',
                        textTransform: 'none',
                        px: 4,
                        py: 1,
                        '&:hover': { bgcolor: '#1e293b' }
                    }}
                >
                    Add favorite report
                </Button>
            </Paper>
        </Box>
    );
};

export default MyFavoriteReports;
