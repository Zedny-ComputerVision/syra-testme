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
    FormControl,
    InputAdornment,
    Stack,
    Link,
    Tooltip,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CategoryIcon from '@mui/icons-material/Category'; // Using as a placeholder for the icon in the card header
import SaveIcon from '@mui/icons-material/Save';

const Categories = () => {
    const [page, setPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    // Mock Data
    const mockCategories = [
        { id: 1, name: 'Default type', description: 'Category that contains default uncategorized value for all uncategorized tests...', type: 'Test/Survey category' },
        { id: 100002, name: 'طبيعة السؤال', description: '', type: 'Question category' },
    ];

    const columns = [
        { id: 'actions', label: 'Actions', width: 100 },
        { id: 'id', label: 'ID', width: 100 },
        { id: 'name', label: 'Name', width: 300 },
        { id: 'description', label: 'Description', width: 400 },
        { id: 'type', label: 'Category types', width: 200 },
    ];

    return (
        <Box p={3}>
            {/* Page Header */}
            <Box mb={3}>
                <Typography variant="h5" fontWeight="bold">Categories</Typography>
                <Typography variant="body2" color="text.secondary" mt={1}>
                    Custom categories are additional fields used as attributes for questions, tests, and surveys. They help organize content and provide extra data for easier search and management. <Link href="#">Read more</Link>
                </Typography>
            </Box>

            {/* Main Content Card */}
            <Paper variant="outlined" sx={{ borderRadius: 1 }}>

                {/* Toolbar */}
                <Box p={2} borderBottom="1px solid #e0e0e0" display="flex" justifyContent="space-between" alignItems="center">
                    <Box display="flex" alignItems="center" gap={1}>
                        <CategoryIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                        <Typography variant="subtitle1" fontWeight="bold">Categories</Typography>
                    </Box>
                    <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#0f172a', textTransform: 'none' }}>
                        Create new
                    </Button>
                </Box>

                {/* Table */}
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                {columns.map((col) => (
                                    <TableCell key={col.id} sx={{ fontWeight: 'bold' }}>{col.label}</TableCell>
                                ))}
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
                                            <MenuItem value="test_survey">Test/Survey category</MenuItem>
                                            <MenuItem value="question">Question category</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {mockCategories.map((row) => (
                                <TableRow key={row.id} hover>
                                    <TableCell>
                                        <Stack direction="row" spacing={0}>
                                            <Tooltip title="Edit">
                                                <IconButton size="small"><EditIcon fontSize="small" /></IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete">
                                                <IconButton size="small"><DeleteIcon fontSize="small" /></IconButton>
                                            </Tooltip>
                                        </Stack>
                                    </TableCell>
                                    <TableCell>{row.id}</TableCell>
                                    <TableCell>{row.name}</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{row.description}</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{row.type}</TableCell>
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

export default Categories;
