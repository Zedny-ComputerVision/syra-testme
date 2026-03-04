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
    Menu,
    MenuItem,
    Stack,
    Link,
    Select,
    FormControl,
    InputAdornment,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import FilterListIcon from '@mui/icons-material/FilterList';

const ManageCertificates = () => {
    const [page, setPage] = useState(1);
    const [certificateView, setCertificateView] = useState('All certificates (3)');

    // Mock Data
    const certificates = [
        { id: '100003', name: 'شهادة مهنية في السلامة والصحة في بيئة العمل', subtitle: '', companyName: '', createdBy: 'ytm_admin', creationTime: 'Oct 07 2025 10:36 AM EEST' },
        { id: '100000', name: 'Certificate of Appreciation', subtitle: '', companyName: '', createdBy: 'admin', creationTime: 'Sep 25 2023 02:08 PM EEST' },
        { id: '1', name: 'Welcome to GetCertified!', subtitle: 'This certificate is granted for successful completion in getcertified system.', companyName: '', createdBy: 'instructor', creationTime: 'Jan 21 2020 06:06 PM EET' },
    ];

    const columns = [
        { id: 'id', label: 'ID', width: 100 },
        { id: 'name', label: 'Name', width: 300 },
        { id: 'subtitle', label: 'Subtitle', width: 300 },
        { id: 'companyName', label: 'Company name', width: 200 },
        { id: 'createdBy', label: 'Created by', width: 150 },
        { id: 'creationTime', label: 'Creation time', width: 200 },
    ];

    return (
        <Box p={3}>
            <Box mb={3} display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h5" fontWeight="bold">Manage certificates</Typography>
            </Box>

            <Typography variant="body2" color="text.secondary" paragraph>
                Create custom-branded certificates that are awarded to candidates who successfully pass tests or meet specific test conditions.
                Candidates can download their certificates as a PDF or image file, or share them through a link. The list below displays all available certificates for management.
            </Typography>

            <Paper variant="outlined" sx={{ borderRadius: 1 }}>
                {/* Toolbar */}
                <Box p={2} borderBottom="1px solid #e0e0e0" display="flex" justifyContent="space-between" alignItems="center">
                    <Stack direction="row" alignItems="center" spacing={2}>
                        <IconButton size="small"><MenuIcon /></IconButton>
                        <Typography variant="subtitle1" fontWeight="bold">Certificates</Typography>
                    </Stack>
                    <Button variant="contained" startIcon={<AddIcon />} sx={{ bgcolor: '#0f172a', textTransform: 'none' }}>
                        New certificate
                    </Button>
                </Box>

                {/* Table */}
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            {/* Header Titles */}
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                {columns.map((col) => (
                                    <TableCell key={col.id} sx={{ fontWeight: 'bold' }}>{col.label}</TableCell>
                                ))}
                            </TableRow>
                            {/* Filter Inputs */}
                            <TableRow>
                                {columns.map((col) => (
                                    <TableCell key={`filter-${col.id}`} sx={{ p: 1 }}>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            placeholder="Search"
                                            variant="outlined"
                                            InputProps={{
                                                startAdornment: (
                                                    <InputAdornment position="start">
                                                        <SearchIcon fontSize="small" color="disabled" />
                                                    </InputAdornment>
                                                ),
                                                style: { fontSize: '0.875rem' }
                                            }}
                                        />
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {certificates.map((cert) => (
                                <TableRow key={cert.id} hover>
                                    <TableCell>{cert.id}</TableCell>
                                    <TableCell>
                                        <Link href="#" underline="hover">{cert.name}</Link>
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{cert.subtitle}</TableCell>
                                    <TableCell>{cert.companyName}</TableCell>
                                    <TableCell>
                                        <Link href="#" underline="hover">{cert.createdBy}</Link>
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{cert.creationTime}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>

                {/* Footer */}
                <Box p={2} borderTop="1px solid #e0e0e0" display="flex" justifyContent="space-between" alignItems="center">
                    <Link href="#" underline="hover" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', fontSize: '0.875rem' }}>
                        <Typography variant="body2" component="span">Save displayed column set</Typography>
                    </Link>

                    <Stack direction="row" alignItems="center" gap={2}>
                        <Pagination count={1} page={page} onChange={(_, p) => setPage(p)} shape="rounded" size="small" />

                        <FormControl size="small">
                            <Select value={10} variant="outlined" sx={{ height: 32, fontSize: '0.875rem' }}>
                                <MenuItem value={10}>10</MenuItem>
                                <MenuItem value={20}>20</MenuItem>
                            </Select>
                        </FormControl>

                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            Rows: 3
                        </Typography>
                    </Stack>
                </Box>
            </Paper>
        </Box>
    );
};

export default ManageCertificates;
