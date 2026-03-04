import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Paper, Grid, TextField, Button, Avatar, IconButton,
    Divider, FormControlLabel, Checkbox, FormControl, InputLabel, Select, MenuItem,
    Tabs, Tab, Breadcrumbs, Link, Chip, Dialog, DialogTitle, DialogContent,
    DialogActions, Stack, Switch, RadioGroup, Radio, InputAdornment, List,
    ListItemButton, ListItemText, TableContainer, Table, TableHead, TableRow,
    TableCell, TableBody, Pagination, ToggleButtonGroup, ToggleButton, Alert,
    ListItemAvatar, Card, CardContent, CardActions
} from '@mui/material';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import IconifyIcon from '../../components/base/IconifyIcon'; // Adjusted path
import ReactECharts from 'echarts-for-react'; // Ensure this is installed
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

// Mock RichTextEditor if not available, or use the one from project
// Assuming a simple wrapper for now if the component exists, otherwise inline
const RichTextEditor = ({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) => (
    <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle2" gutterBottom>{label}</Typography>
        <ReactQuill theme="snow" value={value} onChange={onChange} style={{ height: 150, marginBottom: 50 }} />
    </Box>
);

const SaveButton = () => (
    <Box mt={4} display="flex" justifyContent="flex-end" gap={2}>
        <Button variant="outlined">Cancel</Button>
        <Button variant="contained" color="primary">Save changes</Button>
    </Box>
);

const SETTINGS_MENU = [
    { id: 'basic-information', label: 'Basic information', icon: 'mdi:information-outline' },
    { id: 'test-instructions-dialog-settings', label: 'Test instructions', icon: 'mdi:file-document-outline' },
    { id: 'duration-and-layout', label: 'Duration and layout', icon: 'mdi:clock-outline' },
    { id: 'pause-retake-reschedule', label: 'Pause, retake & reschedule', icon: 'mdi:pause-circle-outline' },
    { id: 'security-settings', label: 'Security settings', icon: 'mdi:shield-outline' },
    { id: 'result-validity-settings', label: 'Result validity', icon: 'mdi:calendar-check-outline' },
    { id: 'grading-configuration', label: 'Grading', icon: 'mdi:school-outline' },
    { id: 'certificates', label: 'Certificates', icon: 'mdi:certificate-outline' },
    { id: 'personal-report-settings', label: 'Personal report', icon: 'mdi:file-chart-outline' },
    { id: 'score-report-settings', label: 'Score report', icon: 'mdi:chart-bar' },
    { id: 'coupons', label: 'Coupons', icon: 'mdi:ticket-percent-outline' },
    { id: 'language-settings', label: 'Language', icon: 'mdi:translate' },
    { id: 'attachments', label: 'Attachments', icon: 'mdi:paperclip' },
    { id: 'external-attributes', label: 'External attributes', icon: 'mdi:link-variant' },
    { id: 'test-categories', label: 'Categories', icon: 'mdi:tag-outline' },
];

const TOP_tabs = [
    'Settings',
    'Test sections',
    'Testing sessions',
    'Candidates',
    'Proctoring',
    'Test administration',
    'Rescheduling requests',
    'Reports'
];

interface TestData {
    // Basic Info
    name: string;
    description: string;
    code: string;
    status: string; // 'published' | 'draft' | 'archived'
    created_at: string;
    updated_at: string;
    updated_by: string;
    workspace: string;
    image: string | null;

    // Instructions
    requireAck: boolean;
    showInstructions: boolean;
    showDuration: boolean;
    showPassingMark: boolean;
    showQuestionCount: boolean;
    showRetakes: boolean;
    instructionsProp: string;
    completionMessage: string;

    // Duration & Layout
    durationType: string;
    pageFormat: string;
    calculatorType: string;
    hideMetadata: boolean;
    hideFinishButton: boolean;
    enforceSectionOrder: boolean;
    randomizeQuestions: boolean;
    randomizeAnswers: boolean;
    showProgressBar: boolean;
    timeLimitPerQuestion: number;

    // Pause/Retake
    allowContinuation: boolean;
    continuationDuration: number;
    continuationUnit: string;
    allowRetaking: boolean;
    unlimitedRetakes: boolean;
    retakeCount: number;
    scoringMethod: string;
    retakeDelay: number;
    retakeDelayUnit: string;
    enableFreeReschedules: boolean;
    rescheduleCount: number;

    // Security
    browserLockdown: boolean;
    proctoring: boolean;
    autoLogout: boolean;
    requireUpdateProfile: boolean;
    networkAccess: string;
    allowedIps: string;
    requireAccessCode: boolean;
    accessCode: string;

    // Result Validity
    setValidityPeriod: boolean;
    validityDuration: number;
    validityUnit: string;

    // Grading
    passMarkType: string;
    passMark: number;
    passMarkInclusive: boolean;
    requirePositiveProctoring: boolean;
    showAdvancedGrading: boolean;
    gradingScale: string;
    penaltyType: string;
    penaltyValue: number;

    // Reports (Personal)
    showReport: string;
    reportReleaseDelay: number;
    reportReleaseDelayUnit: string;
    reportAccessDuration: boolean;
    reportContent: string;
    DisplayScore: boolean;
    DisplaySubScores: boolean;
    DisplaySectionScores: boolean;
    DisplayPassPercentage: boolean;
    DisplayEmployeeId: boolean;
    DisplaySummaryScore: boolean;
    DisplayScoreDescription: boolean;
    ShowPassedFailed: boolean;
    DisplayScorePerQuestion: boolean;
    DisplayCandidateNotes: boolean;
    DisplayNotes: boolean;
    DisplayRequiredScore: boolean;
    DisplayUserGroups: boolean;
    ShowTimestamps: boolean;
    ShowRoundedScores: boolean;
    EnableKnowledgeDeficiencyReport: boolean;
    EnableDeficiencyDownload: boolean;
    ExportExcel: boolean;
    ExportPDF: boolean;
    EnableScoreDownload: boolean;

    // Score Report
    scoreReportTemplate: string;
    scoreReportAudit: boolean;
    scoreReportColumns: string[];
    scoreReportExplanation: string;

    // Language
    languagePreference: string;
    labelLanguage: string;
    exportLanguageMapping: boolean;

    // External
    externalId: string;
    externalAttributes: { key: string; value: string }[];

    // Categories
    // Categories
    selectedCategories: string[];
    category: string;
}

const EditTest = () => {
    const { testId, section } = useParams();
    const navigate = useNavigate();
    const location = useLocation();

    // Determine active tab/section
    // If URL is /admin/test-management/123/test-sections, activeTopTab is 1
    // If URL is /admin/test-management/123/basic-information, activeTopTab is 0
    const getActiveTopTab = () => {
        const path = location.pathname;
        if (path.includes('/test-sections')) return 1;
        if (path.includes('/testing-sessions')) return 2;
        if (path.includes('/candidates')) return 3;
        if (path.includes('/proctoring')) return 4;
        if (path.includes('/test-administration')) return 5;
        if (path.includes('/rescheduling-requests')) return 6;
        if (path.includes('/reports')) return 7;
        return 0; // Default to Settings
    };

    const [activeTopTab, setActiveTopTab] = useState(getActiveTopTab());
    const activeSection = section || 'basic-information';

    const [testData, setTestData] = useState<TestData>({
        name: 'Math 101 Final Exam',
        description: 'Final examination for Mathematics 101 course covering algebra and geometry.',
        code: 'MATH101',
        status: 'published',
        created_at: '2025-12-01T10:00:00',
        updated_at: '2025-12-15T14:30:00',
        updated_by: 'Admin User',
        workspace: 'Engineering Dept',
        image: null,
        requireAck: true,
        showInstructions: true,
        showDuration: true,
        showPassingMark: true,
        showQuestionCount: true,
        showRetakes: false,
        instructionsProp: '<p>Please answer all questions carefully.</p>',
        completionMessage: '<p>Thank you for completing the test.</p>',
        durationType: 'test',
        pageFormat: 'one_page',
        calculatorType: 'none',
        hideMetadata: false,
        hideFinishButton: false,
        enforceSectionOrder: false,
        randomizeQuestions: false,
        randomizeAnswers: true,
        showProgressBar: true,
        timeLimitPerQuestion: 0,
        allowContinuation: true,
        continuationDuration: 24,
        continuationUnit: 'hours',
        allowRetaking: true,
        unlimitedRetakes: false,
        retakeCount: 2,
        scoringMethod: 'highest',
        retakeDelay: 0,
        retakeDelayUnit: 'minutes',
        enableFreeReschedules: false,
        rescheduleCount: 0,
        browserLockdown: false,
        proctoring: false,
        autoLogout: true,
        requireUpdateProfile: false,
        networkAccess: 'all',
        allowedIps: '',
        requireAccessCode: false,
        accessCode: '',
        setValidityPeriod: false,
        validityDuration: 12,
        validityUnit: 'months',
        passMarkType: 'percentage',
        passMark: 70,
        passMarkInclusive: true,
        requirePositiveProctoring: false,
        showAdvancedGrading: false,
        gradingScale: 'none',
        penaltyType: 'none',
        penaltyValue: 0,
        showReport: 'immediate',
        reportReleaseDelay: 0,
        reportReleaseDelayUnit: 'hours',
        reportAccessDuration: false,
        reportContent: 'score_only',
        DisplayScore: true,
        DisplaySubScores: false,
        DisplaySectionScores: false,
        DisplayPassPercentage: true,
        DisplayEmployeeId: false,
        DisplaySummaryScore: true,
        DisplayScoreDescription: false,
        ShowPassedFailed: true,
        DisplayScorePerQuestion: false,
        DisplayCandidateNotes: false,
        DisplayNotes: false,
        DisplayRequiredScore: true,
        DisplayUserGroups: false,
        ShowTimestamps: false,
        ShowRoundedScores: false,
        EnableKnowledgeDeficiencyReport: false,
        EnableDeficiencyDownload: false,
        ExportExcel: true,
        ExportPDF: true,
        EnableScoreDownload: true,
        scoreReportTemplate: 'default',
        scoreReportAudit: false,
        scoreReportColumns: ['score', 'status', 'duration'],
        scoreReportExplanation: '',
        languagePreference: 'english',
        labelLanguage: 'english',
        exportLanguageMapping: false,
        externalId: '',
        externalAttributes: [],
        selectedCategories: [],
        category: ''
    });

    // Mock states for other features
    const [couponDialogOpen, setCouponDialogOpen] = useState(false);
    const [newCoupon, setNewCoupon] = useState({ code: '', discountType: 'percentage', value: 0, expiryDate: '', usageLimit: 0, sessionPriceOnly: false });
    const [coupons, setCoupons] = useState<any[]>([]);

    const [translationDialogOpen, setTranslationDialogOpen] = useState(false);
    const [newTranslation, setNewTranslation] = useState({ language: '' });
    const [questionTranslations, setQuestionTranslations] = useState<any[]>([]);

    const [attachmentDialogOpen, setAttachmentDialogOpen] = useState(false);
    const [newAttachment, setNewAttachment] = useState({ name: '', access: 'candidate', download: true });
    const [attachments, setAttachments] = useState<any[]>([]);

    const [newExternal, setNewExternal] = useState({ key: '', value: '' });

    // Admin Tab State
    const [testAdminTab, setTestAdminTab] = useState('managers');
    const [managersView, setManagersView] = useState('grid');
    const [managersList] = useState([
        // Mock data
        { id: 1, username: 'jdoe', firstName: 'John', lastName: 'Doe', email: 'jdoe@example.com', avatar: null }
    ]);
    const [gradersList] = useState([]);
    const [newComment, setNewComment] = useState('');
    const [comments] = useState([{ id: 1, user: { username: 'admin' }, createdAt: new Date().toISOString(), content: 'Initial test setup completed.' }]);

    // Proctoring view
    const [proctoringView, setProctoringView] = useState('monitoring');

    // Stats for reports (mock)
    const [reportStats] = useState({
        total: 15,
        passed: 10,
        failed: 5,
        avgScore: 78.5,
        highScore: 95,
        medianScore: 80,
        lowScore: 45,
        stdDev: 12.3,
        distribution: [0, 0, 1, 2, 3, 5, 2, 1, 1, 0],
        sessionStats: []
    });

    // Handlers
    const handleAddCoupon = () => {
        setCoupons([...coupons, { ...newCoupon, status: 'active' }]);
        setCouponDialogOpen(false);
        setNewCoupon({ code: '', discountType: 'percentage', value: 0, expiryDate: '', usageLimit: 0, sessionPriceOnly: false });
    };

    const handleAddTranslation = () => {
        setQuestionTranslations([...questionTranslations, { ...newTranslation, status: 'in_progress' }]);
        setTranslationDialogOpen(false);
        setNewTranslation({ language: '' });
    };

    const handleAddAttachment = () => {
        setAttachments([...attachments, { ...newAttachment }]);
        setAttachmentDialogOpen(false);
        setNewAttachment({ name: '', access: 'candidate', download: true });
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        // Mock upload
        if (e.target.files && e.target.files[0]) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setTestData({ ...testData, image: ev.target?.result as string });
            };
            reader.readAsDataURL(e.target.files[0]);
        }
    };

    // Add logic for adding comments, assign users, etc.
    const handleAddComment = () => {
        // Logic to add comment
        console.log('Adding comment:', newComment);
        setNewComment('');
    };

    const handleAssignClick = (type: string) => {
        console.log(`Assigning ${type}`);
    };

    const handleRemoveUser = (id: number, type: string) => {
        console.log(`Removing user ${id} from ${type}`);
    };


    const handleTopTabChange = (event: React.SyntheticEvent, newValue: number) => {
        setActiveTopTab(newValue);
        // Map index to route if we were doing strict routing, but for now we might just manage state or navigate
        // The original code navigates. Let's replicate that pattern.
        const routes = [
            `/admin/test-management/${testId || '123'}/basic-information`,
            `/admin/test-management/${testId || '123'}/test-sections`,
            `/admin/test-management/${testId || '123'}/testing-sessions`,
            `/admin/test-management/${testId || '123'}/candidates`,
            `/admin/test-management/${testId || '123'}/proctoring`,
            `/admin/test-management/${testId || '123'}/test-administration`,
            `/admin/test-management/${testId || '123'}/rescheduling-requests`,
            `/admin/test-management/${testId || '123'}/reports`
        ];

        if (routes[newValue]) {
            navigate(routes[newValue]);
        }
    };

    // Update active tab when location changes
    useEffect(() => {
        setActiveTopTab(getActiveTopTab());
    }, [location]);

    // --- RENDER FUNCTIONS ---
    // These will be implemented in the next steps due to file size

    const renderBasicInformation = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>Basic Information</Typography>
                <Typography variant="body2" color="text.secondary">Manage basic test details.</Typography>
            </Box>
            <Grid container spacing={4}>
                <Grid item xs={12} md={8}>
                    <Grid container spacing={3}>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Test Name"
                                value={testData.name}
                                onChange={(e) => setTestData({ ...testData, name: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <RichTextEditor
                                label="Description"
                                value={testData.description}
                                onChange={(val) => setTestData({ ...testData, description: val })}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Test Code"
                                value={testData.code}
                                onChange={(e) => setTestData({ ...testData, code: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth>
                                <InputLabel>Status</InputLabel>
                                <Select
                                    value={testData.status}
                                    label="Status"
                                    onChange={(e) => setTestData({ ...testData, status: e.target.value })}
                                >
                                    <MenuItem value="draft">Draft</MenuItem>
                                    <MenuItem value="published">Published</MenuItem>
                                    <MenuItem value="archived">Archived</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField fullWidth label="Creation time" value={new Date(testData.created_at).toLocaleString()} disabled variant="filled" size="small" />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField fullWidth label="Updated by" value={testData.updated_by} disabled variant="filled" size="small" />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField fullWidth label="Update time" value={new Date(testData.updated_at).toLocaleString()} disabled variant="filled" size="small" />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField fullWidth label="Workspace" value={testData.workspace} disabled variant="filled" size="small" />
                        </Grid>
                    </Grid>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Box display="flex" flexDirection="column" alignItems="center" mt={2}>
                        <Box sx={{ position: 'relative', width: 220, height: 220, mb: 2 }}>
                            <Avatar
                                src={testData.image || ''}
                                sx={{ width: '100%', height: '100%', border: '1px solid #eee' }}
                                variant="circular"
                            >
                                <IconifyIcon icon="mdi:image-outline" width={64} height={64} color="text.secondary" />
                            </Avatar>
                            <Box sx={{ position: 'absolute', bottom: 10, right: 10 }}>
                                <input hidden accept="image/*" type="file" id="logo-upload" onChange={handleLogoUpload} />
                                <label htmlFor="logo-upload">
                                    <IconButton component="span" sx={{ bgcolor: 'primary.main', color: 'white' }}>
                                        <IconifyIcon icon="mdi:pencil" />
                                    </IconButton>
                                </label>
                            </Box>
                        </Box>
                        <Typography variant="subtitle2">Test Logo</Typography>
                    </Box>
                </Grid>
            </Grid>
            <SaveButton />
        </Paper>
    );

    // Placeholders for now, to be filled in subsequent edits
    const renderPlaceholder = (title: string) => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2, textAlign: 'center', py: 10 }}>
            <IconifyIcon icon="mdi:tools" width={48} color="text.disabled" />
            <Typography variant="h6" fontWeight={600} mt={2} color="text.secondary">
                {title} Settings
            </Typography>
            <Typography variant="body2" color="text.secondary">
                Configuration for this section is coming soon.
            </Typography>
        </Paper>
    );

    // Stub functions to avoid errors before full implementation
    const renderTestInstructions = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>Test instructions dialog settings</Typography>
                <Typography variant="body2" color="text.secondary">
                    Configure what information is shown to candidates before they start the test.
                </Typography>
            </Box>

            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.requireAck} onChange={(e) => setTestData({ ...testData, requireAck: e.target.checked })} />}
                        label="Require acknowledgment of instructions"
                    />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.showInstructions} onChange={(e) => setTestData({ ...testData, showInstructions: e.target.checked })} />}
                        label="Show test instructions"
                    />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.showDuration} onChange={(e) => setTestData({ ...testData, showDuration: e.target.checked })} />}
                        label="Show test duration"
                    />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.showPassingMark} onChange={(e) => setTestData({ ...testData, showPassingMark: e.target.checked })} />}
                        label="Show passing mark"
                    />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.showQuestionCount} onChange={(e) => setTestData({ ...testData, showQuestionCount: e.target.checked })} />}
                        label="Show number of questions"
                    />
                </Grid>
                <Grid item xs={12} sm={6}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.showRetakes} onChange={(e) => setTestData({ ...testData, showRetakes: e.target.checked })} />}
                        label="Show remaining number of retakes"
                    />
                </Grid>

                <Grid item xs={12} sx={{ mt: 2 }}>
                    <RichTextEditor
                        label="Test instructions"
                        value={testData.instructionsProp}
                        onChange={(val) => setTestData({ ...testData, instructionsProp: val })}
                    />
                </Grid>
                <Grid item xs={12}>
                    <RichTextEditor
                        label="Test completion message"
                        value={testData.completionMessage}
                        onChange={(val) => setTestData({ ...testData, completionMessage: val })}
                    />
                </Grid>
            </Grid>
            <SaveButton />
        </Paper>
    );

    const renderDurationAndLayout = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>Duration and layout</Typography>
                <Typography variant="body2" color="text.secondary">Configure test timing and question layout.</Typography>
            </Box>
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                        <InputLabel>Duration type</InputLabel>
                        <Select
                            value={testData.durationType}
                            label="Duration type"
                            onChange={(e) => setTestData({ ...testData, durationType: e.target.value })}
                        >
                            <MenuItem value="section">Time defined in each section</MenuItem>
                            <MenuItem value="test">Time defined for the whole test</MenuItem>
                        </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                        <InputLabel>Page format</InputLabel>
                        <Select
                            value={testData.pageFormat}
                            label="Page format"
                            onChange={(e) => setTestData({ ...testData, pageFormat: e.target.value })}
                        >
                            <MenuItem value="one_page">One page</MenuItem>
                            <MenuItem value="one_question">One question per page</MenuItem>
                            <MenuItem value="per_section">Defined per section</MenuItem>
                        </Select>
                        {testData.pageFormat === 'per_section' && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                Page format must be set in each section separately.
                            </Typography>
                        )}
                    </FormControl>
                </Grid>

                <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                        <InputLabel>Calculator type</InputLabel>
                        <Select
                            value={testData.calculatorType}
                            label="Calculator type"
                            onChange={(e) => setTestData({ ...testData, calculatorType: e.target.value })}
                        >
                            <MenuItem value="none">No calculator</MenuItem>
                            <MenuItem value="basic">Basic calculator</MenuItem>
                            <MenuItem value="scientific">Scientific calculator</MenuItem>
                        </Select>
                    </FormControl>
                </Grid>

                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.hideMetadata} onChange={(e) => setTestData({ ...testData, hideMetadata: e.target.checked })} />}
                        label="Hide assignment metadata"
                    />
                </Grid>
                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.hideFinishButton} onChange={(e) => setTestData({ ...testData, hideFinishButton: e.target.checked })} />}
                        label='Hide "Finish test" button until last question'
                    />
                </Grid>
                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.enforceSectionOrder} onChange={(e) => setTestData({ ...testData, enforceSectionOrder: e.target.checked })} />}
                        label="Enforce section order"
                    />
                </Grid>
                <Grid item xs={12}><Divider /></Grid>
                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.randomizeQuestions} onChange={(e) => setTestData({ ...testData, randomizeQuestions: e.target.checked })} />}
                        label="Randomize questions order"
                    />
                </Grid>
                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.randomizeAnswers} onChange={(e) => setTestData({ ...testData, randomizeAnswers: e.target.checked })} />}
                        label="Randomize answers order"
                    />
                </Grid>
                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.showProgressBar} onChange={(e) => setTestData({ ...testData, showProgressBar: e.target.checked })} />}
                        label="Show progress bar"
                    />
                </Grid>
                {testData.pageFormat === 'one_question' && (
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            type="number"
                            label="Time limit per question (seconds)"
                            value={testData.timeLimitPerQuestion}
                            onChange={(e) => setTestData({ ...testData, timeLimitPerQuestion: Number(e.target.value) })}
                            helperText="Set to 0 for no limit"
                        />
                    </Grid>
                )}
            </Grid>
            <SaveButton />
        </Paper>
    );

    const renderPauseRetake = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>Pause, retake and reschedule settings</Typography>
                <Typography variant="body2" color="text.secondary">Manage candidate flexibility during attempts.</Typography>
            </Box>
            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.allowContinuation} onChange={(e) => setTestData({ ...testData, allowContinuation: e.target.checked })} />}
                        label="Allow test continuation"
                    />
                    {testData.allowContinuation && (
                        <Box ml={4} mt={2} display="flex" alignItems="center" gap={2}>
                            <Typography variant="body2">Available for continuation for:</Typography>
                            <TextField
                                type="number"
                                size="small"
                                value={testData.continuationDuration}
                                onChange={(e) => setTestData({ ...testData, continuationDuration: Number(e.target.value) })}
                                sx={{ width: 100 }}
                            />
                            <Select
                                size="small"
                                value={testData.continuationUnit}
                                onChange={(e) => setTestData({ ...testData, continuationUnit: e.target.value })}
                                sx={{ width: 120 }}
                            >
                                <MenuItem value="minutes">Minutes</MenuItem>
                                <MenuItem value="hours">Hours</MenuItem>
                                <MenuItem value="days">Days</MenuItem>
                            </Select>
                        </Box>
                    )}
                </Grid>

                <Grid item xs={12}><Divider /></Grid>

                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.allowRetaking} onChange={(e) => setTestData({ ...testData, allowRetaking: e.target.checked })} />}
                        label="Allow test retaking"
                    />
                    {testData.allowRetaking && (
                        <Grid container spacing={2} sx={{ ml: 2, mt: 1 }}>
                            <Grid item xs={12}>
                                <FormControlLabel
                                    control={<Checkbox checked={testData.unlimitedRetakes} onChange={(e) => setTestData({ ...testData, unlimitedRetakes: e.target.checked })} />}
                                    label="Unlimited retakes"
                                />
                            </Grid>
                            {!testData.unlimitedRetakes && (
                                <Grid item xs={12} md={6}>
                                    <TextField
                                        fullWidth
                                        label="Number of retakes"
                                        type="number"
                                        size="small"
                                        value={testData.retakeCount}
                                        onChange={(e) => setTestData({ ...testData, retakeCount: Number(e.target.value) })}
                                    />
                                </Grid>
                            )}
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Scoring method</InputLabel>
                                    <Select
                                        value={testData.scoringMethod}
                                        label="Scoring method"
                                        onChange={(e) => setTestData({ ...testData, scoringMethod: e.target.value })}
                                    >
                                        <MenuItem value="highest">Highest score</MenuItem>
                                        <MenuItem value="last">Last score</MenuItem>
                                        <MenuItem value="first">First score</MenuItem>
                                        <MenuItem value="average">Average score</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12}>
                                <Box display="flex" alignItems="center" gap={2}>
                                    <Typography variant="body2">Delay between retakes:</Typography>
                                    <TextField
                                        type="number"
                                        size="small"
                                        value={testData.retakeDelay}
                                        onChange={(e) => setTestData({ ...testData, retakeDelay: Number(e.target.value) })}
                                        sx={{ width: 100 }}
                                    />
                                    <Select
                                        size="small"
                                        value={testData.retakeDelayUnit}
                                        onChange={(e) => setTestData({ ...testData, retakeDelayUnit: e.target.value })}
                                        sx={{ width: 120 }}
                                    >
                                        <MenuItem value="minutes">Minutes</MenuItem>
                                        <MenuItem value="hours">Hours</MenuItem>
                                        <MenuItem value="days">Days</MenuItem>
                                    </Select>
                                </Box>
                            </Grid>
                        </Grid>
                    )}
                </Grid>

                <Grid item xs={12}><Divider /></Grid>

                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.enableFreeReschedules} onChange={(e) => setTestData({ ...testData, enableFreeReschedules: e.target.checked })} />}
                        label="Enable limited number of free reschedules"
                    />
                    {testData.enableFreeReschedules && (
                        <Box ml={4} mt={2}>
                            <TextField
                                label="Number of free reschedules"
                                type="number"
                                size="small"
                                value={testData.rescheduleCount}
                                onChange={(e) => setTestData({ ...testData, rescheduleCount: Number(e.target.value) })}
                                sx={{ width: 250 }}
                            />
                        </Box>
                    )}
                </Grid>
            </Grid>
            <SaveButton />
        </Paper>
    );
    const renderSecurity = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>Security settings</Typography>
                <Typography variant="body2" color="text.secondary">Configure access control and proctoring.</Typography>
            </Box>
            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.browserLockdown} onChange={(e) => setTestData({ ...testData, browserLockdown: e.target.checked })} />}
                        label="Enable browser lockdown by default"
                    />
                </Grid>
                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.proctoring} onChange={(e) => setTestData({ ...testData, proctoring: e.target.checked })} />}
                        label="Enable proctoring"
                    />
                </Grid>
                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.autoLogout} onChange={(e) => setTestData({ ...testData, autoLogout: e.target.checked })} />}
                        label="Automatically log out candidate after finishing or pausing"
                    />
                </Grid>
                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.requireUpdateProfile} onChange={(e) => setTestData({ ...testData, requireUpdateProfile: e.target.checked })} />}
                        label="Require updating user profile"
                    />
                </Grid>

                <Grid item xs={12}><Divider /></Grid>

                <Grid item xs={12} md={6}>
                    <FormControl fullWidth required>
                        <InputLabel>Network access</InputLabel>
                        <Select
                            value={testData.networkAccess}
                            label="Network access"
                            onChange={(e) => setTestData({ ...testData, networkAccess: e.target.value })}
                        >
                            <MenuItem value="all">All networks</MenuItem>
                            <MenuItem value="intranet">Intranet only</MenuItem>
                        </Select>
                    </FormControl>
                    {testData.networkAccess === 'intranet' && (
                        <TextField
                            fullWidth
                            multiline
                            rows={3}
                            label="Allowed IP addresses (comma separated)"
                            value={testData.allowedIps}
                            onChange={(e) => setTestData({ ...testData, allowedIps: e.target.value })}
                            sx={{ mt: 2 }}
                            placeholder="e.g. 192.168.1.1, 10.0.0.*"
                        />
                    )}
                </Grid>

                <Grid item xs={12} md={6}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.requireAccessCode} onChange={(e) => setTestData({ ...testData, requireAccessCode: e.target.checked })} />}
                        label="Require access code"
                    />
                    {testData.requireAccessCode && (
                        <TextField
                            fullWidth
                            label="Access Code"
                            value={testData.accessCode}
                            onChange={(e) => setTestData({ ...testData, accessCode: e.target.value })}
                            sx={{ mt: 2 }}
                            placeholder="Enter access code"
                        />
                    )}
                </Grid>
            </Grid>
            <SaveButton />
        </Paper>
    );

    const renderResultValidity = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>Result validity settings</Typography>
            </Box>
            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.setValidityPeriod} onChange={(e) => setTestData({ ...testData, setValidityPeriod: e.target.checked })} />}
                        label="Set result validity period"
                    />
                    {testData.setValidityPeriod && (
                        <Box ml={4} mt={2} display="flex" alignItems="center" gap={2}>
                            <Typography variant="body2">Valid for:</Typography>
                            <TextField
                                type="number"
                                size="small"
                                value={testData.validityDuration}
                                onChange={(e) => setTestData({ ...testData, validityDuration: Number(e.target.value) })}
                                sx={{ width: 100 }}
                            />
                            <Select
                                size="small"
                                value={testData.validityUnit}
                                onChange={(e) => setTestData({ ...testData, validityUnit: e.target.value })}
                                sx={{ width: 120 }}
                            >
                                <MenuItem value="days">Days</MenuItem>
                                <MenuItem value="months">Months</MenuItem>
                                <MenuItem value="years">Years</MenuItem>
                            </Select>
                        </Box>
                    )}
                </Grid>
            </Grid>
            <SaveButton />
        </Paper>
    );

    const renderGrading = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>Grading configuration</Typography>
                <Typography variant="body2" color="text.secondary">
                    To pass the test, a candidate has to achieve more than <b>0.00%</b> on the entire test.
                </Typography>
            </Box>

            <Typography variant="subtitle1" fontWeight={600} mb={2}>Passing mark</Typography>
            <Grid container spacing={3}>
                <Grid item xs={12}>
                    <RadioGroup
                        row
                        value={testData.passMarkType}
                        onChange={(e) => setTestData({ ...testData, passMarkType: e.target.value })}
                    >
                        <FormControlLabel value="percentage" control={<Radio />} label="Percentage" />
                        <FormControlLabel value="points" control={<Radio />} label="Points" />
                    </RadioGroup>
                </Grid>
                <Grid item xs={12} md={4}>
                    <TextField
                        fullWidth
                        type="number"
                        label={testData.passMarkType === 'percentage' ? "Percentage" : "Points"}
                        value={testData.passMark}
                        onChange={(e) => setTestData({ ...testData, passMark: Number(e.target.value) })}
                        InputProps={{
                            endAdornment: <InputAdornment position="end">{testData.passMarkType === 'percentage' ? "%" : ""}</InputAdornment>,
                        }}
                    />
                </Grid>
                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.passMarkInclusive} onChange={(e) => setTestData({ ...testData, passMarkInclusive: e.target.checked })} />}
                        label="Make passing mark inclusive"
                    />
                </Grid>

                <Grid item xs={12}>
                    <Typography variant="subtitle2" mt={2} mb={1}>Proctoring</Typography>
                    <FormControlLabel
                        control={<Checkbox checked={testData.requirePositiveProctoring} onChange={(e) => setTestData({ ...testData, requirePositiveProctoring: e.target.checked })} />}
                        label="Require positive proctoring report"
                    />
                </Grid>

                <Grid item xs={12}>
                    <Box display="flex" alignItems="center" mt={2}>
                        <Switch
                            checked={testData.showAdvancedGrading}
                            onChange={(e) => setTestData({ ...testData, showAdvancedGrading: e.target.checked })}
                        />
                        <Typography variant="body2" ml={1}>Show advanced settings</Typography>
                    </Box>
                    {testData.showAdvancedGrading && (
                        <Grid container spacing={3} sx={{ mt: 1, ml: 1, borderLeft: '2px solid', borderColor: 'divider', pl: 2 }}>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Grading scale</InputLabel>
                                    <Select
                                        value={testData.gradingScale}
                                        label="Grading scale"
                                        onChange={(e) => setTestData({ ...testData, gradingScale: e.target.value })}
                                    >
                                        <MenuItem value="none">None (Pass/Fail only)</MenuItem>
                                        <MenuItem value="grades">Standard Grades (A-F)</MenuItem>
                                        <MenuItem value="custom">Custom Scale</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Stack direction="row" spacing={2} alignItems="center">
                                    <FormControl fullWidth size="small">
                                        <InputLabel>Negative points (Penalty)</InputLabel>
                                        <Select
                                            value={testData.penaltyType}
                                            label="Negative points (Penalty)"
                                            onChange={(e) => setTestData({ ...testData, penaltyType: e.target.value })}
                                        >
                                            <MenuItem value="none">No penalty</MenuItem>
                                            <MenuItem value="percentage">Percentage deduction</MenuItem>
                                            <MenuItem value="points">Points deduction</MenuItem>
                                        </Select>
                                    </FormControl>
                                    {testData.penaltyType !== 'none' && (
                                        <TextField
                                            type="number"
                                            size="small"
                                            label="Value"
                                            value={testData.penaltyValue}
                                            onChange={(e) => setTestData({ ...testData, penaltyValue: Number(e.target.value) })}
                                            sx={{ width: 100 }}
                                        />
                                    )}
                                </Stack>
                            </Grid>
                        </Grid>
                    )}
                </Grid>
            </Grid>
            <SaveButton />
        </Paper>
    );
    const renderCertificates = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>Certificates</Typography>
                <Typography variant="body2" color="text.secondary">Assign certificates to successful candidates.</Typography>
            </Box>
            <Box display="flex" flexDirection="column" alignItems="center" py={4}>
                <IconifyIcon icon="mdi:certificate-outline" width={64} height={64} color="text.disabled" />
                <Typography variant="body1" mt={2} color="text.secondary">No certificates assigned.</Typography>
                <Button variant="outlined" startIcon={<IconifyIcon icon="mdi:plus" />} sx={{ mt: 2 }}>
                    Add certificate
                </Button>
            </Box>
            <SaveButton />
        </Paper>
    );

    const renderPersonalReport = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>Personal report settings</Typography>
                <Typography variant="body2" color="text.secondary">Configure the report shown to candidates after the test.</Typography>
            </Box>
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                        <InputLabel>Show report</InputLabel>
                        <Select
                            value={testData.showReport}
                            label="Show report"
                            onChange={(e) => setTestData({ ...testData, showReport: e.target.value })}
                        >
                            <MenuItem value="immediate">Immediately after test</MenuItem>
                            <MenuItem value="delayed">After a delay</MenuItem>
                            <MenuItem value="never">Never</MenuItem>
                        </Select>
                    </FormControl>
                </Grid>
                {testData.showReport === 'delayed' && (
                    <Grid item xs={12} md={6}>
                        <Box display="flex" alignItems="center" gap={2}>
                            <TextField
                                type="number"
                                label="Release delay"
                                value={testData.reportReleaseDelay}
                                onChange={(e) => setTestData({ ...testData, reportReleaseDelay: Number(e.target.value) })}
                            />
                            <Select
                                value={testData.reportReleaseDelayUnit}
                                onChange={(e) => setTestData({ ...testData, reportReleaseDelayUnit: e.target.value })}
                            >
                                <MenuItem value="hours">Hours</MenuItem>
                                <MenuItem value="days">Days</MenuItem>
                            </Select>
                        </Box>
                    </Grid>
                )}

                <Grid item xs={12}><Divider /></Grid>

                <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>Report Content</Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}><FormControlLabel control={<Checkbox checked={testData.DisplayScore} onChange={(e) => setTestData({ ...testData, DisplayScore: e.target.checked })} />} label="Display score" /></Grid>
                        <Grid item xs={12} sm={6}><FormControlLabel control={<Checkbox checked={testData.DisplaySubScores} onChange={(e) => setTestData({ ...testData, DisplaySubScores: e.target.checked })} />} label="Display sub-scores" /></Grid>
                        <Grid item xs={12} sm={6}><FormControlLabel control={<Checkbox checked={testData.DisplaySectionScores} onChange={(e) => setTestData({ ...testData, DisplaySectionScores: e.target.checked })} />} label="Display section scores" /></Grid>
                        <Grid item xs={12} sm={6}><FormControlLabel control={<Checkbox checked={testData.DisplayPassPercentage} onChange={(e) => setTestData({ ...testData, DisplayPassPercentage: e.target.checked })} />} label="Display passing percentage" /></Grid>
                        <Grid item xs={12} sm={6}><FormControlLabel control={<Checkbox checked={testData.DisplaySummaryScore} onChange={(e) => setTestData({ ...testData, DisplaySummaryScore: e.target.checked })} />} label="Display summary score chart" /></Grid>
                        <Grid item xs={12} sm={6}><FormControlLabel control={<Checkbox checked={testData.ShowPassedFailed} onChange={(e) => setTestData({ ...testData, ShowPassedFailed: e.target.checked })} />} label="Show Passed/Failed status" /></Grid>
                    </Grid>
                </Grid>
                <Grid item xs={12}><Divider /></Grid>
                <Grid item xs={12}>
                    <Typography variant="subtitle2" gutterBottom>Export Options</Typography>
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6}><FormControlLabel control={<Checkbox checked={testData.ExportExcel} onChange={(e) => setTestData({ ...testData, ExportExcel: e.target.checked })} />} label="Allow Excel export" /></Grid>
                        <Grid item xs={12} sm={6}><FormControlLabel control={<Checkbox checked={testData.ExportPDF} onChange={(e) => setTestData({ ...testData, ExportPDF: e.target.checked })} />} label="Allow PDF export" /></Grid>
                    </Grid>
                </Grid>
            </Grid>
            <SaveButton />
        </Paper>
    );

    const renderScoreReport = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>Score report settings</Typography>
                <Typography variant="body2" color="text.secondary">Customize the formal score report document.</Typography>
            </Box>
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                        <InputLabel>Template</InputLabel>
                        <Select
                            value={testData.scoreReportTemplate}
                            label="Template"
                            onChange={(e) => setTestData({ ...testData, scoreReportTemplate: e.target.value })}
                        >
                            <MenuItem value="default">Default Template</MenuItem>
                            <MenuItem value="compact">Compact Template</MenuItem>
                        </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.scoreReportAudit} onChange={(e) => setTestData({ ...testData, scoreReportAudit: e.target.checked })} />}
                        label="Include audit trail log"
                    />
                </Grid>
                <Grid item xs={12}>
                    <RichTextEditor
                        label="Report explanation / footer"
                        value={testData.scoreReportExplanation}
                        onChange={(val) => setTestData({ ...testData, scoreReportExplanation: val })}
                    />
                </Grid>
            </Grid>
            <SaveButton />
        </Paper>
    );

    const renderCoupons = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4} display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                    <Typography variant="h5" fontWeight={700} gutterBottom>Coupons</Typography>
                    <Typography variant="body2" color="text.secondary">Manage discount coupons for this test.</Typography>
                </Box>
                <Button variant="contained" startIcon={<IconifyIcon icon="mdi:plus" />} onClick={() => setCouponDialogOpen(true)}>
                    Create coupon
                </Button>
            </Box>

            <TableContainer component={Paper} variant="outlined">
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Code</TableCell>
                            <TableCell>Discount</TableCell>
                            <TableCell>Expiry</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {coupons.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} align="center" sx={{ py: 3 }}>
                                    <Typography variant="body2" color="text.secondary">No coupons created.</Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            coupons.map((coupon, idx) => (
                                <TableRow key={idx}>
                                    <TableCell>{coupon.code}</TableCell>
                                    <TableCell>{coupon.value} {coupon.discountType === 'percentage' ? '%' : 'USD'}</TableCell>
                                    <TableCell>{coupon.expiryDate || 'Never'}</TableCell>
                                    <TableCell><Chip label={coupon.status} size="small" color={coupon.status === 'active' ? 'success' : 'default'} /></TableCell>
                                    <TableCell align="right">
                                        <IconButton size="small" color="error"><IconifyIcon icon="mdi:delete" /></IconButton>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Coupon Dialog */}
            <Dialog open={couponDialogOpen} onClose={() => setCouponDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Create New Coupon</DialogTitle>
                <DialogContent>
                    <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField
                            label="Coupon Code"
                            fullWidth
                            value={newCoupon.code}
                            onChange={(e) => setNewCoupon({ ...newCoupon, code: e.target.value })}
                        />
                        <Grid container spacing={2}>
                            <Grid item xs={6}>
                                <FormControl fullWidth>
                                    <InputLabel>Type</InputLabel>
                                    <Select
                                        value={newCoupon.discountType}
                                        label="Type"
                                        onChange={(e) => setNewCoupon({ ...newCoupon, discountType: e.target.value })}
                                    >
                                        <MenuItem value="percentage">Percentage</MenuItem>
                                        <MenuItem value="amount">Fixed Amount</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={6}>
                                <TextField
                                    label="Value"
                                    type="number"
                                    fullWidth
                                    value={newCoupon.value}
                                    onChange={(e) => setNewCoupon({ ...newCoupon, value: Number(e.target.value) })}
                                />
                            </Grid>
                        </Grid>
                        <TextField
                            label="Expiry Date"
                            type="date"
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                            value={newCoupon.expiryDate}
                            onChange={(e) => setNewCoupon({ ...newCoupon, expiryDate: e.target.value })}
                        />
                        <TextField
                            label="Usage Limit"
                            type="number"
                            fullWidth
                            value={newCoupon.usageLimit}
                            onChange={(e) => setNewCoupon({ ...newCoupon, usageLimit: Number(e.target.value) })}
                        />
                        <FormControlLabel
                            control={<Checkbox checked={newCoupon.sessionPriceOnly} onChange={(e) => setNewCoupon({ ...newCoupon, sessionPriceOnly: e.target.checked })} />}
                            label="Apply to session price only"
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCouponDialogOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleAddCoupon}>Create</Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );

    const renderLanguage = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>Language settings</Typography>
                <Typography variant="body2" color="text.secondary">Configure languages for test content and interface.</Typography>
            </Box>

            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                        <InputLabel>Content Language</InputLabel>
                        <Select
                            value={testData.languagePreference}
                            label="Content Language"
                            onChange={(e) => setTestData({ ...testData, languagePreference: e.target.value })}
                        >
                            <MenuItem value="english">English</MenuItem>
                            <MenuItem value="spanish">Spanish</MenuItem>
                            <MenuItem value="french">French</MenuItem>
                            <MenuItem value="german">German</MenuItem>
                        </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={12} md={6}>
                    <FormControl fullWidth>
                        <InputLabel>Interface Language</InputLabel>
                        <Select
                            value={testData.labelLanguage}
                            label="Interface Language"
                            onChange={(e) => setTestData({ ...testData, labelLanguage: e.target.value })}
                        >
                            <MenuItem value="english">English</MenuItem>
                            <MenuItem value="spanish">Spanish</MenuItem>
                        </Select>
                    </FormControl>
                </Grid>
                <Grid item xs={12}>
                    <FormControlLabel
                        control={<Checkbox checked={testData.exportLanguageMapping} onChange={(e) => setTestData({ ...testData, exportLanguageMapping: e.target.checked })} />}
                        label="Enable language mapping for exports"
                    />
                </Grid>
            </Grid>

            <Box mt={4}>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                    <Typography variant="h6">Question Translations</Typography>
                    <Button startIcon={<IconifyIcon icon="mdi:plus" />} size="small" onClick={() => setTranslationDialogOpen(true)}>Add Language</Button>
                </Box>
                <List dense disablePadding sx={{ bgcolor: 'background.neutral', borderRadius: 1 }}>
                    {questionTranslations.length === 0 ? (
                        <ListItemText sx={{ p: 2, textAlign: 'center', color: 'text.secondary' }} primary="No translations added yet." />
                    ) : (
                        questionTranslations.map((t, idx) => (
                            <React.Fragment key={idx}>
                                <ListItemButton>
                                    <ListItemText primary={t.language} secondary={`Status: ${t.status}`} />
                                    <IconButton size="small"><IconifyIcon icon="mdi:pencil" /></IconButton>
                                </ListItemButton>
                                {idx < questionTranslations.length - 1 && <Divider />}
                            </React.Fragment>
                        ))
                    )}
                </List>
            </Box>

            <Dialog open={translationDialogOpen} onClose={() => setTranslationDialogOpen(false)}>
                <DialogTitle>Add Translation</DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                    <FormControl fullWidth sx={{ mt: 1, minWidth: 300 }}>
                        <InputLabel>Language</InputLabel>
                        <Select
                            value={newTranslation.language}
                            label="Language"
                            onChange={(e) => setNewTranslation({ ...newTranslation, language: e.target.value })}
                        >
                            <MenuItem value="Portuguese">Portuguese</MenuItem>
                            <MenuItem value="Chinese">Chinese</MenuItem>
                            <MenuItem value="Arabic">Arabic</MenuItem>
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setTranslationDialogOpen(false)}>Cancel</Button>
                    <Button variant="contained" onClick={handleAddTranslation}>Add</Button>
                </DialogActions>
            </Dialog>

            <SaveButton />
        </Paper>
    );
    const renderAttachments = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4} display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                    <Typography variant="h5" fontWeight={700} gutterBottom>Attachments</Typography>
                    <Typography variant="body2" color="text.secondary">Files available for candidates to download during the test.</Typography>
                </Box>
                <Button variant="contained" startIcon={<IconifyIcon icon="mdi:plus" />} onClick={() => setAttachmentDialogOpen(true)}>
                    Add attachment
                </Button>
            </Box>

            <TableContainer component={Paper} variant="outlined">
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>File Name</TableCell>
                            <TableCell>Size</TableCell>
                            <TableCell>Type</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {attachments.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 3 }}>
                                    <Typography variant="body2" color="text.secondary">No attachments added.</Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            attachments.map((file, idx) => (
                                <TableRow key={idx}>
                                    <TableCell>
                                        <Box display="flex" alignItems="center" gap={1}>
                                            <IconifyIcon icon="mdi:file-outline" />
                                            {file.name}
                                        </Box>
                                    </TableCell>
                                    <TableCell>{(file.size / 1024).toFixed(2)} KB</TableCell>
                                    <TableCell>{file.type}</TableCell>
                                    <TableCell align="right">
                                        <IconButton size="small" color="error"><IconifyIcon icon="mdi:delete" /></IconButton>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={attachmentDialogOpen} onClose={() => setAttachmentDialogOpen(false)}>
                <DialogTitle>Upload Attachment</DialogTitle>
                <DialogContent sx={{ pt: 2 }}>
                    <Button variant="outlined" component="label" fullWidth startIcon={<IconifyIcon icon="mdi:upload" />} sx={{ height: 100, borderStyle: 'dashed' }}>
                        Choose File
                        <input hidden type="file" onChange={handleAddAttachment} />
                    </Button>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setAttachmentDialogOpen(false)}>Cancel</Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );

    const renderExternal = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>External Attributes</Typography>
                <Typography variant="body2" color="text.secondary">Custom attributes for external integrations.</Typography>
            </Box>

            <Grid container spacing={2} alignItems="center">
                <Grid item xs={5}>
                    <TextField
                        label="Key"
                        fullWidth
                        size="small"
                        value={newExternal.key}
                        onChange={(e) => setNewExternal({ ...newExternal, key: e.target.value })}
                    />
                </Grid>
                <Grid item xs={5}>
                    <TextField
                        label="Value"
                        fullWidth
                        size="small"
                        value={newExternal.value}
                        onChange={(e) => setNewExternal({ ...newExternal, value: e.target.value })}
                    />
                </Grid>
                <Grid item xs={2}>
                    <Button variant="contained" fullWidth onClick={() => {
                        if (newExternal.key && newExternal.value) {
                            setTestData(prev => ({
                                ...prev,
                                externalAttributes: [...(prev.externalAttributes || []), { ...newExternal }]
                            }));
                            setNewExternal({ key: '', value: '' });
                        }
                    }}>Add</Button>
                </Grid>
            </Grid>

            <Box mt={3}>
                <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                        <TableHead><TableRow><TableCell>Key</TableCell><TableCell>Value</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead>
                        <TableBody>
                            {(testData.externalAttributes || []).length === 0 ? (
                                <TableRow><TableCell colSpan={3} align="center">No attributes defined.</TableCell></TableRow>
                            ) : (
                                (testData.externalAttributes || []).map((attr: any, idx: number) => (
                                    <TableRow key={idx}>
                                        <TableCell>{attr.key}</TableCell>
                                        <TableCell>{attr.value}</TableCell>
                                        <TableCell align="right">
                                            <IconButton size="small" color="error" onClick={() => {
                                                const newAttrs = [...(testData.externalAttributes || [])];
                                                newAttrs.splice(idx, 1);
                                                setTestData({ ...testData, externalAttributes: newAttrs });
                                            }}>
                                                <IconifyIcon icon="mdi:delete" />
                                            </IconButton>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </Box>
            <SaveButton />
        </Paper>
    );

    const renderCategories = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>Test Categories</Typography>
                <Typography variant="body2" color="text.secondary">Organize this test into categories for easier management.</Typography>
            </Box>

            <Alert severity="info" sx={{ mb: 3 }}>Categories help users filter and find tests in the library.</Alert>

            <FormControl fullWidth>
                <InputLabel>Category</InputLabel>
                <Select
                    value={testData.category}
                    label="Category"
                    onChange={(e) => setTestData({ ...testData, category: e.target.value })}
                >
                    <MenuItem value="certification">Certification</MenuItem>
                    <MenuItem value="assessment">Assessment</MenuItem>
                    <MenuItem value="training">Training</MenuItem>
                    <MenuItem value="recruitment">Recruitment</MenuItem>
                </Select>
            </FormControl>

            <Box mt={3}>
                <Typography variant="subtitle2" gutterBottom>Tags</Typography>
                <TextField
                    placeholder="Add tags separated by commas..."
                    fullWidth
                    helperText="e.g. math, science, 2024"
                />
            </Box>

            <SaveButton />
        </Paper>
    );

    // Top Tab Renders
    const renderTestSections = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4} display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                    <Typography variant="h5" fontWeight={700} gutterBottom>Test Sections</Typography>
                    <Typography variant="body2" color="text.secondary">Manage the structure and content of your test.</Typography>
                </Box>
                <Button variant="contained" startIcon={<IconifyIcon icon="mdi:plus" />}>
                    Add Section
                </Button>
            </Box>

            <List sx={{ width: '100%', bgcolor: 'background.paper' }}>
                <ListItem alignItems="flex-start" secondaryAction={
                    <IconButton edge="end" aria-label="delete">
                        <IconifyIcon icon="mdi:delete" />
                    </IconButton>
                }>
                    <ListItemAvatar>
                        <Avatar>
                            <IconifyIcon icon="mdi:format-list-checks" />
                        </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                        primary="Section 1: General Knowledge"
                        secondary={
                            <Typography component="span" variant="body2" color="text.primary">
                                10 Questions - 20 Points
                            </Typography>
                        }
                    />
                </ListItem>
                <Divider variant="inset" component="li" />
                <ListItem alignItems="flex-start" secondaryAction={
                    <IconButton edge="end" aria-label="delete">
                        <IconifyIcon icon="mdi:delete" />
                    </IconButton>
                }>
                    <ListItemAvatar>
                        <Avatar>
                            <IconifyIcon icon="mdi:format-list-checks" />
                        </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                        primary="Section 2: Technical Skills"
                        secondary={
                            <Typography component="span" variant="body2" color="text.primary">
                                5 Questions - 50 Points
                            </Typography>
                        }
                    />
                </ListItem>
            </List>
        </Paper>
    );

    const renderTestingSessions = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4} display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                    <Typography variant="h5" fontWeight={700} gutterBottom>Testing Sessions</Typography>
                    <Typography variant="body2" color="text.secondary">Schedule and manage testing sessions.</Typography>
                </Box>
                <Button variant="contained" startIcon={<IconifyIcon icon="mdi:plus" />}>
                    New Session
                </Button>
            </Box>
            <Alert severity="info" sx={{ mb: 3 }}>Sessions allow you to control when and who can take the test.</Alert>
            <Typography variant="body2" align="center" color="text.secondary" sx={{ py: 5 }}>No active sessions found.</Typography>
        </Paper>
    );

    const renderCandidates = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4} display="flex" justifyContent="space-between" alignItems="center">
                <Box>
                    <Typography variant="h5" fontWeight={700} gutterBottom>Candidates</Typography>
                    <Typography variant="body2" color="text.secondary">Manage candidates assigned to this test.</Typography>
                </Box>
                <Box display="flex" gap={2}>
                    <Button variant="outlined" startIcon={<IconifyIcon icon="mdi:account-multiple-plus" />}>Import</Button>
                    <Button variant="contained" startIcon={<IconifyIcon icon="mdi:plus" />}>Add Candidate</Button>
                </Box>
            </Box>
            <TextField
                fullWidth
                placeholder="Search candidates..."
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <IconifyIcon icon="mdi:magnify" />
                        </InputAdornment>
                    ),
                }}
                sx={{ mb: 3 }}
            />
            <TableContainer component={Paper} variant="outlined">
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Email</TableCell>
                            <TableCell>Status</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        <TableRow>
                            <TableCell>John Doe</TableCell>
                            <TableCell>john.doe@example.com</TableCell>
                            <TableCell><Chip label="Assigned" color="primary" size="small" /></TableCell>
                            <TableCell align="right">
                                <IconButton size="small"><IconifyIcon icon="mdi:dots-vertical" /></IconButton>
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell>Jane Smith</TableCell>
                            <TableCell>jane.smith@example.com</TableCell>
                            <TableCell><Chip label="Completed" color="success" size="small" /></TableCell>
                            <TableCell align="right">
                                <IconButton size="small"><IconifyIcon icon="mdi:dots-vertical" /></IconButton>
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );

    const renderProctoring = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>Proctoring</Typography>
                <Typography variant="body2" color="text.secondary">Monitor live sessions and review proctoring records.</Typography>
            </Box>

            <Tabs value={proctoringView} onChange={(e, val) => setProctoringView(val)} sx={{ mb: 3 }}>
                <Tab label="Live Monitoring" value="live" />
                <Tab label="Review Records" value="review" />
            </Tabs>

            {proctoringView === 'live' && (
                <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height={300} bgcolor="background.neutral" borderRadius={2}>
                    <IconifyIcon icon="mdi:cctv" width={64} height={64} color="text.disabled" />
                    <Typography variant="h6" color="text.secondary" mt={2}>No active live sessions</Typography>
                </Box>
            )}
            {proctoringView === 'review' && (
                <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height={300} bgcolor="background.neutral" borderRadius={2}>
                    <IconifyIcon icon="mdi:history" width={64} height={64} color="text.disabled" />
                    <Typography variant="h6" color="text.secondary" mt={2}>No proctoring records available</Typography>
                </Box>
            )}
        </Paper>
    );

    const renderTestAdministration = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>Test Administration</Typography>
                <Typography variant="body2" color="text.secondary">Assign managers and graders to this test.</Typography>
            </Box>

            <Tabs value={testAdminTab} onChange={(e, val) => setTestAdminTab(val)} sx={{ mb: 3 }}>
                <Tab label="Test Managers" value="managers" />
                <Tab label="Graders" value="graders" />
            </Tabs>

            {testAdminTab === 'managers' && (
                <Box>
                    <Box display="flex" justifyContent="flex-end" mb={2}>
                        <Button startIcon={<IconifyIcon icon="mdi:plus" />} variant="outlined">Assign Manager</Button>
                    </Box>
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow><TableCell>User</TableCell><TableCell>Role</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
                            <TableBody>
                                {managersList.map((manager, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell>{manager.name || manager.username}</TableCell>
                                        <TableCell>Manager</TableCell>
                                        <TableCell align="right"><IconButton color="error" size="small"><IconifyIcon icon="mdi:close" /></IconButton></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            )}

            {testAdminTab === 'graders' && (
                <Box>
                    <Box display="flex" justifyContent="flex-end" mb={2}>
                        <Button startIcon={<IconifyIcon icon="mdi:plus" />} variant="outlined">Assign Grader</Button>
                    </Box>
                    <TableContainer component={Paper} variant="outlined">
                        <Table>
                            <TableHead><TableRow><TableCell>User</TableCell><TableCell>Assigned Sections</TableCell><TableCell align="right">Actions</TableCell></TableRow></TableHead>
                            <TableBody>
                                {gradersList.map((grader: any, idx) => (
                                    <TableRow key={idx}>
                                        <TableCell>{grader.name}</TableCell>
                                        <TableCell>All Sections</TableCell>
                                        <TableCell align="right"><IconButton color="error" size="small"><IconifyIcon icon="mdi:close" /></IconButton></TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Box>
            )}
        </Paper>
    );

    const renderReschedulingRequests = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>Rescheduling Requests</Typography>
                <Typography variant="body2" color="text.secondary">Manage candidate requests to reschedule their test.</Typography>
            </Box>
            <Box display="flex" flexDirection="column" alignItems="center" justifyContent="center" height={200} bgcolor="background.neutral" borderRadius={2}>
                <IconifyIcon icon="mdi:calendar-clock" width={48} height={48} color="text.disabled" />
                <Typography variant="body1" color="text.secondary" mt={2}>No pending requests.</Typography>
            </Box>
        </Paper>
    );

    const renderReports = () => (
        <Paper variant="outlined" sx={{ p: 4, borderRadius: 2 }}>
            <Box mb={4}>
                <Typography variant="h5" fontWeight={700} gutterBottom>Reports</Typography>
                <Typography variant="body2" color="text.secondary">View and export test results and statistics.</Typography>
            </Box>

            <Grid container spacing={3}>
                <Grid item xs={12} md={4}>
                    <Card variant="outlined">
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Summary Statistics</Typography>
                            <Typography variant="h3" color="primary">{reportStats.total}</Typography>
                            <Typography variant="body2" color="text.secondary">Total Attempts</Typography>
                        </CardContent>
                        <CardActions>
                            <Button size="small">View Details</Button>
                        </CardActions>
                    </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card variant="outlined">
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Pass Rate</Typography>
                            <Typography variant="h3" color="success.main">{Math.round((reportStats.passed / reportStats.total) * 100)}%</Typography>
                            <Typography variant="body2" color="text.secondary">Candidates Passed</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} md={4}>
                    <Card variant="outlined">
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Avg. Score</Typography>
                            <Typography variant="h3">{reportStats.avgScore}%</Typography>
                            <Typography variant="body2" color="text.secondary">Average Score</Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            <Box mt={4}>
                <Typography variant="subtitle1" gutterBottom>Detailed Reports</Typography>
                <List>
                    <ListItemButton>
                        <ListItemAvatar><Avatar sx={{ bgcolor: 'secondary.main' }}><IconifyIcon icon="mdi:file-chart" /></Avatar></ListItemAvatar>
                        <ListItemText primary="Question Analysis" secondary="Performance breakdown by question" />
                        <IconButton edge="end"><IconifyIcon icon="mdi:chevron-right" /></IconButton>
                    </ListItemButton>
                    <Divider variant="inset" component="li" />
                    <ListItemButton>
                        <ListItemAvatar><Avatar sx={{ bgcolor: 'info.main' }}><IconifyIcon icon="mdi:account-group" /></Avatar></ListItemAvatar>
                        <ListItemText primary="Candidate Performance" secondary="Individual candidate results" />
                        <IconButton edge="end"><IconifyIcon icon="mdi:chevron-right" /></IconButton>
                    </ListItemButton>
                </List>
            </Box>
        </Paper>
    );

    const renderContent = () => {
        if (activeTopTab === 0) {
            switch (activeSection) {
                case 'basic-information': return renderBasicInformation();
                case 'test-instructions-dialog-settings': return renderTestInstructions();
                case 'duration-and-layout': return renderDurationAndLayout();
                case 'pause-retake-reschedule': return renderPauseRetake();
                case 'security-settings': return renderSecurity();
                case 'result-validity-settings': return renderResultValidity();
                case 'grading-configuration': return renderGrading();
                case 'certificates': return renderCertificates();
                case 'personal-report-settings': return renderPersonalReport();
                case 'score-report-settings': return renderScoreReport();
                case 'coupons': return renderCoupons();
                case 'language-settings': return renderLanguage();
                case 'attachments': return renderAttachments();
                case 'external-attributes': return renderExternal();
                case 'test-categories': return renderCategories();
                default: return renderPlaceholder('Unknown Section');
            }
        }

        switch (activeTopTab) {
            case 1: return renderTestSections();
            case 2: return renderTestingSessions();
            case 3: return renderCandidates();
            case 4: return renderProctoring();
            case 5: return renderTestAdministration();
            case 6: return renderReschedulingRequests();
            case 7: return renderReports();
            default: return null;
        }
    };

    return (
        <Box sx={{ pb: 10 }}>
            {/* Header / Breadcrumbs */}
            <Box mb={3}>
                <Breadcrumbs aria-label="breadcrumb">
                    <Link color="inherit" href="/admin/dashboard">Dashboard</Link>
                    <Link color="inherit" href="/admin/tests">Tests</Link>
                    <Typography color="text.primary">{testData.name}</Typography>
                </Breadcrumbs>
                <Box mt={2} display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="h4" fontWeight={700}>Edit Test: {testData.name}</Typography>
                    <Box gap={1} display="flex">
                        <Button variant="outlined" startIcon={<IconifyIcon icon="mdi:eye" />}>Preview</Button>
                        <Button variant="outlined" startIcon={<IconifyIcon icon="mdi:content-copy" />}>Duplicate</Button>
                        <Button variant="contained" color="primary">Publish</Button>
                    </Box>
                </Box>
            </Box>

            {/* Top Tabs */}
            <Paper variant="outlined" sx={{ mb: 3 }}>
                <Tabs
                    value={activeTopTab}
                    onChange={handleTopTabChange}
                    variant="scrollable"
                    scrollButtons="auto"
                    textColor="primary"
                    indicatorColor="primary"
                    sx={{ px: 2 }}
                >
                    {TOP_tabs.map((tab, index) => (
                        <Tab key={index} label={tab} />
                    ))}
                </Tabs>
            </Paper>

            <Grid container spacing={3}>
                {/* Sidebar (Only for Settings Tab) */}
                {activeTopTab === 0 && (
                    <Grid item xs={12} md={3}>
                        <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 2, px: 1 }}>SETTINGS</Typography>
                            <List component="nav" dense>
                                {SETTINGS_MENU.map((item) => (
                                    <ListItemButton
                                        key={item.id}
                                        selected={activeSection === item.id}
                                        onClick={() => navigate(`/admin/test-management/${testId || '123'}/${item.id}`)}
                                        sx={{
                                            borderRadius: 1,
                                            mb: 0.5,
                                            '&.Mui-selected': { bgcolor: 'primary.lighter', color: 'primary.main', fontWeight: 'bold' }
                                        }}
                                    >
                                        <Box display="flex" alignItems="center" gap={1.5}>
                                            <IconifyIcon icon={item.icon} width={20} />
                                            <ListItemText primary={item.label} primaryTypographyProps={{ variant: 'body2' }} />
                                        </Box>
                                    </ListItemButton>
                                ))}
                            </List>
                        </Paper>
                    </Grid>
                )}

                {/* Main Content Area */}
                <Grid item xs={12} md={activeTopTab === 0 ? 9 : 12}>
                    {renderContent()}
                </Grid>
            </Grid>
        </Box>
    );
};

export default EditTest;
