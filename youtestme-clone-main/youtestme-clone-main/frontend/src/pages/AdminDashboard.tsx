import { ReactElement, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box,
    Card,
    Typography,
    Grid,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    CircularProgress,
    Snackbar,
    Alert,
    IconButton,
    Tooltip,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    Chip,
    Divider,
    useTheme
} from '@mui/material';
import IconifyIcon from 'components/base/IconifyIcon';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';

interface AdminDashboardSummary {
    totals: {
        totalUsers: number;
        totalCandidates: number;
        totalAdmins: number;
        totalTests: number;
        activeTests: number;
        totalAttempts: number;
        attemptsLast7Days: number;
        alertsLast7Days: number;
    };
    timeseries: { date: string; attempts: number; alerts: number; }[];
    alertTypes: { type: string; count: number; }[];
    riskyTests: { testId: number; testName: string; alerts: number; attempts: number; }[];
    attemptOutcome: { status: string; count: number; }[];
    recentAlerts: {
        sessionId: number;
        testName: string;
        candidateName: string;
        candidateEmail?: string;
        alertCount: number;
        lastAlertAt: string;
        alerts: { id: number; type: string; time: string; severity: string }[];
        alertsSummary: { type: string; count: number }[];
        emotionsSummary: { emotion: string; count: number }[];
    }[];
}

const DashboardCard = ({ children, sx = {} }: { children: React.ReactNode; sx?: any }) => (
    <Card sx={{ bgcolor: 'background.paper', color: 'text.primary', borderRadius: 2, height: '100%', boxShadow: '0 4px 20px rgba(0,0,0,0.05)', border: 1, borderColor: 'divider', ...sx }}>
        {children}
    </Card>
);

const StatCard = ({ title, value, subtext, icon, color, bgcolor }: any) => (
    <DashboardCard sx={{ p: 2, transition: 'transform 0.2s', '&:hover': { transform: 'translateY(-2px)', boxShadow: '0 8px 24px rgba(0,0,0,0.1)' } }}>
        <Stack spacing={2}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                <Box sx={{ width: 48, height: 48, borderRadius: 3, bgcolor: bgcolor || `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color }}>
                    <IconifyIcon icon={icon} width={24} height={24} />
                </Box>
            </Stack>
            <Box>
                <Typography variant="h4" fontWeight={700} color="text.primary">
                    {value}
                </Typography>
                <Typography variant="body2" color="text.secondary" fontWeight={500}>
                    {title}
                </Typography>
                {subtext && (
                    <Typography variant="caption" color={color} sx={{ mt: 0.5, display: 'block', fontWeight: 600 }}>
                        {subtext}
                    </Typography>
                )}
            </Box>
        </Stack>
    </DashboardCard>
);

const AdminDashboard = (): ReactElement => {
    const navigate = useNavigate();
    const theme = useTheme();
    const [summary, setSummary] = useState<AdminDashboardSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedSession, setSelectedSession] = useState<AdminDashboardSummary['recentAlerts'][0] | null>(null);

    useEffect(() => {
        const fetchSummary = async () => {
            try {
                setLoading(true);
                const res = await fetch('/api/admin/dashboard-summary');
                if (!res.ok) {
                    throw new Error('Failed to fetch dashboard data');
                }
                const data = await res.json();
                setSummary(data);
            } catch (err) {
                console.error('Error fetching summary:', err);
                setError('Failed to load dashboard data. Please try again.');
            } finally {
                setLoading(false);
            }
        };
        fetchSummary();
    }, []);

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', bgcolor: 'background.default' }}>
                <CircularProgress sx={{ color: 'primary.main' }} />
            </Box>
        );
    }

    if (!summary) return <Box />;

    // --- Chart Options ---

    // 1. Line Chart: Attempts vs Alerts
    const attemptsVsAlertsOption = {
        tooltip: {
            trigger: 'axis',
            backgroundColor: theme.palette.background.paper,
            borderColor: theme.palette.divider,
            textStyle: { color: theme.palette.text.primary }
        },
        legend: {
            data: ['Attempts', 'Alerts'],
            textStyle: { color: theme.palette.text.secondary },
            bottom: 0
        },
        grid: { left: '3%', right: '4%', bottom: '10%', containLabel: true },
        xAxis: {
            type: 'category',
            boundaryGap: false,
            data: summary.timeseries.map(t => t.date),
            axisLine: { lineStyle: { color: theme.palette.divider } },
            axisLabel: { color: theme.palette.text.secondary }
        },
        yAxis: {
            type: 'value',
            splitLine: { lineStyle: { color: theme.palette.divider, type: 'dashed' } },
            axisLabel: { color: theme.palette.text.secondary }
        },
        series: [
            {
                name: 'Attempts',
                type: 'line',
                smooth: true,
                data: summary.timeseries.map(t => t.attempts),
                itemStyle: { color: theme.palette.info.main },
                areaStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: theme.palette.info.light },
                        { offset: 1, color: 'transparent' }
                    ])
                }
            },
            {
                name: 'Alerts',
                type: 'line',
                smooth: true,
                data: summary.timeseries.map(t => t.alerts),
                itemStyle: { color: theme.palette.error.main },
                lineStyle: { type: 'dashed' }
            }
        ]
    };

    // 2. Pie Chart: Alert Types
    const alertTypesOption = {
        tooltip: {
            trigger: 'item',
            backgroundColor: theme.palette.background.paper,
            borderColor: theme.palette.divider,
            textStyle: { color: theme.palette.text.primary },
            formatter: '{b}: {c} ({d}%)'
        },
        legend: {
            orient: 'vertical',
            left: 'left',
            textStyle: { color: theme.palette.text.secondary }
        },
        series: [
            {
                name: 'Alert Types',
                type: 'pie',
                radius: ['40%', '70%'],
                avoidLabelOverlap: false,
                itemStyle: {
                    borderRadius: 10,
                    borderColor: theme.palette.background.paper,
                    borderWidth: 2
                },
                label: { show: false, position: 'center' },
                emphasis: {
                    label: {
                        show: true,
                        fontSize: 20,
                        fontWeight: 'bold',
                        color: theme.palette.text.primary
                    }
                },
                labelLine: { show: false },
                data: summary.alertTypes.map(a => ({ value: a.count, name: a.type }))
            }
        ]
    };

    // 3. Bar Chart: Risky Tests
    const riskyTestsOption = {
        tooltip: {
            trigger: 'axis',
            backgroundColor: theme.palette.background.paper,
            borderColor: theme.palette.divider,
            textStyle: { color: theme.palette.text.primary },
            axisPointer: { type: 'shadow' }
        },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: {
            type: 'value',
            axisLine: { show: false },
            axisLabel: { color: theme.palette.text.secondary },
            splitLine: { lineStyle: { color: theme.palette.divider, type: 'dashed' } }
        },
        yAxis: {
            type: 'category',
            data: summary.riskyTests.map(t => t.testName),
            axisLine: { show: false },
            axisTick: { show: false },
            axisLabel: { color: theme.palette.text.secondary, width: 100, overflow: 'truncate' }
        },
        series: [
            {
                name: 'Alerts',
                type: 'bar',
                data: summary.riskyTests.map(t => t.alerts),
                itemStyle: { color: theme.palette.error.main, borderRadius: [0, 4, 4, 0] }
            }
        ]
    };

    // 4. Pie Chart: Outcomes
    const outcomesOption = {
        tooltip: {
            trigger: 'item',
            backgroundColor: theme.palette.background.paper,
            borderColor: theme.palette.divider,
            textStyle: { color: theme.palette.text.primary }
        },
        series: [
            {
                name: 'Outcome',
                type: 'pie',
                radius: '50%',
                data: summary.attemptOutcome.map(o => ({ value: o.count, name: o.status })),
                emphasis: {
                    itemStyle: {
                        shadowBlur: 10,
                        shadowOffsetX: 0,
                        shadowColor: 'rgba(0, 0, 0, 0.5)'
                    }
                }
            }
        ]
    };

    return (
        <Box sx={{ bgcolor: 'background.default', minHeight: '100%', p: 3, overflowY: 'auto' }}>
            <Box mb={4}>
                <Typography variant="h4" fontWeight={700} color="text.primary">Dashboard Overview</Typography>
                <Typography variant="body2" color="text.secondary">Real-time analytics & monitoring</Typography>
            </Box>

            {/* Top Metrics Grid */}
            <Grid container spacing={3} mb={4}>
                <Grid item xs={12} sm={6} md={4} lg={2}>
                    <StatCard
                        title="Total Users"
                        value={summary.totals.totalUsers}
                        subtext={`${summary.totals.totalCandidates} Candidates`}
                        icon="mdi:account-group"
                        color={theme.palette.info.main}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={4} lg={2}>
                    <StatCard
                        title="Total Tests"
                        value={summary.totals.totalTests}
                        subtext={`${summary.totals.activeTests} Active`}
                        icon="mdi:clipboard-text-outline"
                        color={theme.palette.secondary.main}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={4} lg={2}>
                    <StatCard
                        title="Attempts"
                        value={summary.totals.totalAttempts}
                        subtext={`+${summary.totals.attemptsLast7Days} this week`}
                        icon="mdi:chart-timeline-variant"
                        color={theme.palette.warning.main}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={4} lg={2}>
                    <StatCard
                        title="Alerts"
                        value={summary.totals.alertsLast7Days}
                        subtext="Last 7 days"
                        icon="mdi:alert-circle-outline"
                        color={theme.palette.error.main}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={4} lg={4}>
                    <DashboardCard sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'primary.main', color: 'primary.contrastText' }}>
                        <Box>
                            <Typography variant="h6" color="inherit" fontWeight="bold">Alert Rate</Typography>
                            <Typography variant="h3" color="inherit" fontWeight="bold">
                                {summary.totals.attemptsLast7Days > 0
                                    ? ((summary.totals.alertsLast7Days / summary.totals.attemptsLast7Days) * 100).toFixed(1)
                                    : 0}%
                            </Typography>
                            <Typography variant="body2" color="inherit" sx={{ opacity: 0.9 }}>Alerts per Attempt (7d)</Typography>
                        </Box>
                        <IconifyIcon icon="mdi:percent-outline" width={64} height={64} color="inherit" sx={{ opacity: 0.2 }} />
                    </DashboardCard>
                </Grid>
            </Grid>

            {/* Charts Section */}
            <Grid container spacing={3} mb={4}>
                {/* Main Line Chart */}
                <Grid item xs={12} lg={8}>
                    <DashboardCard sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={600} mb={2}>Attempts vs Alerts (30 Days)</Typography>
                        <ReactECharts option={attemptsVsAlertsOption} style={{ height: 350 }} />
                    </DashboardCard>
                </Grid>

                {/* Outcome Pie Chart */}
                <Grid item xs={12} lg={4}>
                    <DashboardCard sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={600} mb={2}>Attempt Outcomes</Typography>
                        <ReactECharts option={outcomesOption} style={{ height: 350 }} />
                    </DashboardCard>
                </Grid>

                {/* Alert Types Pie */}
                <Grid item xs={12} md={6}>
                    <DashboardCard sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={600} mb={2}>Alert Type Distribution</Typography>
                        <ReactECharts option={alertTypesOption} style={{ height: 300 }} />
                    </DashboardCard>
                </Grid>

                {/* Risky Tests Bar */}
                <Grid item xs={12} md={6}>
                    <DashboardCard sx={{ p: 3 }}>
                        <Typography variant="h6" fontWeight={600} mb={2}>Top Risky Tests</Typography>
                        <ReactECharts option={riskyTestsOption} style={{ height: 300 }} />
                    </DashboardCard>
                </Grid>
            </Grid>

            {/* Recent Alerts Table */}
            <DashboardCard sx={{ p: 3 }}>
                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                    <Typography variant="h6" fontWeight={600}>Recent Flagged Sessions</Typography>
                    <Tooltip title="View all activity">
                        <IconButton onClick={() => navigate('/admin/activity')} sx={{ color: 'text.secondary' }}>
                            <IconifyIcon icon="mdi:arrow-right" />
                        </IconButton>
                    </Tooltip>
                </Stack>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ color: 'text.secondary', borderBottom: 1, borderColor: 'divider' }}>Test Name</TableCell>
                                <TableCell sx={{ color: 'text.secondary', borderBottom: 1, borderColor: 'divider' }}>Candidate</TableCell>
                                <TableCell sx={{ color: 'text.secondary', borderBottom: 1, borderColor: 'divider' }}>Total Alerts</TableCell>
                                <TableCell sx={{ color: 'text.secondary', borderBottom: 1, borderColor: 'divider' }}>Last Alert</TableCell>
                                <TableCell sx={{ color: 'text.secondary', borderBottom: 1, borderColor: 'divider' }}>Action</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {summary.recentAlerts.map((session) => (
                                <TableRow
                                    key={session.sessionId}
                                    hover
                                    sx={{ '&:hover': { bgcolor: 'action.hover', cursor: 'pointer' } }}
                                    onClick={() => setSelectedSession(session)}
                                >
                                    <TableCell sx={{ color: 'text.primary', borderBottom: 1, borderColor: 'divider', fontWeight: 600 }}>
                                        {session.testName}
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.primary', borderBottom: 1, borderColor: 'divider' }}>
                                        <Typography variant="body2" fontWeight={600}>{session.candidateName}</Typography>
                                        {session.candidateEmail && (
                                            <Typography variant="caption" color="text.secondary" display="block">
                                                {session.candidateEmail}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell sx={{ color: 'error.main', borderBottom: 1, borderColor: 'divider', fontWeight: 600 }}>
                                        {session.alertCount}
                                    </TableCell>
                                    <TableCell sx={{ color: 'text.secondary', borderBottom: 1, borderColor: 'divider' }}>
                                        {new Date(session.lastAlertAt).toLocaleString()}
                                    </TableCell>
                                    <TableCell sx={{ borderBottom: 1, borderColor: 'divider' }}>
                                        <Button
                                            size="small"
                                            variant="outlined"
                                            color="error"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setSelectedSession(session);
                                            }}
                                        >
                                            View Details
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {summary.recentAlerts.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} align="center" sx={{ color: 'text.secondary', borderBottom: 'none', py: 4 }}>
                                        No recent alerts found.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </DashboardCard>

            {/* Alert Details Dialog */}
            <Dialog
                open={!!selectedSession}
                onClose={() => setSelectedSession(null)}
                maxWidth="md"
                fullWidth
                PaperProps={{
                    sx: {
                        bgcolor: 'background.paper',
                        color: 'text.primary',
                        border: 1,
                        borderColor: 'divider'
                    }
                }}
            >
                <DialogTitle sx={{ borderBottom: 1, borderColor: 'divider' }} component="div">
                    <Typography variant="h6" component="h2">Alert Details</Typography>
                    <Typography variant="body2" color="text.secondary" component="div">
                        {selectedSession?.testName} - {selectedSession?.candidateName}
                        {selectedSession?.candidateEmail && ` (${selectedSession.candidateEmail})`}
                    </Typography>
                </DialogTitle>
                <DialogContent sx={{ mt: 2 }}>
                    {/* Summary Section */}
                    <Grid container spacing={2} mb={3}>
                        <Grid item xs={12} md={6}>
                            <Typography variant="subtitle2" color="text.secondary" mb={1}>Alert Summary</Typography>
                            <Stack direction="row" flexWrap="wrap" gap={1}>
                                {selectedSession?.alertsSummary?.map((s) => (
                                    <Chip
                                        key={s.type}
                                        label={`${s.type}: ${s.count}`}
                                        size="small"
                                        color="error"
                                        variant="outlined"
                                    />
                                ))}
                                {(!selectedSession?.alertsSummary || selectedSession.alertsSummary.length === 0) && (
                                    <Typography variant="body2" color="text.secondary">No alerts recorded.</Typography>
                                )}
                            </Stack>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Typography variant="subtitle2" color="text.secondary" mb={1}>Emotion Summary</Typography>
                            <Stack direction="row" flexWrap="wrap" gap={1}>
                                {selectedSession?.emotionsSummary?.map((s) => (
                                    <Chip
                                        key={s.emotion}
                                        label={`${s.emotion}: ${s.count}`}
                                        size="small"
                                        color="primary"
                                        variant="outlined"
                                    />
                                ))}
                                {(!selectedSession?.emotionsSummary || selectedSession.emotionsSummary.length === 0) && (
                                    <Typography variant="body2" color="text.secondary">No emotion data.</Typography>
                                )}
                            </Stack>
                        </Grid>
                    </Grid>

                    <Divider sx={{ borderColor: 'divider', mb: 2 }} />

                    <Typography variant="subtitle2" color="text.secondary" mb={1}>Detailed Timeline</Typography>
                    <List>
                        {selectedSession?.alerts.map((alert) => (
                            <ListItem key={alert.id} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                                <ListItemIcon>
                                    <IconifyIcon icon="mdi:alert-circle" color="error.main" />
                                </ListItemIcon>
                                <ListItemText
                                    primary={
                                        <Typography variant="subtitle1" color="text.primary" component="span">
                                            {alert.type}
                                        </Typography>
                                    }
                                    secondary={
                                        <Typography variant="body2" color="text.secondary" component="span">
                                            {new Date(alert.time).toLocaleString()} - Severity: {alert.severity}
                                        </Typography>
                                    }
                                />
                            </ListItem>
                        ))}
                        {selectedSession?.alerts.length === 0 && (
                            <ListItem>
                                <ListItemText primary={<Typography color="text.secondary">No detailed alerts available.</Typography>} />
                            </ListItem>
                        )}
                    </List>
                </DialogContent>
                <DialogActions sx={{ borderTop: 1, borderColor: 'divider', p: 2 }}>
                    <Button onClick={() => setSelectedSession(null)} color="inherit">Close</Button>
                </DialogActions>
            </Dialog>

            <Snackbar open={!!error} autoHideDuration={6000} onClose={() => setError(null)}>
                <Alert onClose={() => setError(null)} severity="error" sx={{ width: '100%' }}>
                    {error}
                </Alert>
            </Snackbar>
        </Box>
    );
};

export default AdminDashboard;
