import { useEffect, useState } from 'react';
import {
    Box,
    Typography,
    Button,
    IconButton,
    Stack,
    Breadcrumbs,
    Link,
    Card,
    CardContent,
    Chip,
    Divider
} from '@mui/material';
import {
    PlayCircle,
    MonitorCheck,
    ClipboardList,
    LayoutGrid,
    List,
    Calendar as CalendarIcon,
    ChevronRight,
    Clock,
    FileText,
    ChevronDown
} from 'lucide-react';
import FilterBar from '../components/common/FilterBar';

interface Survey {
    id: number;
    title: string;
    description: string;
    status: 'available' | 'completed' | 'upcoming' | 'suspended' | 'pending';
    image: string;
    duration?: number;
    deadline?: string;
    questionCount?: number;
}

const SurveyCard = ({ survey }: { survey: Survey }) => {
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'available': return '#22c55e';
            case 'completed': return '#3b82f6';
            case 'upcoming': return '#f59e0b';
            case 'suspended': return '#ef4444';
            case 'pending': return '#64748b';
            default: return '#64748b';
        }
    };

    return (
        <Card sx={{
            borderRadius: 3,
            overflow: 'hidden',
            boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
            border: '1px solid #f1f5f9',
            '&:hover': { boxShadow: '0 10px 30px rgba(0,0,0,0.08)', transform: 'translateY(-4px)' },
            transition: 'all 0.3s ease'
        }}>
            <Box sx={{ height: 140, bgcolor: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid #f1f5f9' }}>
                <ClipboardList size={48} color="#94a3b8" />
            </Box>
            <CardContent sx={{ p: 2.5 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={1.5}>
                    <Typography variant="h6" fontWeight={700} color="#1e293b" sx={{ fontSize: '1rem', lineHeight: 1.4 }}>
                        {survey.title}
                    </Typography>
                    <Chip
                        label={survey.status.charAt(0).toUpperCase() + survey.status.slice(1)}
                        size="small"
                        sx={{
                            height: 22,
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            bgcolor: `${getStatusColor(survey.status)}15`,
                            color: getStatusColor(survey.status),
                            border: `1px solid ${getStatusColor(survey.status)}30`
                        }}
                    />
                </Stack>

                <Typography variant="body2" color="text.secondary" sx={{ mb: 2, height: 40, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                    {survey.description}
                </Typography>

                <Divider sx={{ mb: 2, opacity: 0.6 }} />

                <Stack direction="row" spacing={2} mb={2}>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                        <Clock size={14} className="text-slate-400" />
                        <Typography variant="caption" color="text.secondary">{survey.duration || 10} min</Typography>
                    </Stack>
                    <Stack direction="row" spacing={0.5} alignItems="center">
                        <FileText size={14} className="text-slate-400" />
                        <Typography variant="caption" color="text.secondary">{survey.questionCount || 5} Questions</Typography>
                    </Stack>
                </Stack>

                <Button
                    fullWidth
                    variant="contained"
                    disableElevation
                    sx={{
                        borderRadius: 2,
                        textTransform: 'none',
                        fontWeight: 600,
                        bgcolor: '#1e293b',
                        '&:hover': { bgcolor: '#0f172a' }
                    }}
                >
                    Start survey
                </Button>
            </CardContent>
        </Card>
    );
};

const MySurveys = () => {
    const [surveys, setSurveys] = useState<Survey[]>([]);

    useEffect(() => {
        // Mock data
        setSurveys([
            { id: 1, title: 'Course Satisfaction Survey', description: 'Help us improve our training materials.', status: 'available', image: '', duration: 5, questionCount: 10 },
            { id: 2, title: 'Environment & Safety', description: 'Assessment of workplace safety measures.', status: 'available', image: '', duration: 15, questionCount: 20 },
            { id: 3, title: 'Onboarding Feedback', description: 'Your experience during the first week.', status: 'completed', image: '', duration: 8, questionCount: 12 },
            { id: 4, title: 'Monthly Quiz', description: 'Check your knowledge on recent updates.', status: 'upcoming', image: '', duration: 10, questionCount: 15 },
        ]);
    }, []);

    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');
    const [sortBy, setSortBy] = useState('Available first');

    const handleReset = () => {
        setSearchQuery('');
        setFilterStatus('All');
        setSortBy('Available first');
    };

    const filteredSurveys = surveys
        .filter(s => {
            if (filterStatus !== 'All' && s.status !== filterStatus.toLowerCase()) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                if (!s.title.toLowerCase().includes(q) && !s.description.toLowerCase().includes(q)) return false;
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
                    My surveys
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
                        <ClipboardList size={24} className="text-slate-700" />
                        <Typography variant="h5" fontWeight={700} color="#1e293b">
                            My surveys
                        </Typography>
                    </Stack>
                    <Typography fontSize="0.875rem" color="text.secondary" sx={{ mt: 0.5, maxWidth: 600 }}>
                        Access available surveys, book a seat for an upcoming survey, or view reports from previous surveys.
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
                        { value: 'All', label: `All (${surveys.length})` },
                        { value: 'available', label: `Available (${surveys.filter(s => s.status === 'available').length})` },
                        { value: 'completed', label: `Completed (${surveys.filter(s => s.status === 'completed').length})` },
                        { value: 'suspended', label: `Suspended (${surveys.filter(s => s.status === 'suspended').length})` },
                        { value: 'upcoming', label: `Upcoming (${surveys.filter(s => s.status === 'upcoming').length})` },
                        { value: 'pending', label: `Pending (${surveys.filter(s => s.status === 'pending').length})` },
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
                    searchPlaceholder="Search by survey name"
                    onReset={handleReset}
                />
            </Box>

            {/* Empty State */}
            {filteredSurveys.length === 0 && (
                <Typography color="text.secondary" sx={{ mt: 2, textAlign: 'center', py: 8 }}>
                    No surveys found matching your criteria.
                </Typography>
            )}

            {/* Grid for Survey Cards */}
            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                gap: 3
            }}>
                {filteredSurveys.map(survey => (
                    <SurveyCard key={survey.id} survey={survey} />
                ))}
            </Box>
        </Box>
    );
};

export default MySurveys;
