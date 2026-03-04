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
    Checkbox,
    Chip
} from '@mui/material';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SearchIcon from '@mui/icons-material/Search';
import SaveIcon from '@mui/icons-material/Save';
import FilterListIcon from '@mui/icons-material/FilterList';
import UploadIcon from '@mui/icons-material/Upload';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ReplayIcon from '@mui/icons-material/Replay';
import HistoryIcon from '@mui/icons-material/History';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PlayArrowIcon from '@mui/icons-material/PlayArrow'; // Placeholder for check

// Moved imports to top level
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import TableChartIcon from '@mui/icons-material/TableChart';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AddIcon from '@mui/icons-material/Add';

const Candidates = () => {
    const [tabValue, setTabValue] = useState(0);
    const [page, setPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [filterStatus, setFilterStatus] = useState('all');

    const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    // Correct Mock Data
    const attempts = [
        { id: 101458, username: 'admin', testName: 'اختبار المدققين', session: 'Testing session with pr...', userGroup: 'Proctoring user group', status: 'Ready to continue', date: 'Dec-18-2025 09:00 AM EET', sessionStatus: 'Finished' },
        { id: 101448, username: 'student39', testName: 'اختبار المدققين', session: 'Testing session with SEB', userGroup: '', status: 'Ready to continue', date: 'Dec-18-2025 09:00 AM EET', sessionStatus: 'Finished' },
        { id: 101438, username: 'ytm_admin', testName: 'اختبار المدققين', session: 'Testing session with SEB', userGroup: '', status: 'Ready to continue', date: 'Dec-18-2025 09:00 AM EET', sessionStatus: 'Finished' },
        { id: 101418, username: 'Dr.Majed', testName: 'اختبار المدققين', session: 'Testing session with SEB', userGroup: '', status: 'Not attempted', date: 'Oct-31-2025 10:47 AM EET', sessionStatus: 'Inactive' },
        { id: 101408, username: 'Dr.Mohamed', testName: 'اختبار المدققين', session: 'Testing session with SEB', userGroup: '', status: 'Not attempted', date: 'Oct-31-2025 10:47 AM EET', sessionStatus: 'Inactive' },
        { id: 101398, username: 'salma.student', testName: 'اختبار المدققين', session: 'Testing session with SEB', userGroup: '', status: 'Ready to continue', date: 'Oct-01-2025 11:58 PM EEST', sessionStatus: 'Inactive' },
        { id: 101378, username: 'student24', testName: 'اختبار المدققين', session: 'Testing session with SEB', userGroup: '', status: 'Not attempted', date: 'Oct-01-2025 11:58 PM EEST', sessionStatus: 'Inactive' },
        { id: 101358, username: 'student', testName: 'اختبار المدققين', session: 'Testing session with SEB', userGroup: '', status: 'Not attempted', date: 'Oct-01-2025 11:58 PM EEST', sessionStatus: 'Inactive' },
        { id: 101348, username: 'student19', testName: 'اختبار المدققين', session: 'Testing session with SEB', userGroup: '', status: 'Not attempted', date: 'Oct-01-2025 05:27 PM EEST', sessionStatus: 'Available now' },
        { id: 101338, username: 'instructor', testName: 'اختبار المدققين', session: 'Testing session with SEB', userGroup: '', status: 'Not attempted', date: 'Oct-01-2025 05:27 PM EEST', sessionStatus: 'Available now' },
    ];

    return (
        <Box p={3}>
            {/* Header Tabs */}
            <Box borderBottom={1} borderColor="divider" mb={2}>
                <Tabs value={tabValue} onChange={handleTabChange} aria-label="candidates tabs">
                    <Tab label="Test attempts" />
                    <Tab label="Proctoring" />
                    <Tab label="Rescheduling requests" />
                    <Tab label="Imported results" />
                </Tabs>
            </Box>

            {/* Title Block */}
            <Box mb={2}>
                <Typography variant="h6" fontWeight="bold" display="flex" alignItems="center" gap={1}>
                    <DescriptionOutlinedIcon fontSize="small" color="action" /> Test attempts
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    Manage all candidate-related actions for any test or testing session from this page. You can add or remove candidates, view test results, and monitor proctored tests.
                </Typography>
            </Box>

            {/* Filters Section */}
            <Box mb={3} display="flex" gap={2}>
                {/* Test Filter */}
                <Box flex={1}>
                    <Typography variant="caption" color="text.secondary" mb={0.5} display="block">Test</Typography>
                    <Box display="flex" gap={1}>
                        <TextField fullWidth size="small" placeholder="No test has been selected" />
                        <Button variant="contained" sx={{ bgcolor: '#0f172a', minWidth: 40 }}><AddIcon /></Button>
                    </Box>
                </Box>
                {/* Session Filter */}
                <Box flex={1}>
                    <Typography variant="caption" color="text.secondary" mb={0.5} display="block">Testing session</Typography>
                    <Box display="flex" gap={1}>
                        <FormControl fullWidth size="small">
                            <Select value="all" displayEmpty>
                                <MenuItem value="all">All testing sessions</MenuItem>
                            </Select>
                        </FormControl>
                        <Button variant="contained" sx={{ bgcolor: '#0f172a', minWidth: 40 }}><AddIcon /></Button>
                        <Button variant="outlined" sx={{ minWidth: 40 }}><CalendarMonthIcon color="action" /></Button>

                    </Box>
                </Box>
                {/* Calendar/Date Picker Placeholder */}
                <Box flex={1}>
                    <Typography variant="caption" color="text.secondary" mb={0.5} display="block">February 09, 2026</Typography>
                    <Link href="#" underline="hover" fontSize="0.75rem">Show all</Link>
                </Box>
            </Box>

            {/* Status Filters Bar */}
            <Box display="flex" justifyContent="flex-end" alignItems="center" gap={1} mb={2} flexWrap="wrap">
                <Typography variant="body2" color="text.secondary">Filter by status</Typography>
                <Stack direction="row" spacing={0} sx={{ border: '1px solid #e0e0e0', borderRadius: 1 }}>
                    <Button size="small" variant="text" color="inherit">Attempted: 1</Button>
                    <Box borderRight="1px solid #e0e0e0" />
                    <Button size="small" variant="text" color="inherit">Not attempted: 41</Button>
                    <Box borderRight="1px solid #e0e0e0" />
                    <Button size="small" variant="text" color="inherit">Passed: 0</Button>
                    <Box borderRight="1px solid #e0e0e0" />
                    <Button size="small" variant="text" color="inherit">Failed: 0</Button>
                    <Box borderRight="1px solid #e0e0e0" />
                    <Button size="small" variant="text" color="inherit">Not graded: 1</Button>
                    <Box borderRight="1px solid #e0e0e0" />
                    <Button size="small" variant="text" color="inherit">Verified: 0</Button>
                    <Box borderRight="1px solid #e0e0e0" />
                    <Button size="small" variant="text" color="inherit">Not verified: 48</Button>
                    <Box borderRight="1px solid #e0e0e0" />
                    <Button size="small" variant="text" color="inherit">For review: 0</Button>
                </Stack>
                <IconButton color="error" size="small"><FilterListIcon /></IconButton>
            </Box>

            {/* Main Table Card */}
            <Paper variant="outlined" sx={{ borderRadius: 1 }}>

                {/* Toolbar */}
                <Box p={2} borderBottom="1px solid #e0e0e0" display="flex" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <TableChartIcon color="action" fontSize="small" />
                        <Typography variant="subtitle2" fontWeight="bold">List of all test attempts across tests and sessions</Typography>
                    </Stack>
                    <Stack direction="row" spacing={1}>
                        <Button variant="contained" sx={{ bgcolor: '#0f172a', textTransform: 'none' }}>Assign candidates</Button>
                        <Button variant="outlined" endIcon={<ExpandMoreIcon />} sx={{ textTransform: 'none' }}>Actions</Button>
                        <Button variant="outlined" endIcon={<ExpandMoreIcon />} sx={{ textTransform: 'none' }}>Data Transfer</Button>
                        <Button variant="outlined" endIcon={<FilterListIcon />} sx={{ textTransform: 'none' }}>Filter</Button>
                    </Stack>
                </Box>

                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                <TableCell padding="checkbox"><Checkbox size="small" /></TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Attempt ID</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Username</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Test name</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Testing session name</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>User group</TableCell>
                                <TableCell sx={{ fontWeight: 'bold' }}>Attempt status</TableCell>
                            </TableRow>
                            {/* Filter Row */}
                            <TableRow>
                                <TableCell padding="checkbox"><Checkbox size="small" /></TableCell>
                                <TableCell></TableCell>
                                <TableCell><TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="disabled" /></InputAdornment> }} /></TableCell>
                                <TableCell><TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="disabled" /></InputAdornment> }} /></TableCell>
                                <TableCell><TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="disabled" /></InputAdornment> }} /></TableCell>
                                <TableCell><TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="disabled" /></InputAdornment> }} /></TableCell>
                                <TableCell><TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="disabled" /></InputAdornment> }} /></TableCell>
                                <TableCell>
                                    <FormControl fullWidth size="small">
                                        <Select value="Select one" displayEmpty renderValue={(v) => v === 'Select one' ? <Typography color="text.secondary" variant="body2">Select one</Typography> : v}>
                                            <MenuItem value="Select one">Select one</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {attempts.map((row) => (
                                <TableRow key={row.id} hover>
                                    <TableCell padding="checkbox">
                                        <Checkbox size="small" />
                                    </TableCell>
                                    <TableCell>
                                        <Stack direction="row" spacing={0.5}>
                                            <Tooltip title="View"><IconButton size="small"><VisibilityIcon fontSize="small" /></IconButton></Tooltip>
                                            <Tooltip title="History"><IconButton size="small"><HistoryIcon fontSize="small" /></IconButton></Tooltip>
                                            <Tooltip title="Replay"><IconButton size="small"><ReplayIcon fontSize="small" /></IconButton></Tooltip>
                                            <Tooltip title="Play"><IconButton size="small"><PlayArrowIcon fontSize="small" /></IconButton></Tooltip>
                                        </Stack>
                                    </TableCell>
                                    <TableCell>{row.id}</TableCell>
                                    <TableCell>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            {/* Avatar placeholder */}
                                            <Box width={24} height={24} borderRadius="50%" bgcolor="#e0e0e0" display="flex" alignItems="center" justifyContent="center">
                                                <Typography variant="caption" fontSize={10}>U</Typography>
                                            </Box>
                                            <Link href="#">{row.username}</Link>
                                        </Box>
                                    </TableCell>
                                    <TableCell><Link href="#">{row.testName}</Link></TableCell>
                                    <TableCell><Link href="#">{row.session}</Link></TableCell>
                                    <TableCell><Link href="#">{row.userGroup}</Link></TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>
                                        {row.status}
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
                        <Pagination count={5} page={page} onChange={(_, p) => setPage(p)} shape="rounded" size="small" />

                        <FormControl size="small">
                            <Select value={rowsPerPage} onChange={(e) => setRowsPerPage(Number(e.target.value))} variant="outlined" sx={{ height: 32, fontSize: '0.875rem' }}>
                                <MenuItem value={10}>10</MenuItem>
                                <MenuItem value={20}>20</MenuItem>
                                <MenuItem value={50}>50</MenuItem>
                            </Select>
                        </FormControl>

                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box component="span" sx={{ bgcolor: '#e0f2f1', p: 0.5, borderRadius: '50%', color: 'success.main', display: 'flex' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                            </Box>
                            Rows: 48
                        </Typography>
                    </Stack>
                </Box>
            </Paper>
        </Box>
    );
};

export default Candidates;
