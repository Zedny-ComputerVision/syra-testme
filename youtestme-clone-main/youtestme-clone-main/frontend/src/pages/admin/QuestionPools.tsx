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
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import SearchIcon from '@mui/icons-material/Search';
import SaveIcon from '@mui/icons-material/Save';

const QuestionPools = () => {
    const [page, setPage] = useState(1);
    const [importAnchor, setImportAnchor] = useState<null | HTMLElement>(null);

    // Mock Data
    const pools = [
        { id: '100047', name: 'الوحدة 9: قائمة بيانات التحقيق في الحوادث والإبلاغ عنها', path: 'أسئلة امتحان التحقيق في الحوادث والوقائع > الوحدة 9: قائمة بيانات التحقيق في الحوادث والإبلاغ عنها', description: '' },
        { id: '100046', name: 'الوحدة 8: تقارير الحوادث', path: 'أسئلة امتحان التحقيق في الحوادث والوقائع > الوحدة 8: تقارير الحوادث', description: '' },
        { id: '100045', name: 'الوحدة 7: الدروس المستفادة', path: 'أسئلة امتحان التحقيق في الحوادث والوقائع > الوحدة 7: الدروس المستفادة', description: '' },
        { id: '100044', name: 'الوحدة 6: الإجراءات التصحيحية والوقائية', path: 'أسئلة امتحان التحقيق في الحوادث والوقائع > الوحدة 6: الإجراءات التصحيحية والوقائية', description: '' },
        // ... add more if needed
    ];

    const columns = [
        { id: 'id', label: 'ID', width: 100 },
        { id: 'name', label: 'Name', width: 300 },
        { id: 'path', label: 'Path', width: 400 },
        { id: 'description', label: 'Description', width: 200 },
    ];

    return (
        <Box p={3}>
            {/* Header */}
            <Box mb={2}>
                <Typography variant="h5" fontWeight="bold">Question pools</Typography>
                <Typography variant="body2" color="text.secondary" mt={1}>
                    Question pools store questions used to create tests and surveys. The table below shows all question pools available to you.
                </Typography>
            </Box>

            {/* Main Card */}
            <Paper variant="outlined" sx={{ borderRadius: 1 }}>
                {/* Toolbar */}
                <Box p={2} borderBottom="1px solid #e0e0e0" display="flex" justifyContent="space-between" alignItems="center">
                    <Box display="flex" alignItems="center">
                        <DescriptionOutlinedIcon sx={{ mr: 1, color: 'text.secondary' }} />
                        <Typography variant="subtitle1" fontWeight="bold">Test question pools</Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                        <Button variant="contained" sx={{ bgcolor: '#0f172a', textTransform: 'none' }}>
                            New
                        </Button>
                        <Button
                            variant="outlined"
                            endIcon={<ExpandMoreIcon />}
                            onClick={(e) => setImportAnchor(e.currentTarget)}
                            sx={{ textTransform: 'none', color: 'text.primary', borderColor: 'divider' }}
                        >
                            Import
                        </Button>
                        <Menu
                            anchorEl={importAnchor}
                            open={Boolean(importAnchor)}
                            onClose={() => setImportAnchor(null)}
                        >
                            <MenuItem onClick={() => setImportAnchor(null)}>Import from Excel</MenuItem>
                            <MenuItem onClick={() => setImportAnchor(null)}>Import from QTI</MenuItem>
                        </Menu>
                    </Stack>
                </Box>

                {/* Table */}
                <TableContainer sx={{ overflowX: 'auto' }}>
                    <Table size="small" sx={{ minWidth: 1000 }}>
                        <TableHead>
                            {/* Titles */}
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                {columns.map((col) => (
                                    <TableCell key={col.id} sx={{ fontWeight: 'bold' }}>{col.label}</TableCell>
                                ))}
                            </TableRow>
                            {/* Filters */}
                            <TableRow>
                                {columns.map((col) => (
                                    <TableCell key={`filter-${col.id}`} sx={{ p: 1 }}>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            placeholder="Search"
                                            variant="outlined"
                                            InputProps={{
                                                startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" color="disabled" /></InputAdornment>,
                                                style: { fontSize: '0.875rem' }
                                            }}
                                        />
                                    </TableCell>
                                ))}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {pools.map((pool) => (
                                <TableRow key={pool.id} hover>
                                    <TableCell>{pool.id}</TableCell>
                                    <TableCell>
                                        <Link href="#" underline="hover">{pool.name}</Link>
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.875rem' }}>{pool.path}</TableCell>
                                    <TableCell>{pool.description}</TableCell>
                                </TableRow>
                            ))}
                            {/* Extra row for text at bottom of table in screenshot */}
                            <TableRow>
                                <TableCell colSpan={4} align="right">
                                    <Typography variant="caption" color="text.secondary">
                                        ...أسئلة هذه على 9 مجموعات فرعية، حيث تم إنشاء كل مجموعة فرعية لاحدى وحدات امتحان التحقيق في الحوادث والوقائع
                                    </Typography>
                                </TableCell>
                            </TableRow>
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
                        <Pagination count={2} page={page} onChange={(_, p) => setPage(p)} shape="rounded" size="small" />

                        <FormControl size="small">
                            <Select value={10} variant="outlined" sx={{ height: 32, fontSize: '0.875rem' }}>
                                <MenuItem value={10}>10</MenuItem>
                                <MenuItem value={20}>20</MenuItem>
                            </Select>
                        </FormControl>

                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <Box component="span" sx={{ bgcolor: '#e0f2f1', p: 0.5, borderRadius: '50%', color: 'success.main', display: 'flex' }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
                            </Box>
                            Rows: 19
                        </Typography>
                    </Stack>
                </Box>
            </Paper>
        </Box>
    );
};

export default QuestionPools;
