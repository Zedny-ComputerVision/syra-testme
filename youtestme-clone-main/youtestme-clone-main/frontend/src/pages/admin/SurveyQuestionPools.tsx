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
    Link,
    Checkbox
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import UploadFileIcon from '@mui/icons-material/UploadFile'; // Import icon placeholder
import DescriptionIcon from '@mui/icons-material/Description';
import FolderOpenIcon from '@mui/icons-material/FolderOpen'; // For pools
import SaveIcon from '@mui/icons-material/Save';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const SurveyQuestionPools = () => {
    const [page, setPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    const pools = [
        { id: 100014, name: 'Workload and Stress', path: 'Employee Experience Insights > Workload and Stress', description: 'This sub-pool is focused on evaluating the distribution of workload, stress factor...' },
        { id: 100013, name: 'Management and Leadership', path: 'Employee Experience Insights > Management and Leadership', description: 'This sub-pool is dedicated to evaluating the effectiveness of our leadership and ...' },
        { id: 100012, name: 'Career Growth and Development', path: 'Employee Experience Insights > Career Growth and Development', description: 'This sub-pool is designed to assess opportunities for professional advancement,...' },
        { id: 100011, name: 'Work Environment', path: 'Employee Experience Insights > Work Environment', description: 'This sub-pool focuses on assessing the quality and atmosphere of our workplac...' },
        { id: 100010, name: 'Employee Experience Insights', path: 'Employee Experience Insights', description: 'This pool is designed to gather valuable employee feedback, providing insights i...' },
    ];

    const columns = [
        { id: 'id', label: 'ID', width: 80 },
        { id: 'name', label: 'Name', width: 250 },
        { id: 'path', label: 'Path', width: 300 },
        { id: 'description', label: 'Description', width: 400 },
    ];

    return (
        <Box p={3}>
            {/* Header */}
            <Box mb={2}>
                <Typography variant="h5" fontWeight="bold">Question pools</Typography>
                <Typography variant="body2" color="text.secondary">
                    Question pools store questions used to create tests and surveys. The table below shows all question pools available to you.
                </Typography>
            </Box>

            {/* Main Card */}
            <Paper variant="outlined" sx={{ borderRadius: 1 }}>

                {/* Toolbar */}
                <Box p={2} borderBottom="1px solid #e0e0e0" display="flex" justifyContent="space-between" alignItems="center">
                    <Box display="flex" alignItems="center" gap={1}>
                        <FolderOpenIcon fontSize="small" color="action" />
                        <Typography variant="subtitle1" fontWeight="bold">Survey question pools</Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                        <Button variant="contained" sx={{ bgcolor: '#0f172a', textTransform: 'none', px: 3 }}>
                            New
                        </Button>
                        <Button variant="outlined" endIcon={<ExpandMoreIcon />} sx={{ textTransform: 'none', color: 'text.primary', borderColor: 'divider' }}>
                            Import
                        </Button>
                    </Stack>
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
                                    <TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="disabled" /></InputAdornment> }} />
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {pools.map((pool) => (
                                <TableRow key={pool.id} hover>
                                    <TableCell>{pool.id}</TableCell>
                                    <TableCell>
                                        <Link href="#" underline="hover">{pool.name}</Link>
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary' }}>{pool.path}</TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{pool.description}</TableCell>
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
                            Rows: 5
                        </Typography>
                    </Stack>
                </Box>
            </Paper>
        </Box>
    );
};

export default SurveyQuestionPools;
