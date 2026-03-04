import { useNavigate, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Box, Typography, Button, IconButton, Stack, Breadcrumbs, Link } from '@mui/material';
import {
    PlayCircle,
    MonitorCheck,
    FileText,
    LayoutGrid,
    List,
    Calendar as CalendarIcon,
    ChevronRight
} from 'lucide-react';
import TestCard from '../components/TestCard';
import FilterBar from '../components/common/FilterBar';

const MyTests = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const [tests, setTests] = useState<Array<{
        id: number;
        title: string;
        description: string;
        status: 'available' | 'completed' | 'upcoming' | 'suspended';
        image: string;
        duration?: number;
        deadline?: string;
        questionCount?: number;
    }>>([]);

    const loadTests = async () => {
        try {
            let res = await fetch('/api/tests');
            if (!res.ok) {
                try {
                    res = await fetch('http://localhost:3000/api/tests');
                } catch { }
            }
            if (!res || !res.ok) throw new Error('Failed to fetch tests');
            const data = await res.json();
            if (!Array.isArray(data)) return;
            const mapped = data.map((d: any) => {
                let mappedStatus: 'available' | 'completed' | 'upcoming' | 'suspended' = 'available';
                const rawStatus = String(d.status || 'available').toLowerCase();

                if (rawStatus === 'completed') mappedStatus = 'completed';
                else if (rawStatus === 'upcoming') mappedStatus = 'upcoming';
                else if (rawStatus === 'suspended') mappedStatus = 'suspended';

                let rules: any = {};
                if (typeof d.rules === 'string') {
                    try { rules = JSON.parse(d.rules); } catch { }
                } else if (d.rules) {
                    rules = d.rules;
                }

                const duration = rules.duration ? Number(rules.duration) : undefined;
                const deadline = rules.initialSession?.endDate || undefined;
                const questionCount = Number(d.question_count || 0);

                return {
                    id: Number(d.id),
                    title: String(d.name || 'Untitled'),
                    description: String(d.description || ''),
                    status: mappedStatus,
                    image: String(d.image || '/vite.svg'),
                    duration,
                    deadline,
                    questionCount
                };
            });
            setTests(mapped);
        } catch {
            setTests([
                { id: 1, title: 'اختبار المحققين', description: 'Comprehensive evaluation of health and safety.', status: 'available', image: '/vite.svg', duration: 60, deadline: '2025-12-01T15:42:00', questionCount: 10 },
                { id: 2, title: 'Senior Frontend Developer Assessment', description: 'React, TypeScript, and modern CSS.', status: 'available', image: '/vite.svg', duration: 45, questionCount: 15 }
            ]);
        }
    };

    useEffect(() => { loadTests(); }, []);

    const handleStartTest = (testId: number) => {
        navigate(`/verify-id/${testId}`);
    };

    const [searchQuery, setSearchQuery] = useState(location.state?.searchQuery || '');
    const [filterStatus, setFilterStatus] = useState('All');
    const [sortBy, setSortBy] = useState('Available first');

    const handleReset = () => {
        setSearchQuery('');
        setFilterStatus('All');
        setSortBy('Available first');
    };

    const filteredTests = tests
        .filter(t => {
            if (filterStatus !== 'All' && t.status !== filterStatus.toLowerCase()) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (!t.title.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q)) return false;
            }
            return true;
        })
        .sort((a, b) => {
            if (sortBy === 'Available first') {
                if (a.status === 'available' && b.status !== 'available') return -1;
                if (a.status !== 'available' && b.status === 'available') return 1;
                return 0;
            }
            if (sortBy === 'A-Z') return a.title.localeCompare(b.title);
            if (sortBy === 'Z-A') return b.title.localeCompare(a.title);
            if (sortBy === 'Creation date desc') return b.id - a.id;
            if (sortBy === 'Creation date asc') return a.id - b.id;
            if (sortBy === 'Session start date') {
                const dateA = a.deadline ? new Date(a.deadline).getTime() : 0;
                const dateB = b.deadline ? new Date(b.deadline).getTime() : 0;
                return dateB - dateA;
            }
            return 0;
        });

    return (
        <Box sx={{ pb: 4, px: { xs: 2, md: 4 } }}>
            {/* Breadcrumbs */}
            <Breadcrumbs
                separator={<ChevronRight size={14} className="text-slate-400" />}
                sx={{ mb: 2, mt: 1 }}
            >
                <Link underline="hover" color="primary" href="#" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                    My tests
                </Link>
            </Breadcrumbs>

            {/* Header */}
            <Box sx={{
                display: 'flex',
                alignItems: { md: 'flex-start' },
                justifyContent: 'space-between',
                gap: 2,
                mb: 3
            }}>
                <Box>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <FileText size={24} className="text-slate-700" />
                        <Typography variant="h5" fontWeight={700} color="#1e293b">
                            My tests
                        </Typography>
                    </Stack>
                    <Typography fontSize="0.875rem" color="text.secondary" sx={{ mt: 0.5, maxWidth: 600 }}>
                        Access available tests, book seats for upcoming tests, or view reports from previous tests.
                    </Typography>
                </Box>

                <Stack direction="row" spacing={1} alignItems="center">
                    <Stack direction="row" spacing={0.5} alignItems="center">
                        <Typography variant="caption" color="primary" fontWeight={600} sx={{ cursor: 'pointer' }}>Play video</Typography>
                        <IconButton size="small" color="primary">
                            <PlayCircle size={18} />
                        </IconButton>
                    </Stack>

                    <Button
                        variant="outlined"
                        size="small"
                        startIcon={<MonitorCheck size={16} />}
                        sx={{
                            borderRadius: 2,
                            textTransform: 'none',
                            color: '#1e293b',
                            borderColor: '#e2e8f0',
                            bgcolor: 'white'
                        }}
                    >
                        Check equipment
                    </Button>

                    <Stack direction="row" sx={{ border: '1px solid #e2e8f0', borderRadius: 2, bgcolor: 'white', p: 0.5 }}>
                        <IconButton size="small"><List size={18} className="text-slate-400" /></IconButton>
                        <IconButton size="small" sx={{ bgcolor: '#f1f5f9' }}><LayoutGrid size={18} className="text-slate-900" /></IconButton>
                        <IconButton size="small"><CalendarIcon size={18} className="text-slate-400" /></IconButton>
                    </Stack>
                </Stack>
            </Box>

            {/* Filter Bar */}
            <Box sx={{ mb: 4 }}>
                <FilterBar
                    filterStatus={filterStatus}
                    onFilterStatusChange={setFilterStatus}
                    statusOptions={[
                        { value: 'All', label: `All (${tests.length})` },
                        { value: 'available', label: `Available (${tests.filter(t => t.status === 'available').length})` },
                        { value: 'completed', label: `Completed (${tests.filter(t => t.status === 'completed').length})` },
                        { value: 'suspended', label: `Suspended or expired (${tests.filter(t => t.status === 'suspended').length})` },
                        { value: 'upcoming', label: `Upcoming (${tests.filter(t => t.status === 'upcoming').length})` },
                    ]}
                    sortBy={sortBy}
                    onSortByChange={setSortBy}
                    sortOptions={[
                        { value: 'Available first', label: 'Available first' },
                        { value: 'A-Z', label: 'A \u2192 Z' },
                        { value: 'Z-A', label: 'Z \u2192 A' },
                        { value: 'Creation date desc', label: 'Creation date \u2193' },
                        { value: 'Creation date asc', label: 'Creation date \u2191' },
                        { value: 'Session start date', label: 'Session start date \u2193' },
                    ]}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder="Search by test name"
                    onReset={handleReset}
                />
            </Box>

            {/* Grid */}
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                gap: 3
            }}>
                {filteredTests.map(test => (
                    <TestCard key={test.id} {...test} onStart={handleStartTest} />
                ))}
            </Box>
        </Box>
    );
};

export default MyTests;
