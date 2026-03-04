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
    Tabs,
    Tab,
    Avatar,
    Divider
} from '@mui/material';
import {
    GraduationCap,
    ChevronRight,
    MoreVertical,
    CheckCircle,
    FileText,
    BarChart3,
    Layers
} from 'lucide-react';
import FilterBar from '../components/common/FilterBar';

interface TrainingCourse {
    id: number;
    title: string;
    description: string;
    status: 'In progress' | 'Completed' | 'Not started';
    image: string;
    assignmentType: string;
    steps: number;
    assignments: number;
    progress: number;
}

const TrainingCourseCard = ({ course }: { course: TrainingCourse }) => {
    const [tabValue, setTabValue] = useState(0);

    const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    return (
        <Card sx={{
            borderRadius: 2,
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            bgcolor: 'background.paper'
        }}>
            <Box sx={{ p: 2, pb: 1 }}>
                <Stack direction="row" alignItems="center" spacing={2} justifyContent="space-between">
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Avatar
                            src={course.image}
                            variant="rounded"
                            sx={{ width: 40, height: 40, bgcolor: 'action.hover' }}
                        >
                            <GraduationCap size={20} className="text-slate-400" />
                        </Avatar>
                        <Typography variant="subtitle1" fontWeight={700} color="text.primary">
                            {course.title}
                        </Typography>
                    </Stack>
                    <IconButton size="small">
                        <MoreVertical size={18} className="text-slate-400" />
                    </IconButton>
                </Stack>
            </Box>

            <Box sx={{ px: 2, mb: 0.5 }}>
                <Tabs
                    value={tabValue}
                    onChange={handleTabChange}
                    sx={{
                        minHeight: 32,
                        '& .MuiTab-root': {
                            minHeight: 32,
                            textTransform: 'none',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            px: 1,
                            minWidth: 'auto',
                            mr: 2,
                            color: 'text.secondary'
                        },
                        '& .Mui-selected': { color: 'text.primary !important' },
                        '& .MuiTabs-indicator': { bgcolor: 'text.primary' }
                    }}
                >
                    <Tab label="Summary" />
                    <Tab label="Description" />
                </Tabs>
                <Divider />
            </Box>

            <CardContent sx={{ p: 2, flexGrow: 1 }}>
                {tabValue === 0 ? (
                    <Stack spacing={1.5}>
                        <Typography variant="caption" fontWeight={600} color="#ef4444" sx={{ mb: 0.5, display: 'block' }}>
                            {course.status}
                        </Typography>

                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={1} alignItems="center">
                                <FileText size={14} className="text-slate-400" />
                                <Typography fontSize="0.75rem" color="text.secondary">Assignment type</Typography>
                            </Stack>
                            <Typography fontSize="0.75rem" fontWeight={600} color="text.primary">{course.assignmentType}</Typography>
                        </Stack>

                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Layers size={14} className="text-slate-400" />
                                <Typography fontSize="0.75rem" color="text.secondary">Steps</Typography>
                            </Stack>
                            <Typography fontSize="0.75rem" fontWeight={600} color="text.primary">{course.steps}</Typography>
                        </Stack>

                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={1} alignItems="center">
                                <CheckCircle size={14} className="text-slate-400" />
                                <Typography fontSize="0.75rem" color="text.secondary">Assignments</Typography>
                            </Stack>
                            <Typography fontSize="0.75rem" fontWeight={600} color="text.primary">{course.assignments}</Typography>
                        </Stack>

                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={1} alignItems="center">
                                <BarChart3 size={14} className="text-slate-400" />
                                <Typography fontSize="0.75rem" color="text.secondary">Progress</Typography>
                            </Stack>
                            <Typography fontSize="0.75rem" fontWeight={600} color="text.primary">{course.progress}%</Typography>
                        </Stack>
                    </Stack>
                ) : (
                    <Typography fontSize="0.8rem" color="text.secondary">
                        {course.description}
                    </Typography>
                )}
            </CardContent>

            <Box sx={{ p: 2, pt: 0 }}>
                <Button
                    variant="contained"
                    fullWidth
                    sx={{
                        bgcolor: 'primary.main',
                        '&:hover': { bgcolor: 'primary.dark' },
                        textTransform: 'none',
                        fontWeight: 600,
                        borderRadius: 1.5,
                        py: 1
                    }}
                >
                    Continue
                </Button>
            </Box>
        </Card>
    );
};

const MyTrainingCourses = () => {
    const [courses, setCourses] = useState<TrainingCourse[]>([]);

    useEffect(() => {
        setCourses([]);
    }, []);

    const [searchQuery, setSearchQuery] = useState('');
    const [filterStatus, setFilterStatus] = useState('All');
    const [sortBy, setSortBy] = useState('Available first');

    const handleReset = () => {
        setSearchQuery('');
        setFilterStatus('All');
        setSortBy('Available first');
    };

    const filteredCourses = courses.filter(course => {
        if (filterStatus !== 'All' && course.status.replace(' ', '_').toLowerCase() !== filterStatus.toLowerCase()) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return course.title.toLowerCase().includes(q) || course.description.toLowerCase().includes(q);
        }
        return true;
    }).sort((a, b) => {
        if (sortBy === 'Available first') return 0; // Default order
        if (sortBy === 'A-Z') return a.title.localeCompare(b.title);
        if (sortBy === 'Z-A') return b.title.localeCompare(a.title);
        return 0;
    });

    return (
        <Box sx={{ pb: 4, px: { xs: 2, md: 4 } }}>
            <Breadcrumbs
                separator={<ChevronRight size={14} className="text-slate-400" />}
                sx={{ mb: 2, mt: 1 }}
            >
                <Link underline="hover" color="primary" href="#" sx={{ fontSize: '0.8rem', fontWeight: 500 }}>
                    My training courses
                </Link>
            </Breadcrumbs>

            <Box sx={{ mb: 3 }}>
                <Stack direction="row" spacing={1.5} alignItems="center">
                    <GraduationCap size={24} className="text-slate-700" />
                    <Typography variant="h5" fontWeight={700} color="text.primary">
                        My training courses
                    </Typography>
                </Stack>
                <Typography fontSize="0.875rem" color="text.secondary" sx={{ mt: 0.5, maxWidth: 600 }}>
                    View the list of all training courses assigned to you.
                </Typography>
            </Box>

            <Box sx={{ mb: 4 }}>
                <FilterBar
                    filterStatus={filterStatus}
                    onFilterStatusChange={setFilterStatus}
                    statusOptions={[
                        { value: 'All', label: `All (${courses.length})` },
                        { value: 'in_progress', label: `In progress (${courses.filter(c => c.status === 'In progress').length})` },
                        { value: 'completed', label: `Completed (${courses.filter(c => c.status === 'Completed').length})` },
                    ]}
                    sortBy={sortBy}
                    onSortByChange={setSortBy}
                    sortOptions={[
                        { value: 'Available first', label: 'Available first' },
                        { value: 'A-Z', label: 'A \u2192 Z' },
                        { value: 'Z-A', label: 'Z \u2192 A' },
                    ]}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    searchPlaceholder="Search by training course name"
                    onReset={handleReset}
                />
            </Box>

            <Box sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' },
                gap: 3
            }}>
                {filteredCourses.map(course => (
                    <TrainingCourseCard key={course.id} course={course} />
                ))}
            </Box>
        </Box>
    );
};

export default MyTrainingCourses;
