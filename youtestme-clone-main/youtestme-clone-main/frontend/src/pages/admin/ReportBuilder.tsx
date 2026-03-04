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
    Select,
    MenuItem,
    Stack,
    FormControl,
    InputAdornment,
    Link,
    ToggleButtonGroup,
    ToggleButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import BarChartIcon from '@mui/icons-material/BarChart';
import SaveIcon from '@mui/icons-material/Save';

const ReportBuilder = () => {
    const [page, setPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [type, setType] = useState('tests');

    const handleTypeChange = (_: any, newType: string) => {
        if (newType !== null) {
            setType(newType);
        }
    };

    const tests = [
        { id: 100029, name: 'امتحان التحقق في الحوادث والوقائع - المدققون الرئيسيون', sessions: 1, status: 'Draft', creationTime: 'Dec-18-2025 02:43 AM EET', externalId: '', creationType: 'Test with sections', pageFormat: 'One question per page', networkAccess: 'All networks', pausingAllowed: 'No', passingMark: '60.00', retakingEnabled: 'No', proctored: 'No' },
        { id: 100026, name: 'امتحان التحقق في الحوادث والوقائع - المدققون', sessions: 1, status: 'Draft', creationTime: 'Dec-18-2025 01:17 AM EET', externalId: '', creationType: 'Test with sections', pageFormat: 'One question per page', networkAccess: 'All networks', pausingAllowed: 'No', passingMark: '58.00', retakingEnabled: 'No', proctored: 'No' },
        { id: 100023, name: 'اختبار محقق', sessions: 0, status: 'Draft', creationTime: 'Dec-06-2025 08:29 PM EET', externalId: '', creationType: 'Test with sections', pageFormat: 'One question per page', networkAccess: 'All networks', pausingAllowed: 'No', passingMark: '', retakingEnabled: 'No', proctored: 'Yes' },
        { id: 100007, name: 'اختبار المفتشين', sessions: 7, status: 'Published', creationTime: 'Oct-06-2025 10:56 PM EEST', externalId: '', creationType: 'Test with sections', pageFormat: 'One question per page', networkAccess: 'All networks', pausingAllowed: 'No', passingMark: '51.00', retakingEnabled: 'Yes', proctored: 'Yes' },
    ];

    const columns = [
        { id: 'id', label: 'ID', width: 80 },
        { id: 'name', label: 'Name', width: 250 },
        { id: 'sessions', label: 'Testing sessions', width: 150 },
        { id: 'status', label: 'Status', width: 100 },
        { id: 'creationTime', label: 'Creation time', width: 180 },
        { id: 'externalId', label: 'External ID', width: 120 },
        { id: 'creationType', label: 'Creation type', width: 150 },
        { id: 'pageFormat', label: 'Page format', width: 180 },
        { id: 'networkAccess', label: 'Network access', width: 150 },
        { id: 'pausingAllowed', label: 'Pausing allowed', width: 150 },
        { id: 'passingMark', label: 'Passing mark', width: 120 },
        { id: 'retakingEnabled', label: 'Retaking enabled', width: 150 },
        { id: 'proctored', label: 'Proctored', width: 120 },
    ];

    return (
        <Box p={3}>
            {/* Header */}
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                <Box>
                    <Box display="flex" alignItems="center" gap={1} mb={0.5}>
                        <BarChartIcon color="action" />
                        <Typography variant="h5" fontWeight="bold">Report builder</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary">
                        Select the test/survey you want to create a report for. <Link href="#">Learn more</Link>
                    </Typography>
                </Box>
                <ToggleButtonGroup
                    value={type}
                    exclusive
                    onChange={handleTypeChange}
                    size="small"
                    sx={{ bgcolor: 'white' }}
                >
                    <ToggleButton value="tests" sx={{ textTransform: 'none', px: 3, '&.Mui-selected': { bgcolor: '#0f172a', color: 'white', '&:hover': { bgcolor: '#1e293b' } } }}>Tests</ToggleButton>
                    <ToggleButton value="surveys" sx={{ textTransform: 'none', px: 3, '&.Mui-selected': { bgcolor: '#0f172a', color: 'white', '&:hover': { bgcolor: '#1e293b' } } }}>Surveys</ToggleButton>
                </ToggleButtonGroup>
            </Box>

            {/* Main Card */}
            <Paper variant="outlined" sx={{ borderRadius: 1 }}>

                {/* Toolbar */}
                <Box p={2} borderBottom="1px solid #e0e0e0" display="flex" justifyContent="space-between" alignItems="center">
                    <Box display="flex" alignItems="center" gap={1}>
                        <Box sx={{ border: '1px solid #e0e0e0', p: 0.5, borderRadius: 1, display: 'flex' }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                        </Box>
                        <Typography variant="subtitle2" fontWeight="bold">Test information</Typography>
                    </Box>
                    <Button variant="outlined" endIcon={<FilterListIcon />} sx={{ textTransform: 'none', color: 'text.primary', borderColor: 'divider' }}>
                        Filter
                    </Button>
                </Box>

                {/* Table */}
                <TableContainer sx={{ maxHeight: 'calc(100vh - 350px)' }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                {columns.map((col) => (
                                    <TableCell key={col.id} sx={{ fontWeight: 'bold', bgcolor: '#f8fafc', whiteSpace: 'nowrap' }}>
                                        {col.label}
                                    </TableCell>
                                ))}
                            </TableRow>
                            {/* Filter Row */}
                            <TableRow>
                                <TableCell sx={{ p: 1, bgcolor: '#f8fafc' }}>
                                    <TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
                                </TableCell>
                                <TableCell sx={{ p: 1, bgcolor: '#f8fafc' }}>
                                    <TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
                                </TableCell>
                                <TableCell sx={{ p: 1, bgcolor: '#f8fafc' }}>
                                    <TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
                                </TableCell>
                                <TableCell sx={{ p: 1, bgcolor: '#f8fafc' }}>
                                    <FormControl fullWidth size="small">
                                        <Select value="Select one" displayEmpty>
                                            <MenuItem value="Select one">Select one</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell sx={{ p: 1, bgcolor: '#f8fafc' }}></TableCell>
                                <TableCell sx={{ p: 1, bgcolor: '#f8fafc' }}>
                                    <TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
                                </TableCell>
                                <TableCell sx={{ p: 1, bgcolor: '#f8fafc' }}>
                                    <FormControl fullWidth size="small">
                                        <Select value="Select one" displayEmpty>
                                            <MenuItem value="Select one">Select one</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell sx={{ p: 1, bgcolor: '#f8fafc' }}>
                                    <FormControl fullWidth size="small">
                                        <Select value="Select one" displayEmpty>
                                            <MenuItem value="Select one">Select one</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell sx={{ p: 1, bgcolor: '#f8fafc' }}>
                                    <FormControl fullWidth size="small">
                                        <Select value="Select one" displayEmpty>
                                            <MenuItem value="Select one">Select one</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell sx={{ p: 1, bgcolor: '#f8fafc' }}>
                                    <FormControl fullWidth size="small">
                                        <Select value="Select one" displayEmpty>
                                            <MenuItem value="Select one">Select one</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell sx={{ p: 1, bgcolor: '#f8fafc' }}>
                                    <TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
                                </TableCell>
                                <TableCell sx={{ p: 1, bgcolor: '#f8fafc' }}>
                                    <FormControl fullWidth size="small">
                                        <Select value="Select one" displayEmpty>
                                            <MenuItem value="Select one">Select one</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell sx={{ p: 1, bgcolor: '#f8fafc' }}>
                                    <FormControl fullWidth size="small">
                                        <Select value="Select one" displayEmpty>
                                            <MenuItem value="Select one">Select one</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {tests.map((test) => (
                                <TableRow key={test.id} hover>
                                    <TableCell sx={{ color: 'text.secondary' }}>{test.id}</TableCell>
                                    <TableCell>
                                        <Link href="#" underline="hover" color="primary">{test.name}</Link>
                                    </TableCell>
                                    <TableCell sx={{ textAlign: 'center' }}>
                                        <Link href="#" underline="hover">{test.sessions}</Link>
                                    </TableCell>
                                    <TableCell>
                                        <Box component="span" sx={{
                                            px: 1, py: 0.5, borderRadius: 1, fontSize: '0.75rem', fontWeight: 'bold',
                                            bgcolor: test.status === 'Published' ? '#e0f2f1' : '#f1f5f9',
                                            color: test.status === 'Published' ? '#10b981' : '#64748b'
                                        }}>
                                            {test.status}
                                        </Box>
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{test.creationTime}</TableCell>
                                    <TableCell>{test.externalId}</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{test.creationType}</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{test.pageFormat}</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{test.networkAccess}</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{test.pausingAllowed}</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{test.passingMark}</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{test.retakingEnabled}</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{test.proctored}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>

                {/* Footer */}
                <Box p={2} borderTop="1px solid #e0e0e0" display="flex" justifyContent="space-between" alignItems="center">
                    <Link href="#" underline="hover" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', fontSize: '0.875rem' }}>
                        <SaveIcon fontSize="small" />
                        Save displayed column set
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
                            <Box component="span" sx={{ bgcolor: '#dcfce7', p: 0.5, borderRadius: '50%', color: '#16a34a', display: 'flex' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                            </Box>
                            Rows: {tests.length}
                        </Typography>
                    </Stack>
                </Box>
            </Paper>
        </Box>
    );
};

export default ReportBuilder;
