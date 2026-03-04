import { ReactElement, useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Box,
    Typography,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Divider,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Select,
    MenuItem,
    InputAdornment,
    IconButton,
    Chip,
    Grid,
    Pagination,
    FormControl
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import IconifyIcon from 'components/base/IconifyIcon';

interface TestItem {
    id: number;
    name: string;
    description: string;
    status: string;
    image: string;
    rules: any;
    settings: any;
    created_at: string;
    question_count?: number;
    session_count?: number;
}

const ManageTests = (): ReactElement => {
    const theme = useTheme();
    const navigate = useNavigate();
    const [tests, setTests] = useState<TestItem[]>([]);
    const [selectedTest, setSelectedTest] = useState<TestItem | null>(null);

    // Filtering states
    const [idSearch, setIdSearch] = useState('');
    const [nameSearch, setNameSearch] = useState('');
    const [sessionSearch, setSessionSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [creationTypeFilter, setCreationTypeFilter] = useState('All');

    // Pagination
    const [page, setPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    useEffect(() => {
        const fetchTests = async () => {
            try {
                const res = await fetch('/api/tests');
                const data = await res.json();
                if (Array.isArray(data)) {
                    setTests(data);
                }
            } catch (error) {
                console.error('Failed to fetch tests', error);
            }
        };
        fetchTests();
    }, []);

    const handleDelete = async (id: number) => {
        if (!confirm('Are you sure you want to delete this test? This action cannot be undone.')) return;

        try {
            const res = await fetch(`/api/tests/${id}`, { method: 'DELETE' });
            if (res.ok) {
                setTests(tests.filter(t => t.id !== id));
                setSelectedTest(null);
            } else {
                alert('Failed to delete test');
            }
        } catch (error) {
            console.error('Error deleting test:', error);
            alert('Error deleting test');
        }
    };

    const getStatusColor = (status: string) => {
        const s = status.toLowerCase();
        if (s === 'active' || s === 'available' || s === 'published') return theme.palette.success.light;
        if (s === 'draft') return theme.palette.grey[400];
        if (s === 'archived') return theme.palette.error.light;
        return theme.palette.info.light;
    };

    const getStatusTextColor = (status: string) => {
        const s = status.toLowerCase();
        if (s === 'active' || s === 'available' || s === 'published') return theme.palette.success.dark;
        if (s === 'draft') return theme.palette.grey[700];
        if (s === 'archived') return theme.palette.error.dark;
        return theme.palette.info.dark;
    };

    const filteredTests = tests.filter(test => {
        const matchesId = test.id.toString().includes(idSearch);
        const matchesName = test.name.toLowerCase().includes(nameSearch.toLowerCase());
        const matchesSession = (test.session_count || 0).toString().includes(sessionSearch);
        const matchesStatus = statusFilter === 'All' || test.status.toLowerCase() === statusFilter.toLowerCase();
        // Creation type is mocked for now as it's not in DB explicitly
        const matchesType = creationTypeFilter === 'All' || 'Test with sections' === creationTypeFilter;

        return matchesId && matchesName && matchesSession && matchesStatus && matchesType;
    });

    const paginatedTests = filteredTests.slice((page - 1) * rowsPerPage, page * rowsPerPage);

    return (
        <Box sx={{ p: 0 }}>
            {/* Header Section */}
            <Box sx={{ mb: 3 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                    <IconifyIcon icon="mdi:file-document-edit-outline" width={24} />
                    <Typography variant="h5" fontWeight={700}>
                        Manage tests
                    </Typography>
                </Box>
                <Typography variant="body2" color="text.secondary">
                    Manage available tests - schedule them for candidates, update configurations, and view reports.
                </Typography>
            </Box>

            {/* Main Content Paper */}
            <Paper variant="outlined" sx={{ borderRadius: 1, overflow: 'hidden' }}>
                {/* Action Bar */}
                <Box sx={{
                    p: 2,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: `1px solid ${theme.palette.divider}`
                }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <IconifyIcon icon="mdi:table-large" width={20} />
                        <Typography variant="subtitle1" fontWeight={600}>Test information</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                            component={Link}
                            to="/admin/new-test"
                            variant="contained"
                            startIcon={<IconifyIcon icon="mdi:plus" />}
                            sx={{ bgcolor: '#1e293b', '&:hover': { bgcolor: '#0f172a' } }}
                        >
                            New test
                        </Button>
                        <Button variant="outlined" color="inherit">Import test</Button>
                        <Button variant="outlined" color="inherit" endIcon={<IconifyIcon icon="mdi:filter-variant" />}>
                            Filter
                        </Button>
                    </Box>
                </Box>

                {/* Table */}
                <TableContainer>
                    <Table size="small">
                        <TableHead sx={{ bgcolor: theme.palette.action.hover }}>
                            <TableRow>
                                <TableCell>
                                    <Box display="flex" alignItems="center" gap={0.5} mb={1}>
                                        ID <IconifyIcon icon="mdi:sort" width={14} />
                                    </Box>
                                    <TextField
                                        size="small"
                                        placeholder="Search"
                                        variant="outlined"
                                        fullWidth
                                        value={idSearch}
                                        onChange={(e) => setIdSearch(e.target.value)}
                                        InputProps={{
                                            startAdornment: <InputAdornment position="start"><IconifyIcon icon="mdi:magnify" width={16} /></InputAdornment>,
                                            style: { fontSize: '0.8rem', paddingLeft: 0 }
                                        }}
                                        sx={{ '& .MuiOutlinedInput-input': { py: 0.5 } }}
                                    />
                                </TableCell>
                                <TableCell width="20%">
                                    <Box display="flex" alignItems="center" gap={0.5} mb={1}>
                                        Name <IconifyIcon icon="mdi:sort" width={14} />
                                    </Box>
                                    <TextField
                                        size="small"
                                        placeholder="Search"
                                        variant="outlined"
                                        fullWidth
                                        value={nameSearch}
                                        onChange={(e) => setNameSearch(e.target.value)}
                                        InputProps={{
                                            startAdornment: <InputAdornment position="start"><IconifyIcon icon="mdi:magnify" width={16} /></InputAdornment>,
                                            style: { fontSize: '0.8rem' }
                                        }}
                                        sx={{ '& .MuiOutlinedInput-input': { py: 0.5 } }}
                                    />
                                </TableCell>
                                <TableCell align="center">
                                    <Box display="flex" alignItems="center" justifyContent="center" gap={0.5} mb={1}>
                                        Testing sessions <IconifyIcon icon="mdi:sort" width={14} />
                                    </Box>
                                    <TextField
                                        size="small"
                                        placeholder="Search"
                                        variant="outlined"
                                        fullWidth
                                        value={sessionSearch}
                                        onChange={(e) => setSessionSearch(e.target.value)}
                                        InputProps={{
                                            startAdornment: <InputAdornment position="start"><IconifyIcon icon="mdi:magnify" width={16} /></InputAdornment>,
                                            style: { fontSize: '0.8rem' }
                                        }}
                                        sx={{ '& .MuiOutlinedInput-input': { py: 0.5 } }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Box display="flex" alignItems="center" gap={0.5} mb={1}>
                                        Status <IconifyIcon icon="mdi:sort" width={14} />
                                    </Box>
                                    <FormControl fullWidth size="small">
                                        <Select
                                            value={statusFilter}
                                            onChange={(e) => setStatusFilter(e.target.value)}
                                            displayEmpty
                                            sx={{ '& .MuiSelect-select': { py: 0.5, fontSize: '0.8rem' } }}
                                        >
                                            <MenuItem value="All">Select one</MenuItem>
                                            <MenuItem value="available">Available</MenuItem>
                                            <MenuItem value="draft">Draft</MenuItem>
                                            <MenuItem value="published">Published</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell>
                                    <Box display="flex" alignItems="center" gap={0.5}>
                                        Creation time <IconifyIcon icon="mdi:sort" width={14} />
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    <Box display="flex" alignItems="center" gap={0.5} mb={1}>
                                        Creation type <IconifyIcon icon="mdi:sort" width={14} />
                                    </Box>
                                    <FormControl fullWidth size="small">
                                        <Select
                                            value={creationTypeFilter}
                                            onChange={(e) => setCreationTypeFilter(e.target.value)}
                                            displayEmpty
                                            sx={{ '& .MuiSelect-select': { py: 0.5, fontSize: '0.8rem' } }}
                                        >
                                            <MenuItem value="All">Select one</MenuItem>
                                            <MenuItem value="Test with sections">Test with sections</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell>
                                    <Box display="flex" alignItems="center" gap={0.5} mb={1}>
                                        Report displayed <IconifyIcon icon="mdi:sort" width={14} />
                                    </Box>
                                    <FormControl fullWidth size="small">
                                        <Select
                                            value="All"
                                            displayEmpty
                                            sx={{ '& .MuiSelect-select': { py: 0.5, fontSize: '0.8rem' } }}
                                        >
                                            <MenuItem value="All">Select one</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell>
                                    <Box display="flex" alignItems="center" gap={0.5} mb={1}>
                                        Report content <IconifyIcon icon="mdi:sort" width={14} />
                                    </Box>
                                    <FormControl fullWidth size="small">
                                        <Select
                                            value="All"
                                            displayEmpty
                                            sx={{ '& .MuiSelect-select': { py: 0.5, fontSize: '0.8rem' } }}
                                        >
                                            <MenuItem value="All">Select one</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell align="right">
                                    <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5} mb={1}>
                                        Actions
                                    </Box>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {paginatedTests.map((test) => (
                                <TableRow
                                    key={test.id}
                                    hover
                                    sx={{ cursor: 'pointer' }}
                                    onClick={() => navigate(`/admin/test-management/${test.id}/basic-information`)}
                                >
                                    <TableCell sx={{ color: 'text.secondary' }}>{test.id}</TableCell>
                                    <TableCell>
                                        <Link
                                            to={`/admin/test-management/${test.id}/basic-information`}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{ textDecoration: 'none' }}
                                        >
                                            <Typography
                                                variant="body2"
                                                color="primary"
                                                fontWeight={500}
                                                sx={{ '&:hover': { textDecoration: 'underline' } }}
                                            >
                                                {test.name}
                                            </Typography>
                                        </Link>
                                    </TableCell>
                                    <TableCell align="center">
                                        <Typography variant="body2" color="primary" fontWeight={500}>
                                            {test.session_count || 0}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={test.status.charAt(0).toUpperCase() + test.status.slice(1)}
                                            size="small"
                                            sx={{
                                                bgcolor: getStatusColor(test.status),
                                                color: getStatusTextColor(test.status),
                                                fontWeight: 600,
                                                borderRadius: 1,
                                                height: 24
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                                        {new Date(test.created_at).toLocaleString('en-US', {
                                            month: 'short', day: '2-digit', year: 'numeric',
                                            hour: '2-digit', minute: '2-digit'
                                        })}
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                                        Test with sections
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                                        On manager's approval
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                                        Score only
                                    </TableCell>
                                    <TableCell align="right">
                                        <IconButton
                                            color="error"
                                            size="small"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDelete(test.id);
                                            }}
                                            aria-label="Delete test"
                                        >
                                            <IconifyIcon icon="mdi:delete" width={18} />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {paginatedTests.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                                        <Typography variant="body1" color="text.secondary">
                                            No tests found matching your criteria.
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                {/* Footer / Pagination */}
                <Box sx={{
                    p: 1.5,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: `1px solid ${theme.palette.divider}`,
                    bgcolor: theme.palette.action.hover
                }}>
                    <Button startIcon={<IconifyIcon icon="mdi:table-cog" />} size="small" color="inherit">
                        Save displayed column set
                    </Button>

                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        <Pagination
                            count={Math.ceil(filteredTests.length / rowsPerPage)}
                            page={page}
                            onChange={(_, p) => setPage(p)}
                            shape="rounded"
                            color="primary"
                            size="small"
                        />
                        <FormControl size="small">
                            <Select
                                value={rowsPerPage}
                                onChange={(e) => {
                                    setRowsPerPage(Number(e.target.value));
                                    setPage(1);
                                }}
                                sx={{ height: 30, fontSize: '0.85rem' }}
                            >
                                <MenuItem value={5}>5</MenuItem>
                                <MenuItem value={10}>10</MenuItem>
                                <MenuItem value={25}>25</MenuItem>
                            </Select>
                        </FormControl>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'success.main' }}>
                            <IconifyIcon icon="mdi:file-excel-box" />
                            <Typography variant="caption" fontWeight="bold">Rows: {filteredTests.length}</Typography>
                        </Box>
                    </Box>
                </Box>
            </Paper>

            {/* Test Details Dialog (Preserved functionality) */}
            <Dialog
                open={!!selectedTest}
                onClose={() => setSelectedTest(null)}
                maxWidth="sm"
                fullWidth
            >
                {selectedTest && (
                    <>
                        <DialogTitle component="div" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h6" component="div">{selectedTest.name}</Typography>
                            <Chip
                                label={selectedTest.status}
                                size="small"
                                sx={{
                                    bgcolor: getStatusColor(selectedTest.status),
                                    color: getStatusTextColor(selectedTest.status)
                                }}
                            />
                        </DialogTitle>
                        <DialogContent dividers>
                            <Box sx={{ mb: 3, display: 'flex', justifyContent: 'center' }}>
                                <img
                                    src={selectedTest.image || '/vite.svg'}
                                    alt={selectedTest.name}
                                    style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8, objectFit: 'cover' }}
                                    onError={(e) => { (e.target as HTMLImageElement).src = '/vite.svg'; }}
                                />
                            </Box>

                            <Typography variant="subtitle1" fontWeight="bold" gutterBottom>Description</Typography>
                            <Typography variant="body2" color="text.secondary" paragraph>
                                {selectedTest.description || 'No description provided.'}
                            </Typography>

                            <Divider sx={{ my: 2 }} />

                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <Typography variant="subtitle2" color="text.secondary">Questions</Typography>
                                    <Typography variant="body1">{selectedTest.question_count || 0}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="subtitle2" color="text.secondary">Duration</Typography>
                                    <Typography variant="body1">
                                        {(typeof selectedTest.rules === 'string' ? JSON.parse(selectedTest.rules).duration : selectedTest.rules?.duration) || 60} min
                                    </Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="subtitle2" color="text.secondary">Created Date</Typography>
                                    <Typography variant="body1">{new Date(selectedTest.created_at).toLocaleDateString()}</Typography>
                                </Grid>
                            </Grid>
                        </DialogContent>
                        <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
                            <Button
                                variant="contained"
                                color="error"
                                onClick={() => handleDelete(selectedTest.id)}
                            >
                                Delete Test
                            </Button>
                            <Button onClick={() => setSelectedTest(null)} variant="outlined">
                                Close
                            </Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>
        </Box>
    );
};

export default ManageTests;
