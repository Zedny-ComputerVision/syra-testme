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
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import SaveIcon from '@mui/icons-material/Save';

const ScheduledReports = () => {
    const [page, setPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    const columns = [
        { id: 'actions', label: 'Actions', width: 100 },
        { id: 'name', label: 'Report name', width: 200 },
        { id: 'description', label: 'Description', width: 300 },
        { id: 'subject', label: 'Email subject', width: 250 },
        { id: 'startTime', label: 'Start time', width: 150 },
        { id: 'interval', label: 'Interval', width: 120 },
        { id: 'lastSent', label: 'Last sent', width: 150 },
    ];

    return (
        <Box p={3}>
            {/* Header */}
            <Box mb={3}>
                <Typography variant="body2" color="primary" gutterBottom sx={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                    Scheduled reports
                </Typography>
                <Typography variant="h5" fontWeight="bold">Scheduled reports</Typography>
                <Typography variant="body2" color="text.secondary">
                    Choose a predefined report and schedule it for sending to the subscribers through email. Edit the scheduling configurations. <Link href="#">Play video</Link>
                </Typography>
            </Box>

            {/* Main Card */}
            <Paper variant="outlined" sx={{ borderRadius: 1 }}>

                {/* Toolbar */}
                <Box p={2} borderBottom="1px solid #e0e0e0" display="flex" justifyContent="space-between" alignItems="center">
                    <Box display="flex" alignItems="center" gap={1}>
                        <Box component="span" sx={{ display: 'flex' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                        </Box>
                        <Typography variant="subtitle2" fontWeight="bold">Scheduled reports</Typography>
                    </Box>
                    <Button variant="contained" sx={{ bgcolor: '#0f172a', textTransform: 'none', '&:hover': { bgcolor: '#1e293b' } }}>
                        Create new
                    </Button>
                </Box>

                {/* Table */}
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#f8fafc' }}>
                                {columns.map((col) => (
                                    <TableCell key={col.id} sx={{ fontWeight: 'bold' }}>{col.label}</TableCell>
                                ))}
                            </TableRow>
                            {/* Filter Row */}
                            <TableRow>
                                <TableCell sx={{ p: 1 }}></TableCell>
                                <TableCell sx={{ p: 1 }}>
                                    <TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
                                </TableCell>
                                <TableCell sx={{ p: 1 }}>
                                    <TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
                                </TableCell>
                                <TableCell sx={{ p: 1 }}>
                                    <TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
                                </TableCell>
                                <TableCell sx={{ p: 1 }}></TableCell>
                                <TableCell sx={{ p: 1 }}></TableCell>
                                <TableCell sx={{ p: 1 }}></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            <TableRow>
                                <TableCell colSpan={7} sx={{ py: 4, textAlign: 'left', color: 'text.secondary', fontSize: '0.875rem' }}>
                                    No scheduled reports.
                                </TableCell>
                            </TableRow>
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
                            Rows: 0
                        </Typography>
                    </Stack>
                </Box>
            </Paper>
        </Box>
    );
};

export default ScheduledReports;
