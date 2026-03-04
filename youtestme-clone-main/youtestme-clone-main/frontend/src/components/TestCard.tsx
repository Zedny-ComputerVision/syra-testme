import { useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
    Box,
    Typography,
    Button,
    IconButton,
    Stack,
    Tabs,
    Tab,
    Avatar,
    Divider
} from '@mui/material';
import {
    MoreVertical,
    Monitor,
    User,
    CheckCircle,
    FileText,
    Clock
} from 'lucide-react';

interface TestCardProps {
    id: number;
    title: string;
    description: string;
    status: 'available' | 'completed' | 'upcoming' | 'suspended';
    image: string;
    duration?: number;
    deadline?: string;
    questionCount?: number;
    onStart: (id: number) => void;
}

const TestCard = ({ id, title, description, status, image, duration, deadline, questionCount, onStart }: TestCardProps) => {
    const [tabValue, setTabValue] = useState(0);

    const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
        setTabValue(newValue);
    };

    return (
        <Box
            sx={{
                bgcolor: 'white',
                borderRadius: 2,
                overflow: 'hidden',
                border: '1px solid',
                borderColor: '#e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                height: '100%',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}
        >
            {/* Header */}
            <Box sx={{ p: 2, pb: 1 }}>
                <Stack direction="row" alignItems="center" spacing={2} justifyContent="space-between">
                    <Stack direction="row" alignItems="center" spacing={1.5}>
                        <Avatar
                            src={image}
                            variant="rounded"
                            sx={{ width: 40, height: 40, bgcolor: '#f1f5f9' }}
                        >
                            <FileText size={20} className="text-slate-400" />
                        </Avatar>
                        <Typography variant="subtitle1" fontWeight={700} color="#1e293b">
                            {title}
                        </Typography>
                    </Stack>
                    <IconButton size="small">
                        <MoreVertical size={18} className="text-slate-400" />
                    </IconButton>
                </Stack>
            </Box>

            {/* Status Area */}
            <Box sx={{ px: 2, mb: 1 }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography variant="caption" fontWeight={600} color="#ef4444">
                        Paused
                    </Typography>
                    <Monitor size={16} className="text-slate-400" />
                </Stack>
            </Box>

            {/* Tabs */}
            <Box sx={{ px: 2 }}>
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
                            color: '#64748b'
                        },
                        '& .Mui-selected': { color: '#1e293b !important' },
                        '& .MuiTabs-indicator': { bgcolor: '#1e293b' }
                    }}
                >
                    <Tab label="Summary" />
                    <Tab label="Description" />
                </Tabs>
                <Divider />
            </Box>

            {/* Content Area */}
            <Box sx={{ p: 2, flexGrow: 1 }}>
                {tabValue === 0 ? (
                    <Stack spacing={1.5}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={1} alignItems="center">
                                <User size={14} className="text-slate-400" />
                                <Typography fontSize="0.75rem" color="#64748b">User group</Typography>
                            </Stack>
                            <Typography fontSize="0.75rem" fontWeight={600} color="#1e293b">Proctoring user group</Typography>
                        </Stack>

                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={1} alignItems="center">
                                <CheckCircle size={14} className="text-slate-400" />
                                <Typography fontSize="0.75rem" color="#64748b">Result validity</Typography>
                            </Stack>
                            <Typography fontSize="0.75rem" fontWeight={600} color="#1e293b">Unlimited</Typography>
                        </Stack>

                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={1} alignItems="center">
                                <FileText size={14} className="text-slate-400" />
                                <Typography fontSize="0.75rem" color="#64748b">Certificate name</Typography>
                            </Stack>
                            <Typography fontSize="0.75rem" fontWeight={600} color="#1e293b" align="right">
                                شهادة مهنية في السلامة والصحة في بيئة العمل
                            </Typography>
                        </Stack>

                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={1} alignItems="center">
                                <Clock size={14} className="text-slate-400" />
                                <Typography fontSize="0.75rem" color="#64748b">Started at</Typography>
                            </Stack>
                            <Typography fontSize="0.75rem" fontWeight={600} color="#1e293b">
                                {deadline ? new Date(deadline).toLocaleString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) + ' EET' : 'Dec-01-2025 03:42 PM EET'}
                            </Typography>
                        </Stack>
                    </Stack>
                ) : (
                    <Typography fontSize="0.8rem" color="#64748b">
                        {description || "No description available for this test."}
                    </Typography>
                )}
            </Box>

            {/* Footer Action */}
            <Box sx={{ p: 2, pt: 0 }}>
                <Button
                    variant="contained"
                    fullWidth
                    onClick={() => onStart(id)}
                    sx={{
                        bgcolor: '#0f172a',
                        '&:hover': { bgcolor: '#1e293b' },
                        textTransform: 'none',
                        fontWeight: 600,
                        borderRadius: 1.5,
                        py: 1
                    }}
                >
                    Continue
                </Button>
            </Box>
        </Box>
    );
};

export default TestCard;
