import { useState } from 'react';
import {
    Box,
    Typography,
    Paper,
    Table,
    TableContainer,
    TableHead,
    TableBody,
    TableRow,
    TableCell,
    Button,
    Tabs,
    Tab,
    FormControl,
    Select,
    MenuItem,
    TextField,
    InputAdornment,
    Pagination,
    IconButton,
    Stack,
    Link,
    Tooltip,
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import SaveIcon from '@mui/icons-material/Save';
import ShowChartIcon from '@mui/icons-material/ShowChart'; // Closest for the chart icon
import AnalyticsIcon from '@mui/icons-material/Analytics';

const GradingScales = () => {
    const [tabValue, setTabValue] = useState(0);
    const [page, setPage] = useState(1);
    const [viewMode, setViewMode] = useState('list_created');

    const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    const scales = [
        { id: 1, name: 'Job Satisfaction', description: 'This grading scale is utilized to gauge employee satisfaction levels. Ratings range from 1 to 5, where a...', type: 'Grade in percentages' },
        { id: 2, name: 'Proficiency Levels', description: 'This grading scale enables the assessment of various levels of achievement in learning. Each categor...', type: 'Grade in percentages' },
    ];

    return (
        <Box p={3}>
            {/* Header Tabs */}
            <Box borderBottom={1} borderColor="divider" mb={2}>
                <Tabs value={tabValue} onChange={handleTabChange} aria-label="grading scales tabs">
                    <Tab label="Grading scales" />
                    <Tab label="New grading scale" />
                    <Tab label="Question grading templates" />
                    <Tab label="New question grading template" />
                </Tabs>
            </Box>

            {/* Title Block */}
            <Box mb={3}>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                    <AnalyticsIcon color="action" />
                    <Typography variant="h6" fontWeight="bold">Grading scales</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                    View or edit existing grading scales. Use grading scale labels to define grades and set their limits in either percentages or points. For more details, refer to the help section. <Link href="#">Play video</Link>
                </Typography>
            </Box>

            {/* View Selector */}
            <Box mb={2}>
                <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>Table displays</Typography>
                <FormControl fullWidth size="small" sx={{ maxWidth: 400 }}>
                    <Select
                        value={viewMode}
                        onChange={(e) => setViewMode(e.target.value)}
                        variant="outlined"
                    >
                        <MenuItem value="list_created">List of grading scale templates you created</MenuItem>
                        <MenuItem value="all">All grading scales</MenuItem>
                    </Select>
                </FormControl>
            </Box>

            {/* Main Table Card */}
            <Paper variant="outlined" sx={{ borderRadius: 1 }}>

                <Box p={2} borderBottom="1px solid #e0e0e0" display="flex" alignItems="center" gap={1}>
                    <ShowChartIcon fontSize="small" color="action" />
                    <Typography variant="subtitle2" fontWeight="bold">Grading scales</Typography>
                </Box>

                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                <TableCell sx={{ fontWeight: 'bold', width: 100 }}>Action</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Grading scale name</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                                <TableCell sx={{ fontWeight: 'bold', width: 200 }}>Grade type</TableCell>
                            </TableRow>
                            {/* Filter Row */}
                            <TableRow>
                                <TableCell sx={{ p: 1 }}></TableCell>
                                <TableCell sx={{ p: 1 }}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        placeholder="Search"
                                        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="disabled" /></InputAdornment> }}
                                    />
                                </TableCell>
                                <TableCell sx={{ p: 1 }}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        placeholder="Search"
                                        InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="disabled" /></InputAdornment> }}
                                    />
                                </TableCell>
                                <TableCell sx={{ p: 1 }}>
                                    <FormControl fullWidth size="small">
                                        <Select value="Select one" displayEmpty renderValue={(v) => v === 'Select one' ? <Typography color="text.secondary" variant="body2">Select one</Typography> : v}>
                                            <MenuItem value="Select one">Select one</MenuItem>
                                            <MenuItem value="percent">Grade in percentages</MenuItem>
                                            <MenuItem value="points">Grade in points</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {scales.map((scale) => (
                                <TableRow key={scale.id} hover>
                                    <TableCell>
                                        <Stack direction="row" spacing={1}>
                                            <Tooltip title="Edit">
                                                <IconButton size="small"><EditIcon fontSize="small" /></IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete">
                                                <IconButton size="small"><DeleteIcon fontSize="small" /></IconButton>
                                            </Tooltip>
                                        </Stack>
                                    </TableCell>
                                    <TableCell>
                                        <Link href="#" underline="hover">{scale.name}</Link>
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                                        {scale.description}
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                                        {scale.type}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>

                {/* Footer */}
                <Box p={2} borderTop="1px solid #e0e0e0" display="flex" justifyContent="space-between" alignItems="center">
                    <Link href="#" underline="hover" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', fontSize: '0.875rem' }}>
                        <SaveIcon fontSize="small" />
                        <Typography variant="body2" component="span">Save displayed column set</Typography>
                    </Link>

                    <Stack direction="row" alignItems="center" gap={2}>
                        <Pagination count={1} page={page} onChange={(_, p) => setPage(p)} shape="rounded" size="small" />

                        <FormControl size="small">
                            <Select value={10} variant="outlined" sx={{ height: 32, fontSize: '0.875rem' }}>
                                <MenuItem value={10}>10</MenuItem>
                                <MenuItem value={20}>20</MenuItem>
                            </Select>
                        </FormControl>

                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box component="span" sx={{ bgcolor: '#e0f2f1', p: 0.5, borderRadius: '50%', color: 'success.main', display: 'flex' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                            </Box>
                            Rows: 2
                        </Typography>
                    </Stack>
                </Box>
            </Paper>
        </Box>
    );
};

export default GradingScales;
