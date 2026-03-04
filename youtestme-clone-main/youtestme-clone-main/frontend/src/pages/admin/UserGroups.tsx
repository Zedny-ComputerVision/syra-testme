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
    Users,
    Search,
    Plus,
    MoreVertical,
    ArrowUpDown,
    Download,
    Settings,
    ChevronDown
} from 'lucide-react';
import Header from '../../components/Header';

interface UserGroup {
    id: string;
    name: string;
    path: string;
    description: string;
}

const UserGroups = () => {
    // Mock data based on the idea, not exact records
    const [groups, setGroups] = useState<UserGroup[]>([
        { id: '10019', name: 'Booking user group', path: 'Booking user group', description: '' },
        { id: '10018', name: 'E-commerce user group', path: 'E-commerce user group', description: '' },
        { id: '10020', name: 'free access user group', path: 'free access user group', description: '' },
        { id: '10022', name: 'Lockdown browser user group', path: 'Lockdown browser user group', description: '' },
        { id: '10015', name: 'Marketing and Sales', path: 'Marketing and Sales', description: 'The Marketing and Sales department strategically promotes products...' },
        { id: '10016', name: 'Marketing Team', path: 'Marketing and Sales > Marketing Team', description: 'The Marketing Team crafts compelling strategies, engaging campaigns...' },
        { id: '10017', name: 'Sales Team', path: 'Marketing and Sales > Sales Team', description: 'The Sales Team employs expertise and relationship-building...' },
    ]);

    return (
        <Box sx={{ p: 4 }}>
            <Header
                title="User groups"
                subtitle="Groups can be organized hierarchically. Group managers can edit groups, manage members, distribute assignments, and review statistics. Members added to a group can participate in the tests, surveys, and training courses assigned to that group."
                icon={<Users size={24} />}
                breadcrumbs={[
                    { label: 'Users', href: '#' },
                    { label: 'User groups', href: '#' }
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
                        <Users size={20} className="text-slate-500" />
                        <Typography variant="h6" fontSize="1rem" fontWeight={600} color="#1e293b">
                            Groups
                        </Typography>
                    </Stack>
                    <Button
                        variant="contained"
                        startIcon={<Plus size={18} />}
                        sx={{
                            bgcolor: '#1e293b',
                            textTransform: 'none',
                            '&:hover': { bgcolor: '#0f172a' }
                        }}
                    >
                        New top level group
                    </Button>
                </Box>

                <TableContainer>
                    <Table sx={{ minWidth: 650 }} size="medium">
                        <TableHead sx={{ bgcolor: '#f8fafc' }}>
                            <TableRow>
                                <TableCell width="120">
                                    <Stack direction="row" alignItems="center" spacing={1} sx={{ cursor: 'pointer', mb: 1 }}>
                                        <Typography variant="caption" fontWeight={600} color="#64748b">ID</Typography>
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
                                <TableCell width="300">
                                    <Stack direction="row" alignItems="center" spacing={1} sx={{ cursor: 'pointer', mb: 1 }}>
                                        <Typography variant="caption" fontWeight={600} color="#64748b">Path</Typography>
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
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {groups.map((group) => (
                                <TableRow
                                    key={group.id}
                                    sx={{
                                        '&:hover': { bgcolor: '#f8fafc' },
                                        '& td': { borderColor: '#f1f5f9' },
                                        cursor: 'pointer'
                                    }}
                                >
                                    <TableCell sx={{ color: '#64748b', fontSize: '0.875rem' }}>{group.id}</TableCell>
                                    <TableCell sx={{ fontWeight: 600, color: '#3b82f6', fontSize: '0.875rem' }}>{group.name}</TableCell>
                                    <TableCell sx={{ color: '#64748b', fontSize: '0.875rem' }}>{group.path}</TableCell>
                                    <TableCell sx={{ color: '#64748b', fontSize: '0.875rem' }}>
                                        <Typography fontSize="0.875rem" noWrap sx={{ maxWidth: 400 }}>
                                            {group.description}
                                        </Typography>
                                    </TableCell>
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
                        <Pagination count={10} shape="rounded" size="small" />
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Select
                                value={10}
                                size="small"
                                sx={{ height: 32, fontSize: '0.8rem', bgcolor: 'white' }}
                            >
                                <MenuItem value={10}>10</MenuItem>
                                <MenuItem value={20}>20</MenuItem>
                                <MenuItem value={50}>50</MenuItem>
                            </Select>
                        </Box>
                        <Stack direction="row" alignItems="center" spacing={0.5} color="#22c55e">
                            <Download size={16} />
                            <Typography variant="caption" fontWeight={600}>Rows: {groups.length}</Typography>
                        </Stack>
                    </Stack>
                </Box>
            </Card>
        </Box>
    );
};

export default UserGroups;
