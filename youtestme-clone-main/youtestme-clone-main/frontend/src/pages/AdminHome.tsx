import { ReactElement, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Card,
    Typography,
    Button,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    Stack,
    Grid,
    Link,
    IconButton,
} from '@mui/material';
import { useAuth } from '../hooks/useAuth'; // Adjusted path
import IconifyIcon from '../components/base/IconifyIcon'; // Adjusted path

interface ActivityItem {
    id: string;
    message: string;
    timestamp: string;
}

interface ExamItem {
    id: string;
    title: string;
    date: string;
    candidates: number;
}

const AdminHome = (): ReactElement => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
    const [upcomingExams, setUpcomingExams] = useState<ExamItem[]>([]);

    const name = user?.name || 'Administrator';
    const role = user?.role || 'Administrator';

    useEffect(() => {
        const fetchData = async () => {
            try {
                const activityRes = await fetch('/api/admin/activity');
                if (activityRes.ok) {
                    const data = await activityRes.json();
                    setRecentActivity(data);
                }

                const examsRes = await fetch('/api/admin/upcoming-exams');
                if (examsRes.ok) {
                    const data = await examsRes.json();
                    setUpcomingExams(data);
                }
            } catch (err) {
                console.error('Failed to fetch admin home data', err);
            }
        };
        fetchData();
    }, []);

    return (
        <Box sx={{
            minHeight: '100vh',
            width: '100%',
            bgcolor: 'background.default',
            p: 0,
            position: 'relative',
        }}>

            {/* Content Wrapper */}
            <Box sx={{ position: 'relative', zIndex: 1, p: 3 }}>

                {/* Info Strip */}
                <Typography variant="body2" sx={{ color: 'text.secondary', mb: 3, fontSize: '0.85rem' }}>
                    This page displays role-specific widgets for quick access to frequently used functions. Administrators set default widgets on the Role Configuration page, while users can customize the layout to their preferences. <Link href="#" sx={{ color: 'primary.main', textDecoration: 'underline' }}>Reorder widgets</Link>
                </Typography>

                <Grid container spacing={3}>

                    {/* Welcome Message Widget */}
                    <Grid item xs={12} md={6}>
                        <Card sx={{
                            bgcolor: 'background.paper',
                            color: 'text.primary',
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column'
                        }}>
                            {/* Header */}
                            <Box sx={{
                                p: 1.5,
                                borderBottom: '1px solid',
                                borderColor: 'divider',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                bgcolor: 'action.hover'
                            }}>
                                <IconifyIcon icon="mdi:message-outline" width={20} />
                                <Typography variant="subtitle1" fontWeight={600}>Welcome message</Typography>
                            </Box>

                            {/* Body */}
                            <Box sx={{ p: 3, flex: 1 }}>
                                <Typography variant="h5" fontWeight={700} gutterBottom>
                                    Welcome {name},
                                </Typography>
                                <Typography variant="h6" fontWeight={700} gutterBottom>
                                    Your role is {role}.
                                </Typography>
                                <Typography variant="body1" sx={{ mt: 2, color: 'text.secondary' }}>
                                    To make the most out of your free trial, we recommend starting with our <Link href="#" sx={{ color: 'primary.main', textDecoration: 'none', fontWeight: 600, bgcolor: 'primary.lighter', px: 0.5 }}>3-Minute Tutorial video.</Link>
                                </Typography>
                            </Box>
                        </Card>

                        {/* Quick Actions Widget */}
                        <Card sx={{
                            mt: 3,
                            bgcolor: 'background.paper',
                            color: 'text.primary',
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                        }}>
                            <Box sx={{
                                p: 1.5,
                                borderBottom: '1px solid',
                                borderColor: 'divider',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1,
                                bgcolor: 'action.hover'
                            }}>
                                <IconifyIcon icon="mdi:lightning-bolt-outline" width={20} />
                                <Typography variant="subtitle1" fontWeight={600}>Quick Actions</Typography>
                            </Box>
                            <Box sx={{ p: 2 }}>
                                <Grid container spacing={2}>
                                    {[
                                        { label: 'New Test', icon: 'mdi:file-plus-outline', color: '#4fc3f7', path: '/admin/new-test' },
                                        { label: 'New User', icon: 'mdi:account-plus-outline', color: '#81c784', path: '/admin/user-profiles' },
                                        { label: 'Add Question', icon: 'mdi:comment-question-outline', color: '#ffb74d', path: '/admin/question-pools' },
                                        { label: 'View Reports', icon: 'mdi:chart-bar', color: '#ba68c8', path: '/admin/predefined-reports' },
                                    ].map((action) => (
                                        <Grid item xs={6} sm={3} key={action.label}>
                                            <Button
                                                fullWidth
                                                variant="outlined"
                                                onClick={() => navigate(action.path)}
                                                sx={{
                                                    flexDirection: 'column',
                                                    py: 2,
                                                    borderColor: 'divider',
                                                    color: 'text.primary',
                                                    bgcolor: 'transparent',
                                                    '&:hover': { bgcolor: 'action.hover', borderColor: action.color }
                                                }}
                                            >
                                                <IconifyIcon icon={action.icon} width={28} height={28} color={action.color} />
                                                <Typography variant="caption" sx={{ mt: 1 }}>{action.label}</Typography>
                                            </Button>
                                        </Grid>
                                    ))}
                                </Grid>
                            </Box>
                        </Card>
                    </Grid>

                    {/* Right Column */}
                    <Grid item xs={12} md={6}>
                        {/* Upcoming Exams Widget */}
                        <Card sx={{
                            mb: 3,
                            bgcolor: 'background.paper',
                            color: 'text.primary',
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                        }}>
                            <Box sx={{
                                p: 1.5,
                                borderBottom: '1px solid',
                                borderColor: 'divider',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                bgcolor: 'action.hover'
                            }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <IconifyIcon icon="mdi:calendar-clock" width={20} />
                                    <Typography variant="subtitle1" fontWeight={600}>Upcoming Exams</Typography>
                                </Box>
                                <Button size="small" sx={{ color: 'primary.main' }}>View All</Button>
                            </Box>
                            <Box sx={{ p: 0 }}>
                                {upcomingExams.map((exam, index) => (
                                    <Box key={exam.id} sx={{
                                        p: 2,
                                        borderBottom: index !== upcomingExams.length - 1 ? '1px solid' : 'none',
                                        borderColor: 'divider',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        '&:hover': { bgcolor: 'action.hover' }
                                    }}>
                                        <Box>
                                            <Typography variant="subtitle2" fontWeight={600} sx={{ color: 'text.primary' }}>
                                                {exam.title}
                                            </Typography>
                                            <Box sx={{ display: 'flex', gap: 2, mt: 0.5 }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                                                    <IconifyIcon icon="mdi:calendar-blank" width={14} />
                                                    <Typography variant="caption">{new Date(exam.date).toLocaleDateString()}</Typography>
                                                </Box>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary' }}>
                                                    <IconifyIcon icon="mdi:clock-outline" width={14} />
                                                    <Typography variant="caption">{new Date(exam.date).toLocaleTimeString()}</Typography>
                                                </Box>
                                            </Box>
                                        </Box>
                                        <Box sx={{ textAlign: 'right' }}>
                                            <Typography variant="h6" sx={{ color: 'primary.main' }}>{exam.candidates}</Typography>
                                            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Candidates</Typography>
                                        </Box>
                                    </Box>
                                ))}
                            </Box>
                        </Card>

                        {/* Recent Activity Widget */}
                        <Card sx={{
                            bgcolor: 'background.paper',
                            color: 'text.primary',
                            borderRadius: 2,
                            border: '1px solid',
                            borderColor: 'divider',
                            overflow: 'hidden'
                        }}>
                            {/* Header */}
                            <Box sx={{
                                p: 1.5,
                                borderBottom: '1px solid',
                                borderColor: 'divider',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                bgcolor: 'action.hover'
                            }}>
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <IconifyIcon icon="mdi:file-document-outline" width={20} />
                                    <Typography variant="subtitle1" fontWeight={600}>My recent activity</Typography>
                                    <Box sx={{
                                        bgcolor: 'primary.main',
                                        color: '#fff',
                                        fontSize: '0.7rem',
                                        fontWeight: 700,
                                        px: 0.8,
                                        borderRadius: 0.5
                                    }}>
                                        31
                                    </Box>
                                </Stack>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    sx={{
                                        color: 'text.primary',
                                        borderColor: 'divider',
                                        textTransform: 'none',
                                        borderRadius: 4,
                                        height: 24,
                                        fontSize: '0.75rem'
                                    }}
                                >
                                    View all activity
                                </Button>
                            </Box>

                            {/* List */}
                            <List sx={{ p: 0 }}>
                                {recentActivity.map((item, index) => (
                                    <ListItem
                                        key={item.id}
                                        sx={{
                                            borderBottom: '1px solid',
                                            borderColor: 'divider',
                                            py: 1.5,
                                            '&:hover': { bgcolor: 'action.hover' }
                                        }}
                                    >
                                        <ListItemIcon sx={{ minWidth: 40 }}>
                                            <IconifyIcon icon="mdi:arrow-right-circle-outline" color="action.active" width={24} />
                                        </ListItemIcon>
                                        <ListItemText
                                            primary={
                                                <Typography variant="body2" color="text.primary" fontWeight={500}>
                                                    {item.message}
                                                </Typography>
                                            }
                                            secondary={
                                                <Typography variant="caption" color="text.secondary">
                                                    {new Date(item.timestamp).toLocaleString()}
                                                </Typography>
                                            }
                                        />
                                        {index > 1 && (
                                            <IconifyIcon icon="mdi:chevron-right" color="action.disabled" width={20} />
                                        )}
                                    </ListItem>
                                ))}
                            </List>

                            {/* Footer / Pagination */}
                            <Box sx={{
                                p: 1.5,
                                bgcolor: 'action.hover',
                                display: 'flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                gap: 1
                            }}>
                                <IconButton size="small" sx={{ color: 'action.active', p: 0.5 }}><IconifyIcon icon="mdi:chevron-double-left" width={18} /></IconButton>
                                <IconButton size="small" sx={{ color: 'action.active', p: 0.5 }}><IconifyIcon icon="mdi:chevron-left" width={18} /></IconButton>
                                <Box sx={{
                                    width: 24, height: 24,
                                    bgcolor: 'text.secondary',
                                    color: 'background.paper',
                                    borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.75rem', fontWeight: 700
                                }}>1</Box>
                                <Box sx={{
                                    width: 24, height: 24,
                                    color: 'text.secondary',
                                    borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.75rem', fontWeight: 700,
                                    border: '1px solid',
                                    borderColor: 'divider'
                                }}>2</Box>
                                <Box sx={{
                                    width: 24, height: 24,
                                    color: 'text.secondary',
                                    borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.75rem', fontWeight: 700,
                                    border: '1px solid',
                                    borderColor: 'divider'
                                }}>3</Box>
                                <IconButton size="small" sx={{ color: 'action.active', p: 0.5 }}><IconifyIcon icon="mdi:chevron-right" width={18} /></IconButton>
                                <IconButton size="small" sx={{ color: 'action.active', p: 0.5 }}><IconifyIcon icon="mdi:chevron-double-right" width={18} /></IconButton>
                            </Box>
                        </Card>
                    </Grid>
                </Grid>
            </Box>
        </Box>
    );
};

export default AdminHome;
