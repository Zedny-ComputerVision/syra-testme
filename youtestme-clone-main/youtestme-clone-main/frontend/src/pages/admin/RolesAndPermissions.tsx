import { useState } from 'react';
import {
    Box,
    Typography,
    Button,
    Card,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Stack,
    IconButton,
    InputAdornment,
    Pagination,
    Select,
    MenuItem
} from '@mui/material';
import {
    ShieldCheck,
    Search,
    Plus,
    Edit2,
    Trash2,
    Copy,
    ArrowUpDown,
    Download,
    Settings
} from 'lucide-react';
import Header from '../../components/Header';

interface Role {
    id: string;
    name: string;
    description: string;
    roleCode: string;
}

const RolesAndPermissions = () => {
    // Mock data
    const [roles, setRoles] = useState<Role[]>([
        { id: '1', name: 'Administrator', description: 'To make the most out of your free trial, we recommend starting with our 3-Minute Tutorial video.', roleCode: 'ADM' },
        { id: '2', name: 'Guest', description: 'The Guest role in our system gives temporary access to the application for non-registered users. You can use...', roleCode: 'GST' },
        { id: '3', name: 'Instructor', description: 'As an Instructor, your responsibilities include creating and administering tests, surveys, and training courses...', roleCode: 'INS' },
        { id: '4', name: 'Proctor', description: 'As a Proctor, your primary responsibility lies in the real-time supervision of test endeavors and evaluating pro...', roleCode: 'PRC' },
        { id: '5', name: 'Student', description: 'As a Student, you have permissions to take tests and training courses, participate in surveys, preview persona...', roleCode: 'ATT' },
    ]);

    return (
        <Box sx={{ p: 4 }}>
            <Header
                title="Roles and permissions"
                subtitle="Create new security roles with custom permissions or edit existing ones. Learn more"
                icon={<ShieldCheck size={24} />}
                breadcrumbs={[
                    { label: 'Users', href: '#' },
                    { label: 'Roles and permissions', href: '#' }
                ]}
            />

            <Card sx={{
                borderRadius: 2,
                border: '1px solid #e2e8f0',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                mt: 3,
                overflow: 'hidden'
            }}>
                {/* Toolbar */}
                <Box sx={{
                    p: 2,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderBottom: '1px solid #f1f5f9'
                }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <ShieldCheck size={20} className="text-slate-500" />
                        <Typography variant="h6" fontSize="1rem" fontWeight={600} color="#1e293b">
                            List of user roles
                        </Typography>
                    </Stack>
                    <Button
                        variant="contained"
                        sx={{
                            bgcolor: '#1e293b',
                            textTransform: 'none',
                            fontWeight: 600,
                            '&:hover': { bgcolor: '#0f172a' }
                        }}
                    >
                        Create new
                    </Button>
                </Box>

                <TableContainer>
                    <Table sx={{ minWidth: 650 }} size="medium">
                        <TableHead sx={{ bgcolor: '#f8fafc' }}>
                            <TableRow>
                                <TableCell width="140" sx={{ verticalAlign: 'top', pt: 2 }}>
                                    <Typography variant="caption" fontWeight={600} color="#64748b">Actions</Typography>
                                </TableCell>
                                <TableCell width="250">
                                    <Stack direction="row" alignItems="center" spacing={1} sx={{ cursor: 'pointer', mb: 1 }}>
                                        <Typography variant="caption" fontWeight={600} color="#64748b">Name</Typography>
                                        <ArrowUpDown size={14} className="text-slate-400" />
                                    </Stack>
                                    <TextField
                                        placeholder="Search"
                                        size="small"
                                        variant="outlined"
                                        fullWidth
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <Search size={14} className="text-slate-400" />
                                                </InputAdornment>
                                            ),
                                            style: { fontSize: '0.8rem', height: 32, backgroundColor: 'white' }
                                        }}
                                    />
                                </TableCell>
                                <TableCell>
                                    <Stack direction="row" alignItems="center" spacing={1} sx={{ cursor: 'pointer', mb: 1 }}>
                                        <Typography variant="caption" fontWeight={600} color="#64748b">Description</Typography>
                                        <ArrowUpDown size={14} className="text-slate-400" />
                                    </Stack>
                                    <TextField
                                        placeholder="Search"
                                        size="small"
                                        variant="outlined"
                                        fullWidth
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <Search size={14} className="text-slate-400" />
                                                </InputAdornment>
                                            ),
                                            style: { fontSize: '0.8rem', height: 32, backgroundColor: 'white' }
                                        }}
                                    />
                                </TableCell>
                                <TableCell width="120">
                                    <Stack direction="row" alignItems="center" spacing={1} sx={{ cursor: 'pointer', mb: 1 }}>
                                        <Typography variant="caption" fontWeight={600} color="#64748b">Role code</Typography>
                                        <ArrowUpDown size={14} className="text-slate-400" />
                                    </Stack>
                                    <TextField
                                        placeholder="Search"
                                        size="small"
                                        variant="outlined"
                                        fullWidth
                                        InputProps={{
                                            startAdornment: (
                                                <InputAdornment position="start">
                                                    <Search size={14} className="text-slate-400" />
                                                </InputAdornment>
                                            ),
                                            style: { fontSize: '0.8rem', height: 32, backgroundColor: 'white' }
                                        }}
                                    />
                                </TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {roles.map((role) => (
                                <TableRow
                                    key={role.id}
                                    sx={{
                                        '&:hover': { bgcolor: '#f8fafc' },
                                        '& td': { borderColor: '#f1f5f9' },
                                        cursor: 'pointer'
                                    }}
                                >
                                    <TableCell>
                                        <Stack direction="row" spacing={0.5}>
                                            <IconButton size="small" sx={{ color: '#64748b' }}>
                                                <Edit2 size={16} />
                                            </IconButton>
                                            <IconButton size="small" sx={{ color: '#64748b' }}>
                                                <Copy size={16} />
                                            </IconButton>
                                            <IconButton size="small" sx={{ color: '#64748b' }}>
                                                <Trash2 size={16} />
                                            </IconButton>
                                        </Stack>
                                    </TableCell>
                                    <TableCell sx={{ fontWeight: 600, color: '#1e293b', fontSize: '0.875rem' }}>{role.name}</TableCell>
                                    <TableCell sx={{ color: '#64748b', fontSize: '0.875rem' }}>
                                        <Typography fontSize="0.875rem" noWrap sx={{ maxWidth: 450 }}>
                                            {role.description}
                                        </Typography>
                                    </TableCell>
                                    <TableCell sx={{ color: '#64748b', fontSize: '0.875rem' }}>{role.roleCode}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>

                {/* Footer Controls */}
                <Box sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid #f1f5f9' }}>
                    <Stack direction="row" alignItems="center" spacing={1}>
                        <Settings size={16} className="text-slate-400" />
                        <Typography variant="caption" color="text.secondary" fontWeight={500}>
                            Save displayed column set
                        </Typography>
                    </Stack>

                    <Stack direction="row" alignItems="center" spacing={2}>
                        <Pagination count={1} shape="rounded" size="small" />
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Select
                                value={10}
                                size="small"
                                sx={{ height: 32, fontSize: '0.8rem', bgcolor: 'white' }}
                            >
                                <MenuItem value={10}>10</MenuItem>
                                <MenuItem value={20}>20</MenuItem>
                            </Select>
                        </Box>
                        <Stack direction="row" alignItems="center" spacing={0.5} color="#22c55e">
                            <Download size={16} />
                            <Typography variant="caption" fontWeight={600}>Rows: {roles.length}</Typography>
                        </Stack>
                    </Stack>
                </Box>
            </Card>
        </Box>
    );
};

export default RolesAndPermissions;
