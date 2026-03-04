import {
    Box,
    Typography,
    Paper,
    Grid,
    List,
    ListItem,
    ListItemText,
    Link,
    Divider,
} from '@mui/material';
import PersonIcon from '@mui/icons-material/Person';
import DescriptionIcon from '@mui/icons-material/Description';
import PollIcon from '@mui/icons-material/Poll';
import PeopleIcon from '@mui/icons-material/People';
import CardMembershipIcon from '@mui/icons-material/CardMembership';
import SchoolIcon from '@mui/icons-material/School';
import HelpIcon from '@mui/icons-material/Help';
import AssessmentIcon from '@mui/icons-material/Assessment';

const ReportCard = ({ title, count, icon: Icon, items }: any) => (
    <Paper variant="outlined" sx={{ height: '100%', borderRadius: 2 }}>
        <Box p={2}>
            <Box display="flex" alignItems="center" gap={1.5} mb={1}>
                <Box sx={{ bgcolor: '#f8fafc', p: 1, borderRadius: 2, display: 'flex' }}>
                    <Icon sx={{ color: '#64748b' }} />
                </Box>
                <Typography variant="subtitle1" fontWeight="bold" color="primary">
                    {title} ({count})
                </Typography>
            </Box>
            <Divider />
            <List dense disablePadding sx={{ mt: 1 }}>
                {items.map((item: any, idx: number) => (
                    <ListItem
                        key={idx}
                        sx={{
                            px: 0,
                            py: 0.5,
                            borderBottom: idx === items.length - 1 ? 'none' : '1px solid #f1f5f9'
                        }}
                    >
                        <ListItemText
                            primary={
                                <Box display="flex" justifyContent="space-between">
                                    <Typography variant="body2" color="text.secondary">{item.label}</Typography>
                                    <Typography variant="body2" fontWeight="medium">{item.value}</Typography>
                                </Box>
                            }
                        />
                    </ListItem>
                ))}
            </List>
        </Box>
    </Paper>
);

const PredefinedReports = () => {
    const reportGroups = [
        {
            title: 'User reports',
            count: 15,
            icon: PersonIcon,
            items: [
                { label: 'Administrators', value: 2 },
                { label: 'Instructors', value: 1 },
                { label: 'Students', value: 46 },
                { label: 'Others', value: 1 },
            ]
        },
        {
            title: 'Test reports',
            count: 17,
            icon: DescriptionIcon,
            items: [
                { label: 'Number of published tests', value: 1 },
                { label: 'Number of suspended tests', value: 1 },
                { label: 'Number of draft tests', value: 3 },
            ]
        },
        {
            title: 'Survey reports',
            count: 7,
            icon: PollIcon,
            items: [
                { label: 'Number of published surveys', value: 1 },
                { label: 'Number of suspended surveys', value: 0 },
                { label: 'Number of draft surveys', value: 0 },
            ]
        },
        {
            title: 'User group reports',
            count: 15,
            icon: PeopleIcon,
            items: [
                { label: 'Number of groups', value: 14 },
            ]
        },
        {
            title: 'Certificate reports',
            count: 4,
            icon: CardMembershipIcon,
            items: [
                { label: 'Number of certificates', value: 3 },
                { label: 'Number of achieved certificates', value: 0 },
            ]
        },
        {
            title: 'Training course reports',
            count: 3,
            icon: SchoolIcon,
            items: [
                { label: 'Number of training courses', value: 2 },
                { label: 'Number of managers', value: 2 },
                { label: 'Number of candidates', value: 11 },
            ]
        },
        {
            title: 'Question reports',
            count: 16,
            icon: HelpIcon,
            items: [
                { label: 'Number of questions', value: 378 },
                { label: 'Number of survey question pools', value: 5 },
            ]
        },
        {
            title: 'Usage reports',
            count: 11,
            icon: AssessmentIcon,
            items: [
                { label: 'Number of registered users', value: 50 },
                { label: 'Number of active users', value: 1 },
            ]
        }
    ];

    return (
        <Box p={3}>
            {/* Header */}
            <Box mb={3}>
                <Typography variant="body2" color="primary" gutterBottom sx={{ fontSize: '0.75rem', fontWeight: 'bold' }}>
                    Predefined reports
                </Typography>
                <Typography variant="h5" fontWeight="bold">Predefined reports</Typography>
                <Typography variant="body2" color="text.secondary">
                    Reports for various categories. <Link href="#">Read more</Link>
                </Typography>
            </Box>

            {/* Grid */}
            <Grid container spacing={3}>
                {reportGroups.map((group, index) => (
                    <Grid item xs={12} sm={6} md={4} key={index}>
                        <ReportCard {...group} />
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
};

export default PredefinedReports;
