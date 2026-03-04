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
    TextField,
    Pagination,
    IconButton,
    Select,
    MenuItem,
    Stack,
    FormControl,
    InputAdornment,
    Link,
    Tooltip
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import GridViewIcon from '@mui/icons-material/GridView'; // Placeholder icon
import SaveIcon from '@mui/icons-material/Save';

const SurveyGradingScales = () => {
    const [page, setPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [tabValue, setTabValue] = useState(0);
    const [viewFilter, setViewFilter] = useState('templates');

    const scales = [
        { name: 'Job Satisfaction', description: 'This grading scale is utilized to gauge employee satisfaction levels. Ratings range from 1 to 5, where a...', type: 'Grade in percentages' },
        { name: 'Proficiency Levels', description: 'This grading scale enables the assessment of various levels of achievement in learning. Each categor...', type: 'Grade in percentages' },
    ];

    const columns = [
        { id: 'actions', label: 'Action', width: 100 },
        { id: 'name', label: 'Grading scale name', width: 250 },
        { id: 'description', label: 'Description', width: 400 },
        { id: 'type', label: 'Grade type', width: 200 },
    ];

    return (
        <Box p={3}>
            {/* Header */}
            <Box borderBottom={1} borderColor="divider" mb={2}>
                <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} aria-label="grading scales tabs">
                    <Tab label="Grading scales" sx={{ textTransform: 'none', fontWeight: 'medium' }} />
                    <Tab label="New grading scale" sx={{ textTransform: 'none', fontWeight: 'medium' }} />
                    <Tab label="Question grading templates" sx={{ textTransform: 'none', fontWeight: 'medium' }} />
                    <Tab label="New question grading template" sx={{ textTransform: 'none', fontWeight: 'medium' }} />
                </Tabs>
            </Box>

            <Box mb={2}>
                <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                    <GridViewIcon color="action" />
                    <Typography variant="h6" fontWeight="bold">Grading scales</Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                    View or edit existing grading scales. Use grading scale labels to define grades and set their limits in either percentages or points. For more details, refer to the help section. <Link href="#">Play video</Link>
                </Typography>
            </Box>

            {/* Filter Dropdown */}
            <Box mb={2} display="flex" alignItems="center" gap={2}>
                <Typography variant="body2" fontWeight="medium">Table displays</Typography>
                <FormControl size="small" sx={{ minWidth: 300 }}>
                    <Select value={viewFilter} onChange={(e) => setViewFilter(e.target.value)} displayEmpty>
                        <MenuItem value="templates">List of grading scale templates you created</MenuItem>
                    </Select>
                </FormControl>
            </Box>

            {/* Main Card */}
            <Paper variant="outlined" sx={{ borderRadius: 1 }}>
                {/* Table Toolbar */}
                <Box p={2} borderBottom="1px solid #e0e0e0" display="flex" justifyContent="space-between" alignItems="center">
                    <Box display="flex" alignItems="center" gap={1}>
                        <GridViewIcon fontSize="small" color="action" />
                        <Typography variant="subtitle1" fontWeight="bold">Grading scales</Typography>
                    </Box>
                </Box>

                {/* Table */}
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            {/* Headers */}
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                {columns.map((col) => (
                                    <TableCell key={col.id} sx={{ fontWeight: 'bold' }}>{col.label}</TableCell>
                                ))}
                            </TableRow>
                            {/* Filters */}
                            <TableRow>
                                <TableCell></TableCell>
                                <TableCell sx={{ p: 1 }}>
                                    <TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="disabled" /></InputAdornment> }} />
                                </TableCell>
                                <TableCell sx={{ p: 1 }}>
                                    <TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="disabled" /></InputAdornment> }} />
                                </TableCell>
                                <TableCell sx={{ p: 1 }}>
                                    <FormControl fullWidth size="small">
                                        <Select value="Select one" displayEmpty renderValue={(v) => v === 'Select one' ? <Typography color="text.secondary" variant="body2">Select one</Typography> : v}>
                                            <MenuItem value="Select one">Select one</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {scales.map((scale, index) => (
                                <TableRow key={index} hover>
                                    <TableCell>
                                        <Stack direction="row" spacing={0}>
                                            <Tooltip title="Edit"><IconButton size="small"><EditIcon fontSize="small" /></IconButton></Tooltip>
                                            <Tooltip title="Delete"><IconButton size="small"><DeleteIcon fontSize="small" /></IconButton></Tooltip>
                                        </Stack>
                                    </TableCell>
                                    <TableCell sx={{ fontSize: '0.875rem' }}>{scale.name}</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{scale.description}</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{scale.type}</TableCell>
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
                            <Select value={rowsPerPage} onChange={(e) => setRowsPerPage(Number(e.target.value))} variant="outlined" sx={{ height: 32, fontSize: '0.875rem' }}>
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

export default SurveyGradingScales;
