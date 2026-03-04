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
    Chip,
    Link,
    Tooltip,
    Checkbox
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import AddIcon from '@mui/icons-material/Add';
import SchoolIcon from '@mui/icons-material/School'; // Placeholder for training icon
import SaveIcon from '@mui/icons-material/Save';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';


const TrainingCourses = () => {
    const [page, setPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    const courses = [
        { id: 100000, name: 'Cybersecurity Training Course', status: 'Published', creationTime: 'Sep-22-2023 04:41 PM EEST' },
        { id: 100002, name: 'كوادر السلامة والصحة المهنية - مسار محترف', status: 'Unpublished', creationTime: 'Oct-22-2025 08:26 PM EEST' },
    ];

    const columns = [
        { id: 'id', label: 'ID', width: 80 },
        { id: 'name', label: 'Name', width: 400 },
        { id: 'status', label: 'Status', width: 150 },
        { id: 'creationTime', label: 'Creation time', width: 250 },
    ];

    return (
        <Box p={3}>
            {/* Header */}
            <Box mb={2}>
                <Typography variant="h5" fontWeight="bold">Training courses</Typography>
                <Typography variant="body2" color="text.secondary">
                    Create structured training courses with videos and quizzes, assign certificates, and easily track candidate progress. <Link href="#" sx={{ display: 'inline-flex', alignItems: 'center' }}>Play video</Link>
                </Typography>
            </Box>

            {/* Main Card */}
            <Paper variant="outlined" sx={{ borderRadius: 1 }}>

                {/* Toolbar */}
                <Box p={2} borderBottom="1px solid #e0e0e0" display="flex" justifyContent="space-between" alignItems="center">
                    <Box display="flex" alignItems="center" gap={1}>
                        <SchoolIcon fontSize="small" color="action" />
                        <Typography variant="subtitle1" fontWeight="bold">All training courses</Typography>
                    </Box>
                    <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#0f172a', textTransform: 'none' }}>
                        New training course
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
                                            <MenuItem value="Unpublished">Unpublished</MenuItem>
                                        </Select>
                                    </FormControl>
                                </TableCell>
                                <TableCell sx={{ p: 1 }}>
                                    <TextField fullWidth size="small" placeholder="Search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="disabled" /></InputAdornment> }} />
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {courses.map((course) => (
                                <TableRow key={course.id} hover>
                                    <TableCell>{course.id}</TableCell>
                                    <TableCell>
                                        <Link href="#" underline="hover">{course.name}</Link>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={course.status}
                                            size="small"
                                            variant="filled"
                                            sx={{
                                                bgcolor: course.status === 'Published' ? '#e0f2f1' : '#ffebee',
                                                color: course.status === 'Published' ? '#00695c' : '#c62828',
                                                fontWeight: 'bold',
                                                borderRadius: 1
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{course.creationTime}</TableCell>
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

export default TrainingCourses;
