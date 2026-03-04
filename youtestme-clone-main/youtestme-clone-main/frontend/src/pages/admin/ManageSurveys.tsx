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
    TextField,
    Pagination,
    IconButton,
    Select,
    MenuItem,
    Stack,
    FormControl,
    InputAdornment,
    Chip,
    Link,
    Menu,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import Edit3Icon from '@mui/icons-material/Edit'; // Placeholder for survey icon
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SaveIcon from '@mui/icons-material/Save';
import DescriptionIcon from '@mui/icons-material/Description'; // Closest to survey icon

const ManageSurveys = () => {
    const [page, setPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [filterAnchor, setFilterAnchor] = useState<null | HTMLElement>(null);

    // Mock data matching screenshot
    const surveys = [
        {
            id: 100003,
            name: 'Job Satisfaction Survey',
            sessions: 0,
            status: 'Published',
            creationTime: 'Sep-26-2023 11:00 AM EEST',
            reportDisplayed: 'Immediately after grading',
            reportContent: 'Score and details'
        },
    ];

    const columns = [
        { id: 'id', label: 'ID', width: 80 },
        { id: 'name', label: 'Name', width: 250 },
        { id: 'sessions', label: 'Testing sessions', width: 150 },
        { id: 'status', label: 'Status', width: 120 },
        { id: 'creationTime', label: 'Creation time', width: 200 },
        { id: 'reportDisplayed', label: 'Report displayed', width: 200 },
        { id: 'reportContent', label: 'Report content', width: 150 },
        { id: 'actions', label: 'Actions', width: 300 },
    ];

    return (
        <Box p={3}>
            {/* Header */}
            <Box mb={2}>
                <Typography variant="h5" fontWeight="bold">Manage surveys</Typography>
                <Typography variant="body2" color="text.secondary">
                    Access the list of surveys you can manage. Schedule surveys for candidates, modify survey configurations, or view reports.
                </Typography>
            </Box>

            {/* Main Card */}
            <Paper variant="outlined" sx={{ borderRadius: 1 }}>
                {/* Toolbar */}
                <Box p={2} borderBottom="1px solid #e0e0e0" display="flex" justifyContent="space-between" alignItems="center">
                    <Box display="flex" alignItems="center" gap={1}>
                        <DescriptionIcon fontSize="small" color="action" />
                        <Typography variant="subtitle1" fontWeight="bold">Survey information</Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                        <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#0f172a', textTransform: 'none' }}>
                            New survey
                        </Button>
                        <Button variant="outlined" endIcon={<FilterListIcon />} sx={{ textTransform: 'none', color: 'text.primary', borderColor: 'divider' }}>
                            Filter
                        </Button>
                    </Stack>
                </Box>

                {/* Table */}
                <TableContainer sx={{ overflowX: 'auto' }}>
                    <Table size="small" sx={{ minWidth: 1200 }}>
                        <TableHead>
                            {/* Column Headers */}
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                {columns.map((col) => (
                                    <TableCell key={col.id} sx={{ fontWeight: 'bold' }}>{col.label}</TableCell>
                                ))}
                            </TableRow>
                            {/* Filter inputs row */}
                            <TableRow>
                                <TableCell sx={{ p: 1 }}>
                                    <TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="disabled" /></InputAdornment> }} />
                                </TableCell>
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
                                            <MenuItem value="Published">Published</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell sx={{ p: 1 }}></TableCell>
                                <TableCell sx={{ p: 1 }}>
                                    <FormControl fullWidth size="small">
                                        <Select value="Select one" displayEmpty renderValue={(v) => v === 'Select one' ? <Typography color="text.secondary" variant="body2">Select one</Typography> : v}>
                                            <MenuItem value="Select one">Select one</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell sx={{ p: 1 }}>
                                    <FormControl fullWidth size="small">
                                        <Select value="Select one" displayEmpty renderValue={(v) => v === 'Select one' ? <Typography color="text.secondary" variant="body2">Select one</Typography> : v}>
                                            <MenuItem value="Select one">Select one</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell sx={{ p: 1 }}></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {surveys.map((survey) => (
                                <TableRow key={survey.id} hover>
                                    <TableCell>{survey.id}</TableCell>
                                    <TableCell>
                                        <Link href="#" underline="hover" fontWeight="medium">{survey.name}</Link>
                                    </TableCell>
                                    <TableCell>
                                        <Link href="#" underline="hover">{survey.sessions}</Link>
                                    </TableCell>
                                    <TableCell>
                                        <Chip label={survey.status} color="success" size="small" variant="filled" sx={{ bgcolor: '#e0f2f1', color: '#00695c', fontWeight: 'bold' }} />
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{survey.creationTime}</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{survey.reportDisplayed}</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{survey.reportContent}</TableCell>
                                    <TableCell>
                                        <Stack direction="row" spacing={0.5}>
                                            <Button variant="contained" color="success" size="small" sx={{ textTransform: 'none', minWidth: 'auto', px: 2 }}>Preview</Button>
                                            <Button variant="contained" sx={{ bgcolor: '#0f172a', textTransform: 'none', minWidth: 'auto', px: 2 }}>Schedule</Button>
                                            <Button variant="outlined" size="small" sx={{ textTransform: 'none', color: 'text.secondary', borderColor: 'rgba(0,0,0,0.23)' }}>Candidates</Button>
                                            <IconButton size="small"><MoreVertIcon fontSize="small" /></IconButton>
                                        </Stack>
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
                            <Select value={rowsPerPage} onChange={(e) => setRowsPerPage(Number(e.target.value))} variant="outlined" sx={{ height: 32, fontSize: '0.875rem' }}>
                                <MenuItem value={10}>10</MenuItem>
                                <MenuItem value={20}>20</MenuItem>
                            </Select>
                        </FormControl>

                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box component="span" sx={{ bgcolor: '#e0f2f1', p: 0.5, borderRadius: '50%', color: 'success.main', display: 'flex' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                            </Box>
                            Rows: 1
                        </Typography>
                    </Stack>
                </Box>
            </Paper>
        </Box>
    );
};

export default ManageSurveys;
