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
    Switch,
    Chip
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import FilterListIcon from '@mui/icons-material/FilterList';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import PeopleAltIcon from '@mui/icons-material/PeopleAlt';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import ShareIcon from '@mui/icons-material/Share';

const TestingSessions = () => {
    const [page, setPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [searchTerm, setSearchTerm] = useState('');

    const sessions = [
        {
            id: '10024',
            name: 'Testing Session - SEB',
            testName: 'امتحان التحقيق في الحوادث والوقائع - المدققون المعتمدون - المحترفون',
            isActive: true,
            status: 'Finished',
            availableFrom: 'Dec-18-2025 09:00 AM EET',
            availableTo: 'Dec-20-2025 01:00 AM EET',
            candidates: 0,
            booking: { type: 'self-enrollment', settings: 'Available in self-enrollment mode' },
            security: { proctoring: true, password: false }
        },
        {
            id: '10023',
            name: 'Testing Session - SEB',
            testName: 'امتحان التحقيق في الحوادث والوقائع - المدققون المعتمدون - المحترفون',
            isActive: true,
            status: 'Finished',
            availableFrom: 'Dec-18-2025 09:00 AM EET',
            availableTo: 'Dec-20-2025 09:00 AM EET',
            candidates: 0,
            booking: { type: 'self-enrollment', settings: 'Available in self-enrollment mode' },
            security: { proctoring: true, password: false }
        },
        {
            id: '10018',
            name: 'Testing session in the future (booking)',
            testName: 'اختبار المدققين',
            isActive: false,
            status: 'Available now',
            availableFrom: 'Oct-31-2025 10:47 AM EET',
            availableTo: 'Oct-31-2026 10:47 AM EET',
            candidates: 0,
            assignment: 'Booking user group',
            booking: {
                deadline: 'Oct-21-2025 10:48 AM EEST',
                cancelDeadline: 'Oct-24-2025 10:48 AM EEST',
                slots: 50
            },
            security: { proctoring: false, password: false }
        },
    ];

    return (
        <Box p={3}>
            {/* Header */}
            <Box mb={3}>
                <Typography variant="h5" fontWeight="bold">Testing sessions</Typography>
                <Typography variant="body2" color="text.secondary" mt={1}>
                    Schedule tests for candidates by creating testing sessions. Depending on settings, candidates automatically receive test instructions by email when assigned to a session or when they book a test.
                </Typography>
            </Box>

            {/* Search and Filters */}
            <Box mb={3} display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
                <Box display="flex" gap={2} flexGrow={1} maxWidth={800}>
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                        <Select value="name" displayEmpty inputProps={{ 'aria-label': 'Sort by' }}>
                            <MenuItem value="name">Sort by</MenuItem>
                            <MenuItem value="date">Date</MenuItem>
                        </Select>
                    </FormControl>
                    <TextField
                        fullWidth
                        size="small"
                        placeholder="Search by testing session name"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        variant="outlined"
                    />
                    <Button variant="outlined" startIcon={<FilterListIcon />}>Filter</Button>
                </Box>
                <Box display="flex" gap={1}>
                    <Button variant="contained" sx={{ bgcolor: '#0f172a', textTransform: 'none' }}>New testing session</Button>
                    <Button variant="outlined" sx={{ textTransform: 'none' }}>Import testing sessions</Button>
                    <Stack direction="row" border="1px solid #e0e0e0" borderRadius={1}>
                        <IconButton size="small"><CalendarMonthIcon /></IconButton>
                        <IconButton size="small"><PeopleAltIcon /></IconButton>
                    </Stack>
                </Box>
            </Box>

            {/* Session Cards Grid */}
            <Box display="flex" flexWrap="wrap" gap={3}>
                {sessions.map((session) => (
                    <Paper key={session.id} variant="outlined" sx={{ borderRadius: 2, p: 0, width: '100%', maxWidth: 400, flex: '1 1 350px' }}>
                        {/* Card Header */}
                        <Box p={2} borderBottom="1px solid #e0e0e0" display="flex" justifyContent="space-between" alignItems="center">
                            <Box>
                                <Typography variant="caption" sx={{ border: '1px solid #e0e0e0', borderRadius: 0.5, px: 0.5, mr: 1, color: 'text.secondary' }}>ID: {session.id}</Typography>
                                <Link href="#" underline="hover" fontWeight="bold">{session.name}</Link>
                            </Box>
                            <IconButton size="small"><MoreVertIcon /></IconButton>
                        </Box>

                        {/* Card Content */}
                        <Box p={2}>
                            {/* Test Name & Active Toggle */}
                            <Box display="flex" justifyContent="space-between" mb={2}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Test name</Typography>
                                    <Link display="block" href="#" underline="hover" sx={{ fontSize: '0.875rem' }}>{session.testName}</Link>
                                </Box>
                                <Box textAlign="right">
                                    <Stack direction="row" alignItems="center" justifyContent="flex-end" gap={1}>
                                        <Typography variant="caption" color="text.secondary">Session is {session.isActive ? 'active' : 'inactive'}</Typography>
                                        <Switch size="small" checked={session.isActive} />
                                    </Stack>
                                    <Stack direction="row" alignItems="center" justifyContent="flex-end" gap={0.5} mt={0.5}>
                                        <Typography variant="caption" color="text.secondary">{session.status}</Typography>
                                        <AccessTimeIcon fontSize="inherit" color="action" />
                                    </Stack>
                                </Box>
                            </Box>

                            {/* Dates */}
                            <Box mb={2}>
                                <Box display="flex" justifyContent="space-between" mb={0.5}>
                                    <Typography variant="caption" color="text.secondary">Available from</Typography>
                                    <Typography variant="caption" fontWeight="medium">{session.availableFrom}</Typography>
                                </Box>
                                <Box display="flex" justifyContent="space-between">
                                    <Typography variant="caption" color="text.secondary">Available to</Typography>
                                    <Typography variant="caption" fontWeight="medium">{session.availableTo}</Typography>
                                </Box>
                            </Box>

                            <Box my={2} borderTop="1px solid #f0f0f0" />

                            {/* Candidates Section */}
                            <Box mb={2}>
                                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                    <Typography variant="subtitle2" fontWeight="bold">Candidates and sharing</Typography>
                                    <Chip label={session.assignment || "Manual assignment"} size="small" />
                                </Box>
                                <Box display="flex" justifyContent="space-between" alignItems="center">
                                    <Typography variant="caption" color="text.secondary">Number of candidates in this session</Typography>
                                    <Link href="#">{session.candidates}</Link>
                                </Box>
                                <Box display="flex" justifyContent="space-between" alignItems="center" mt={0.5}>
                                    <Typography variant="caption" color="text.secondary">Session link is available for sharing</Typography>
                                    <IconButton size="small"><ShareIcon fontSize="small" /></IconButton>
                                </Box>
                                {session.assignment === 'Booking user group' && (
                                    <Box display="flex" justifyContent="space-between" alignItems="center" mt={0.5}>
                                        <Typography variant="caption" color="text.secondary">Assigned user group</Typography>
                                        <Typography variant="caption">{session.assignment}</Typography>
                                    </Box>
                                )}
                            </Box>

                            <Box my={2} borderTop="1px solid #f0f0f0" />

                            {/* Booking Section */}
                            <Box mb={2}>
                                <Typography variant="subtitle2" fontWeight="bold" gutterBottom>Booking and purchase settings</Typography>
                                {session.booking.deadline ? (
                                    <>
                                        <Box display="flex" justifyContent="space-between">
                                            <Typography variant="caption" color="text.secondary">Booking deadline</Typography>
                                            <Typography variant="caption">{session.booking.deadline}</Typography>
                                        </Box>
                                        <Box display="flex" justifyContent="space-between">
                                            <Typography variant="caption" color="text.secondary">Cancellation deadline</Typography>
                                            <Typography variant="caption">{session.booking.cancelDeadline}</Typography>
                                        </Box>
                                        <Box display="flex" justifyContent="space-between">
                                            <Typography variant="caption" color="text.secondary">Booking slots available</Typography>
                                            <Typography variant="caption">{session.booking.slots}</Typography>
                                        </Box>
                                    </>
                                ) : (
                                    <Typography variant="caption" color="text.secondary">{session.booking.settings}</Typography>
                                )}
                            </Box>

                            <Box my={2} borderTop="1px solid #f0f0f0" />

                            {/* Security Section */}
                            <Box>
                                <Typography variant="subtitle2" fontWeight="bold" gutterBottom>Security and proctoring settings</Typography>
                                <Box display="flex" justifyContent="space-between" mb={0.5}>
                                    <Typography variant="caption" color="text.secondary">Proctoring is {session.security.proctoring ? 'enabled' : 'disabled'}</Typography>
                                    {session.security.proctoring && <Chip label="YouTestMe Proctoring - Default settings" size="small" sx={{ height: 20, fontSize: '0.65rem' }} />}
                                </Box>
                                <Typography variant="caption" color="text.secondary">Testing session is {session.security.password ? 'password protected' : 'not password protected'}</Typography>
                            </Box>

                        </Box>
                    </Paper>
                ))}
            </Box>
        </Box>
    );
};

export default TestingSessions;
