import { ReactElement, useEffect, useState } from 'react';
import {
    Box,
    Typography,
    TextField,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    TableContainer,
    Button,
    Chip,
    IconButton,
    Card,
    Stack,
    MenuItem,
    Select,
    FormControl,
    InputLabel,
    Checkbox,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Toolbar,
    Tooltip,
    Avatar,
    TablePagination,
} from '@mui/material';
import IconifyIcon from 'components/base/IconifyIcon';
import { alpha, useTheme } from '@mui/material/styles';

interface UserProfile {
    id: string;
    username: string;
    email: string;
    role: string; // Allow flexible strings from backend
    status: string; // Allow flexible strings from backend
    lastActive: string;
    avatar?: string;
}

// Mock Data
// Mock Data removed - using API


const UserProfiles = (): ReactElement => {
    const theme = useTheme();
    // State
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [query, setQuery] = useState('');
    const [roleFilter, setRoleFilter] = useState('All');
    const [statusFilter, setStatusFilter] = useState('All');
    const [selected, setSelected] = useState<string[]>([]);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(5);

    // Dialog State
    const [openCreate, setOpenCreate] = useState(false);
    const [newUser, setNewUser] = useState({ username: '', email: '', role: 'User', status: 'Active' });

    // Fetch Users
    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            const res = await fetch('/api/admin/users');
            const data = await res.json();
            if (Array.isArray(data)) setUsers(data);
        } catch (error) {
            console.error('Failed to fetch users', error);
        }
    };

    // Filtering
    const filteredUsers = users.filter((u) => {
        const matchesQuery = u.username.toLowerCase().includes(query.toLowerCase()) || u.email.toLowerCase().includes(query.toLowerCase());
        const matchesRole = roleFilter === 'All' || u.role === roleFilter || (roleFilter === 'Admin' && u.role === 'admin'); // Handle case mismatch
        const matchesStatus = statusFilter === 'All' || u.status === statusFilter || (statusFilter === 'Active' && u.status === 'active');
        return matchesQuery && matchesRole && matchesStatus;
    });

    // Pagination
    const paginatedUsers = filteredUsers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

    // Handlers
    const handleSelectAll = (event: React.ChangeEvent<HTMLInputElement>) => {
        if (event.target.checked) {
            setSelected(filteredUsers.map((n) => n.id));
            return;
        }
        setSelected([]);
    };

    const handleSelect = (id: string) => {
        const selectedIndex = selected.indexOf(id);
        let newSelected: string[] = [];

        if (selectedIndex === -1) {
            newSelected = newSelected.concat(selected, id);
        } else if (selectedIndex === 0) {
            newSelected = newSelected.concat(selected.slice(1));
        } else if (selectedIndex === selected.length - 1) {
            newSelected = newSelected.concat(selected.slice(0, -1));
        } else if (selectedIndex > 0) {
            newSelected = newSelected.concat(selected.slice(0, selectedIndex), selected.slice(selectedIndex + 1));
        }
        setSelected(newSelected);
    };

    const handleDeleteSelected = async () => {
        for (const id of selected) {
            try {
                await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
            } catch (e) {
                console.error(e);
            }
        }
        await fetchUsers();
        setSelected([]);
    };

    const handleCreateUser = async () => {
        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newUser),
            });
            if (res.ok) {
                await fetchUsers();
                setOpenCreate(false);
                setNewUser({ username: '', email: '', role: 'User', status: 'Active' });
            }
        } catch (e) {
            console.error(e);
        }
    };

    // Status Colors
    const getStatusColor = (status: string) => {
        const s = status.toLowerCase();
        switch (s) {
            case 'active': return 'success';
            case 'inactive': return 'error';
            case 'pending': return 'warning';
            default: return 'default';
        }
    };

    return (
        <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3}>
                <Typography variant="h4" fontWeight={600}>User Profiles</Typography>
                <Button
                    variant="contained"
                    startIcon={<IconifyIcon icon="mdi:plus" />}
                    onClick={() => setOpenCreate(true)}
                >
                    New User
                </Button>
            </Stack>

            <Card>
                {/* Toolbar with Filter & Search */}
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ p: 2.5 }} alignItems="center" justifyContent="space-between">
                    {selected.length > 0 ? (
                        <Toolbar
                            sx={{
                                pl: { sm: 2 },
                                pr: { xs: 1, sm: 1 },
                                width: '100%',
                                ...(selected.length > 0 && {
                                    bgcolor: (theme) => alpha(theme.palette.primary.main, 0.08),
                                    borderRadius: 1,
                                }),
                            }}
                        >
                            <Typography sx={{ flex: '1 1 100%' }} color="inherit" variant="subtitle1" component="div">
                                {selected.length} selected
                            </Typography>
                            <Tooltip title="Delete">
                                <IconButton onClick={handleDeleteSelected}>
                                    <IconifyIcon icon="mdi:delete" />
                                </IconButton>
                            </Tooltip>
                        </Toolbar>
                    ) : (
                        <>
                            <Stack direction="row" spacing={2} flex={1}>
                                <FormControl size="small" sx={{ minWidth: 150 }}>
                                    <InputLabel>Role</InputLabel>
                                    <Select value={roleFilter} label="Role" onChange={(e) => setRoleFilter(e.target.value)}>
                                        <MenuItem value="All">All</MenuItem>
                                        <MenuItem value="Admin">Admin</MenuItem>
                                        <MenuItem value="Proctor">Proctor</MenuItem>
                                        <MenuItem value="User">User</MenuItem>
                                    </Select>
                                </FormControl>
                                <FormControl size="small" sx={{ minWidth: 150 }}>
                                    <InputLabel>Status</InputLabel>
                                    <Select value={statusFilter} label="Status" onChange={(e) => setStatusFilter(e.target.value)}>
                                        <MenuItem value="All">All</MenuItem>
                                        <MenuItem value="Active">Active</MenuItem>
                                        <MenuItem value="Inactive">Inactive</MenuItem>
                                        <MenuItem value="Pending">Pending</MenuItem>
                                    </Select>
                                </FormControl>
                            </Stack>

                            <TextField
                                placeholder="Search user..."
                                size="small"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                InputProps={{
                                    startAdornment: <IconifyIcon icon="mdi:magnify" color="text.disabled" sx={{ mr: 1 }} />
                                }}
                            />
                        </>
                    )}
                </Stack>

                {/* Data Table */}
                <TableContainer>
                    <Table>
                        <TableHead>
                            <TableRow>
                                <TableCell padding="checkbox">
                                    <Checkbox
                                        indeterminate={selected.length > 0 && selected.length < filteredUsers.length}
                                        checked={filteredUsers.length > 0 && selected.length === filteredUsers.length}
                                        onChange={handleSelectAll}
                                    />
                                </TableCell>
                                <TableCell>User</TableCell>
                                <TableCell>Role</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell>Last Active</TableCell>
                                <TableCell align="right">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {paginatedUsers.map((user) => {
                                const isSelected = selected.indexOf(user.id) !== -1;
                                return (
                                    <TableRow
                                        key={user.id}
                                        hover
                                        selected={isSelected}
                                        onClick={() => handleSelect(user.id)}
                                        sx={{ cursor: 'pointer' }}
                                    >
                                        <TableCell padding="checkbox">
                                            <Checkbox checked={isSelected} />
                                        </TableCell>
                                        <TableCell>
                                            <Stack direction="row" alignItems="center" spacing={2}>
                                                <Avatar alt={user.username} src={user.avatar}>{user.username.charAt(0).toUpperCase()}</Avatar>
                                                <Box>
                                                    <Typography variant="subtitle2" noWrap>{user.username}</Typography>
                                                    <Typography variant="body2" color="text.secondary" noWrap>{user.email}</Typography>
                                                </Box>
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={user.role}
                                                size="small"
                                                variant="outlined"
                                                color={user.role === 'Admin' ? 'primary' : 'default'}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={user.status}
                                                size="small"
                                                color={getStatusColor(user.status) as any}
                                                variant="filled" // Updated to filled for better visibility
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" color="text.secondary">{user.lastActive}</Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <IconButton size="small">
                                                <IconifyIcon icon="mdi:dots-vertical" />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>

                <TablePagination
                    rowsPerPageOptions={[5, 10, 25]}
                    component="div"
                    count={filteredUsers.length}
                    rowsPerPage={rowsPerPage}
                    page={page}
                    onPageChange={(_, newPage) => setPage(newPage)}
                    onRowsPerPageChange={(e) => {
                        setRowsPerPage(parseInt(e.target.value, 10));
                        setPage(0);
                    }}
                />
            </Card>

            {/* Create User Dialog */}
            <Dialog open={openCreate} onClose={() => setOpenCreate(false)} maxWidth="sm" fullWidth>
                <DialogTitle>New User</DialogTitle>
                <DialogContent>
                    <Box display="grid" gap={3} mt={1}>
                        <TextField
                            label="Username"
                            fullWidth
                            value={newUser.username}
                            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                        />
                        <TextField
                            label="Email"
                            fullWidth
                            value={newUser.email}
                            onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        />
                        <FormControl fullWidth>
                            <InputLabel>Role</InputLabel>
                            <Select
                                value={newUser.role}
                                label="Role"
                                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                            >
                                <MenuItem value="User">User</MenuItem>
                                <MenuItem value="Proctor">Proctor</MenuItem>
                                <MenuItem value="Admin">Admin</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl fullWidth>
                            <InputLabel>Status</InputLabel>
                            <Select
                                value={newUser.status}
                                label="Status"
                                onChange={(e) => setNewUser({ ...newUser, status: e.target.value })}
                            >
                                <MenuItem value="Active">Active</MenuItem>
                                <MenuItem value="Inactive">Inactive</MenuItem>
                                <MenuItem value="Pending">Pending</MenuItem>
                            </Select>
                        </FormControl>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenCreate(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleCreateUser} disabled={!newUser.username || !newUser.email}>Create Result</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default UserProfiles;
