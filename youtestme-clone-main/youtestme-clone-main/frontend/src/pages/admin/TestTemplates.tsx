import { useState } from 'react';
import {
    Box,
    Typography,
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
    Button,
    IconButton,
    InputAdornment,
    Checkbox,
    Pagination,
    Stack,
    FormControl,
    Link,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import SaveIcon from '@mui/icons-material/Save';
import FileCopyIcon from '@mui/icons-material/FileCopy';

const TestTemplates = () => {
    const [page, setPage] = useState(1);

    // Filter states
    const [filters, setFilters] = useState({
        id: '',
        name: '',
        externalId: '',
        reportDisplayed: '',
        reportContent: '',
        pageFormat: '',
        networkAccess: '',
        pausingAllowed: '',
        passingMark: '',
        retakingEnabled: '',
        label: '',
        proctored: '',
    });

    const handleFilterChange = (field: string, value: string) => {
        setFilters({ ...filters, [field]: value });
    };

    const columns = [
        { id: 'id', label: 'ID', type: 'text', width: 80 },
        { id: 'name', label: 'Name', type: 'text', width: 200 },
        { id: 'creationTime', label: 'Creation time', type: 'text', width: 150 },
        { id: 'externalId', label: 'External ID', type: 'text', width: 120 },
        { id: 'reportDisplayed', label: 'Report displayed', type: 'select', options: ['Select one', 'Yes', 'No'], width: 140 },
        { id: 'reportContent', label: 'Report content', type: 'select', options: ['Select one', 'Full', 'Summary'], width: 140 },
        { id: 'pageFormat', label: 'Page format', type: 'select', options: ['Select one', 'One page', 'Per question'], width: 140 },
        { id: 'networkAccess', label: 'Network access', type: 'select', options: ['Select one', 'Public', 'Private'], width: 140 },
        { id: 'pausingAllowed', label: 'Pausing allowed', type: 'select', options: ['Select one', 'Yes', 'No'], width: 140 },
        { id: 'passingMark', label: 'Passing mark', type: 'text', width: 120 },
        { id: 'retakingEnabled', label: 'Retaking enabled', type: 'select', options: ['Select one', 'Yes', 'No'], width: 140 },
        { id: 'label', label: 'Label', type: 'text', width: 120 },
        { id: 'proctored', label: 'Proctored', type: 'select', options: ['Select one', 'Yes', 'No'], width: 120 },
        { id: 'actions', label: 'Actions', type: 'none', width: 80 },
    ];

    return (
        <Box p={3}>
            {/* Header */}
            <Box mb={3}>
                <Typography variant="h5" gutterBottom fontWeight="bold">
                    Test templates
                </Typography>
                <Typography variant="body2" color="text.secondary">
                    View all assignment templates in the system. Check details, edit, or delete any template as needed.
                </Typography>
            </Box>

            {/* Main Content Card */}
            <Paper variant="outlined" sx={{ borderRadius: 1 }}>
                {/* Card Header */}
                <Box p={2} borderBottom="1px solid #e0e0e0" display="flex" justifyContent="space-between" alignItems="center">
                    <Box display="flex" alignItems="center" gap={1}>
                        <FileCopyIcon fontSize="small" color="action" />
                        <Typography variant="subtitle1" fontWeight="bold">
                            Available Templates
                        </Typography>
                    </Box>
                    <Button variant="outlined" startIcon={<FilterListIcon />} size="small">
                        Filter
                    </Button>
                </Box>

                {/* Table */}
                <TableContainer sx={{ overflowX: 'auto' }}>
                    <Table size="small" sx={{ minWidth: 1800 }}>
                        <TableHead>
                            {/* Column Headers */}
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                {columns.map((col) => (
                                    <TableCell key={col.id} sx={{ fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                        {col.label}
                                    </TableCell>
                                ))}
                            </TableRow>

                            {/* Filter Row */}
                            <TableRow>
                                {columns.map((col) => (
                                    <TableCell key={`filter-${col.id}`} sx={{ p: 1 }}>
                                        {col.type === 'text' && (
                                            <TextField
                                                fullWidth
                                                size="small"
                                                placeholder="Search" // Added Search placeholder to match screenshot
                                                variant="outlined"
                                                value={(filters as any)[col.id]}
                                                onChange={(e) => handleFilterChange(col.id, e.target.value)}
                                                InputProps={{
                                                    startAdornment: (
                                                        <InputAdornment position="start">
                                                            <SearchIcon fontSize="small" color="disabled" />
                                                        </InputAdornment>
                                                    ),
                                                    style: { fontSize: '0.875rem' }
                                                }}
                                            />
                                        )}
                                        {col.type === 'select' && (
                                            <FormControl fullWidth size="small">
                                                <Select
                                                    value={(filters as any)[col.id] || 'Select one'}
                                                    onChange={(e) => handleFilterChange(col.id, e.target.value)}
                                                    variant="outlined"
                                                    displayEmpty
                                                    style={{ fontSize: '0.875rem' }}
                                                    renderValue={(selected) => {
                                                        if (!selected || selected === 'Select one') {
                                                            return <Typography color="text.secondary" variant="body2">Select one</Typography>;
                                                        }
                                                        return selected;
                                                    }}
                                                >
                                                    <MenuItem value="Select one">
                                                        <Typography color="text.secondary" variant="body2">Select one</Typography>
                                                    </MenuItem>
                                                    {col.options?.slice(1).map((opt) => (
                                                        <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                                                    ))}
                                                </Select>
                                            </FormControl>
                                        )}
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {/* Empty State / Mock Data */}
                            <TableRow>
                                <TableCell colSpan={columns.length} align="center" sx={{ py: 8 }}>
                                    {/* Depending on if we want to show empty or mock, typically empty first */}
                                    <Typography color="text.secondary">No available templates in the system.</Typography>
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
                            <Select value={10} variant="outlined" sx={{ height: 32, fontSize: '0.875rem' }}>
                                <MenuItem value={10}>10</MenuItem>
                                <MenuItem value={20}>20</MenuItem>
                                <MenuItem value={50}>50</MenuItem>
                            </Select>
                        </FormControl>

                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box component="span" sx={{ bgcolor: '#e0f2f1', p: 0.5, borderRadius: '50%', color: 'success.main', display: 'flex' }}>
                                {/* Icon for rows could go here if needed, screenshot shows just green icon */}
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                            </Box>
                            Rows: 0
                        </Typography>
                    </Stack>
                </Box>
            </Paper>
        </Box>
    );
};

export default TestTemplates;
