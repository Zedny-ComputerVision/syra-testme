import { useState, useEffect, useMemo } from 'react';
import {
    Box,
    Stepper,
    Step,
    StepLabel,
    Button,
    Typography,
    Card,
    CardContent,
    TextField,
    Grid,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    FormControlLabel,
    RadioGroup,
    Switch,
    Checkbox,
    Collapse,
    Alert,
    List,
    ListItem,
    ListItemIcon,
    ListItemText,
    Chip,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableRow,
    Menu,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    IconButton,
    Tabs,
    Tab,
    Paper
} from '@mui/material';
import ExpandMore from '@mui/icons-material/ExpandMore';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import Radio from '@mui/material/Radio';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import LabelOutlinedIcon from '@mui/icons-material/LabelOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import Link from '@mui/material/Link';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { useTestWizard, TestWizardProvider } from 'context/TestWizardContext';
import { useAutoSave } from 'hooks/useAutoSave';

const steps = [
    'Information',
    'Method',
    'Settings',
    'Questions',
    'Grading',
    'Certificates',
    'Review',
    'Testing sessions',
    'Save test'
];

// --- Helper Components ---
const RichTextEditor = ({ label, value, onChange }: { label: string, value: string, onChange: (val: string) => void }) => (
    <Box mb={3}>
        <Typography variant="subtitle2" mb={1}>{label}</Typography>
        <TextField
            fullWidth
            multiline
            minRows={3}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Enter text..."
        />
    </Box>
);

// --- Step Components ---

const CertificateStep = () => {
    const { state, updateCertificate } = useTestWizard();

    return (
        <Box>
            <Typography variant="h6" gutterBottom>Certificate Settings</Typography>
            <FormControlLabel
                control={
                    <Switch
                        checked={state.certificate.enabled}
                        onChange={(e) => updateCertificate({ enabled: e.target.checked })}
                    />
                }
                label="Enable Certificate"
            />

            <Collapse in={state.certificate.enabled}>
                <Box mt={3}>
                    <Grid container spacing={3}>
                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth>
                                <InputLabel>Template</InputLabel>
                                <Select
                                    value={state.certificate.options.style || 'classic'}
                                    label="Template"
                                    onChange={(e) => updateCertificate({ options: { ...state.certificate.options, style: e.target.value } })}
                                >
                                    <MenuItem value="classic">Classic</MenuItem>
                                    <MenuItem value="modern">Modern</MenuItem>
                                    <MenuItem value="simple">Simple</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <FormControl component="fieldset">
                                <Typography variant="subtitle2">Orientation</Typography>
                                <RadioGroup
                                    row
                                    value={state.certificate.options.orientation || 'landscape'}
                                    onChange={(e) => updateCertificate({ options: { ...state.certificate.options, orientation: e.target.value as 'portrait' | 'landscape' } })}
                                >
                                    <FormControlLabel value="landscape" control={<Radio />} label="Landscape" />
                                    <FormControlLabel value="portrait" control={<Radio />} label="Portrait" />
                                </RadioGroup>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Certificate Title"
                                value={state.certificate.options.title || ''}
                                onChange={(e) => updateCertificate({ options: { ...state.certificate.options, title: e.target.value } })}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Subtitle"
                                value={state.certificate.options.subtitle || ''}
                                onChange={(e) => updateCertificate({ options: { ...state.certificate.options, subtitle: e.target.value } })}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Company Name"
                                value={state.certificate.options.companyName || ''}
                                onChange={(e) => updateCertificate({ options: { ...state.certificate.options, companyName: e.target.value } })}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                multiline
                                rows={3}
                                label="Description Text"
                                value={state.certificate.options.description || ''}
                                onChange={(e) => updateCertificate({ options: { ...state.certificate.options, description: e.target.value } })}
                            />
                        </Grid>
                    </Grid>
                    <Box mt={2} p={2} border="1px dashed grey" borderRadius={1} textAlign="center">
                        <Typography color="textSecondary">Certificate Preview ({state.certificate.options.style} - {state.certificate.options.orientation})</Typography>
                    </Box>
                </Box>
            </Collapse>
        </Box>
    );
};

const MethodStep = () => {
    const { state, updateMethod } = useTestWizard();
    const [uploadOpen, setUploadOpen] = useState(false);

    return (
        <Box>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>Method</Typography>
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Card
                        variant="outlined"
                        sx={{
                            p: 3,
                            textAlign: 'center',
                            borderColor: state.method.selectionMode === 'manual' ? 'primary.main' : 'divider',
                            borderWidth: state.method.selectionMode === 'manual' ? 2 : 1,
                            height: '100%'
                        }}
                    >
                        <Box mb={2} sx={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', borderRadius: 2 }}>
                            <Typography color="text.secondary">Illustration</Typography>
                        </Box>
                        <Typography variant="h6" gutterBottom>Pick questions from pools or create them on the spot</Typography>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            Define exactly which questions will be in your test versions.
                        </Typography>
                        <Box mt={2} display="flex" gap={2} justifyContent="center">
                            <Button
                                variant="contained"
                                onClick={() => updateMethod({ selectionMode: 'manual' })}
                            >
                                Select
                            </Button>
                            <Button variant="text" onClick={() => setUploadOpen(true)}>
                                Upload test
                            </Button>
                        </Box>
                    </Card>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Card
                        variant="outlined"
                        sx={{
                            p: 3,
                            textAlign: 'center',
                            borderColor: state.method.selectionMode === 'generator' ? 'primary.main' : 'divider',
                            borderWidth: state.method.selectionMode === 'generator' ? 2 : 1,
                            height: '100%'
                        }}
                    >
                        <Box mb={2} sx={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', borderRadius: 2 }}>
                            <Typography color="text.secondary">Illustration</Typography>
                        </Box>
                        <Typography variant="h6" gutterBottom>Let the generator select questions</Typography>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            Define a template for test versions. Each candidate may get a different set of questions.
                        </Typography>
                        <Box mt={2}>
                            <Button
                                variant="contained"
                                onClick={() => updateMethod({ selectionMode: 'generator' })}
                            >
                                Select
                            </Button>
                        </Box>
                        <Box mt={2} display="flex" justifyContent="center">
                            <FormControl component="fieldset" sx={{ textAlign: 'left' }}>
                                <RadioGroup
                                    value={state.method.generatorConfig?.mode || 'difficulty'}
                                    onChange={(e) =>
                                        updateMethod({
                                            generatorConfig: {
                                                ...state.method.generatorConfig,
                                                mode: e.target.value as any,
                                                totalQuestions: state.method.generatorConfig?.totalQuestions || 0
                                            }
                                        })
                                    }
                                >
                                    <FormControlLabel value="difficulty" control={<Radio />} label="Based on question difficulty" />
                                    <FormControlLabel value="categories" control={<Radio />} label="Based on question categories" />
                                </RadioGroup>
                            </FormControl>
                        </Box>
                    </Card>
                </Grid>
            </Grid>

            <Dialog open={uploadOpen} onClose={() => setUploadOpen(false)}>
                <DialogTitle>Upload Test</DialogTitle>
                <DialogContent>
                    <Typography variant="body2" color="text.secondary">
                        Choose a file to import questions. Supported formats coming soon.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setUploadOpen(false)}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

const QuestionsStep = () => {
    const { state, setVersions, setActiveVersionIndex, setQuestions } = useTestWizard();
    const [openImport, setOpenImport] = useState(false);
    const [addMenuAnchor, setAddMenuAnchor] = useState<null | HTMLElement>(null);
    const addMenuOpen = Boolean(addMenuAnchor);
    const [poolSearch, setPoolSearch] = useState('');

    // Mock Pools
    const pools = ['General Knowledge', 'Technical Skills', 'Soft Skills'];
    const [selectedPool, setSelectedPool] = useState('');

    const activeVersion = state.versions[state.activeVersionIndex];

    const handleAddVersion = () => {
        const newVersion = {
            name: `Test version ${state.versions.length + 1}`,
            status: 'draft',
            questions: []
        };
        setVersions([...state.versions, newVersion]);
        setActiveVersionIndex(state.versions.length);
    };

    const handleAddQuestion = (type: string) => {
        // Mock adding a question
        const newQ = {
            id: Date.now(),
            text: `New ${type} question`,
            type,
            options: ['Option 1', 'Option 2'],
            answer: 'Option 1',
            points: 1
        };
        const updatedVersions = [...state.versions];
        updatedVersions[state.activeVersionIndex].questions.push(newQ);
        setVersions(updatedVersions);

        // Also update flat questions list for compatibility
        setQuestions([...state.questions, newQ]);
    };

    const handleDeleteQuestion = (qIndex: number) => {
        const updatedVersions = [...state.versions];
        updatedVersions[state.activeVersionIndex].questions.splice(qIndex, 1);
        setVersions(updatedVersions);
    };

    return (
        <Box>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>Add questions</Typography>
            <Grid container spacing={3} alignItems="center">
                <Grid item xs={12} md={6}>
                    <TextField
                        fullWidth
                        label="Current version"
                        value={activeVersion?.name || ''}
                        onChange={(e) => {
                            const updated = [...state.versions];
                            updated[state.activeVersionIndex] = { ...updated[state.activeVersionIndex], name: e.target.value };
                            setVersions(updated);
                        }}
                    />
                </Grid>
                <Grid item xs={12} md={6}>
                    <TextField
                        fullWidth
                        label="Version unique code"
                        value={activeVersion?.uniqueCode || ''}
                        onChange={(e) => {
                            const updated = [...state.versions];
                            updated[state.activeVersionIndex] = { ...updated[state.activeVersionIndex], uniqueCode: e.target.value };
                            setVersions(updated);
                        }}
                    />
                </Grid>
                <Grid item xs={12} md={6}>
                    <Box display="flex" gap={2}>
                        <Button
                            variant="contained"
                            onClick={(e) => setAddMenuAnchor(e.currentTarget)}
                            endIcon={<ExpandMore />}
                        >
                            Add new question
                        </Button>
                        <Menu
                            anchorEl={addMenuAnchor}
                            open={addMenuOpen}
                            onClose={() => setAddMenuAnchor(null)}
                        >
                            {[
                                'Single choice',
                                'Multiple choice',
                                'Essay',
                                'Ordering',
                                'Fill in the blanks',
                                'True/False',
                                'Matching',
                                'Matrix',
                                'Open-ended',
                                'Hot spot'
                            ].map((t) => (
                                <MenuItem
                                    key={t}
                                    onClick={() => {
                                        handleAddQuestion(t);
                                        setAddMenuAnchor(null);
                                    }}
                                >
                                    {t}
                                </MenuItem>
                            ))}
                        </Menu>
                        <Button variant="contained" color="primary" onClick={() => setOpenImport(true)}>
                            Import from pools
                        </Button>
                    </Box>
                    <Typography variant="caption" display="block" sx={{ mt: 1 }}>
                        Click "Add new question" to create a new question manually.
                    </Typography>
                    <Typography variant="caption" display="block">
                        Click "Import from pools" to add questions from question pools.
                    </Typography>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Box mb={2} sx={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'action.hover', borderRadius: 2 }}>
                        <Typography color="text.secondary">Illustration</Typography>
                    </Box>
                </Grid>
                <Grid item xs={12}>
                    <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddVersion}>
                        Add more test versions
                    </Button>
                </Grid>
            </Grid>

            <Box mb={3}>
                <Stack direction="row" spacing={2}></Stack>
            </Box>

            <Table>
                <TableHead>
                    <TableRow>
                        <TableCell>#</TableCell>
                        <TableCell>Question Text</TableCell>
                        <TableCell>Type</TableCell>
                        <TableCell>Points</TableCell>
                        <TableCell align="right">Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {activeVersion?.questions.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={5} align="center">No questions added yet.</TableCell>
                        </TableRow>
                    ) : (
                        activeVersion?.questions.map((q, i) => (
                            <TableRow key={i}>
                                <TableCell>{i + 1}</TableCell>
                                <TableCell>{q.text}</TableCell>
                                <TableCell>{q.type}</TableCell>
                                <TableCell>{q.points}</TableCell>
                                <TableCell align="right">
                                    <IconButton size="small"><EditIcon /></IconButton>
                                    <IconButton size="small" onClick={() => handleDeleteQuestion(i)}><DeleteIcon /></IconButton>
                                </TableCell>
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>

            <Dialog open={openImport} onClose={() => setOpenImport(false)}>
                <DialogTitle>Import from Question Pools</DialogTitle>
                <DialogContent sx={{ minWidth: 400 }}>
                    <FormControl fullWidth sx={{ mt: 2 }}>
                        <InputLabel>Select Pool</InputLabel>
                        <Select
                            value={selectedPool}
                            label="Select Pool"
                            onChange={(e) => setSelectedPool(e.target.value)}
                        >
                            {pools
                                .filter(p => p.toLowerCase().includes(poolSearch.toLowerCase()))
                                .map(p => <MenuItem key={p} value={p}>{p}</MenuItem>)}
                        </Select>
                    </FormControl>
                    <TextField
                        fullWidth
                        placeholder="Search pools"
                        value={poolSearch}
                        onChange={(e) => setPoolSearch(e.target.value)}
                        sx={{ mt: 2 }}
                    />
                    <Typography variant="caption" display="block" color="text.secondary" sx={{ mt: 1 }}>
                        Click the dropdown menu to choose from the existing question pool and import the questions.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenImport(false)}>Cancel</Button>
                    <Button variant="contained" onClick={() => {
                        handleAddQuestion('Multiple Choice'); // Mock import
                        setOpenImport(false);
                    }}>Import</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

const GradingStep = () => {
    const { state, updateGrading } = useTestWizard();
    const [showAdvanced, setShowAdvanced] = useState(false);
    const passingText =
        state.grading.passMarkType === 'percentage'
            ? `Achieve more than ${state.grading.passMark}% on the entire test.`
            : `Achieve more than ${state.grading.passMark} points on the entire test.`;

    return (
        <Box>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>Grading configuration</Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
                To pass the test, a candidate has to: {passingText}
            </Alert>

            <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom>Define pass mark for entire test</Typography>
                <Grid container spacing={3} alignItems="center">
                    <Grid item xs={12}>
                        <FormControl component="fieldset">
                            <RadioGroup
                                row
                                value={state.grading.passMarkType}
                                onChange={(e) => updateGrading({ passMarkType: e.target.value as 'percentage' | 'points' })}
                            >
                                <FormControlLabel value="percentage" control={<Radio />} label="Percentage" />
                                <FormControlLabel value="points" control={<Radio />} label="Points" />
                            </RadioGroup>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <TextField
                            fullWidth
                            type="number"
                            label="Passing mark"
                            value={state.grading.passMark}
                            onChange={(e) => updateGrading({ passMark: Number(e.target.value) })}
                        />
                        <Typography variant="caption" color="text.secondary">
                            {state.grading.passMarkType === 'percentage' ? `${state.grading.passMark}%` : `${state.grading.passMark} points`}
                        </Typography>
                    </Grid>
                    <Grid item xs={12}>
                        <FormControlLabel
                            control={<Checkbox checked={state.grading.passMarkInclusive} onChange={(e) => updateGrading({ passMarkInclusive: e.target.checked })} />}
                            label="Make the passing mark inclusive"
                        />
                    </Grid>
                </Grid>
            </Box>

            <Box sx={{ mb: 3 }}>
                <Typography variant="subtitle1" gutterBottom>Proctoring report</Typography>
                <FormControlLabel
                    control={<Checkbox checked={state.grading.requirePositiveProctoring} onChange={(e) => updateGrading({ requirePositiveProctoring: e.target.checked })} />}
                    label="Require positive proctoring report"
                />
            </Box>

            <Button variant="outlined" endIcon={<ExpandMore />} onClick={() => setShowAdvanced((p) => !p)}>
                {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
            </Button>
            <Collapse in={showAdvanced} sx={{ mt: 2 }}>
                <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                        <FormControl fullWidth>
                            <InputLabel>Grading scale</InputLabel>
                            <Select
                                label="Grading scale"
                                value={state.grading.gradingScaleId ?? ''}
                                onChange={(e) => updateGrading({ gradingScaleId: e.target.value === '' ? null : Number(e.target.value) })}
                            >
                                <MenuItem value=""><em>No grading scale</em></MenuItem>
                                <MenuItem value={1}>Job Satisfaction Profiling</MenuItem>
                                <MenuItem value={2}>Employee Survey</MenuItem>
                                <MenuItem value={3}>University Student Satisfaction</MenuItem>
                                <MenuItem value={4}>Physician Satisfaction Profiling</MenuItem>
                                <MenuItem value={5}>General Event Feedback</MenuItem>
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item xs={12}>
                        <Typography variant="subtitle1" gutterBottom>Question pools report setup</Typography>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell>Pool name</TableCell>
                                    <TableCell>Passing mark</TableCell>
                                    <TableCell align="right">Edit</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                <TableRow>
                                    <TableCell colSpan={3} align="center">No pool-specific configuration</TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </Grid>
                </Grid>
            </Collapse>
        </Box>
    );
};

const ReviewStep = () => {
    const { state } = useTestWizard();

    return (
        <Box>
            <Typography variant="h6" gutterBottom>Review Test Configuration</Typography>
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="subtitle2" color="primary">Information</Typography>
                        <Typography variant="body2">Name: {state.info.name}</Typography>
                        <Typography variant="body2">Status: {state.info.status}</Typography>
                        <Typography variant="body2">Category: {state.info.categoryId || 'None'}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="subtitle2" color="primary">Settings</Typography>
                        <Typography variant="body2">Duration: {state.generalSettings.duration} min</Typography>
                        <Typography variant="body2">Attempts: {state.generalSettings.attempts}</Typography>
                        <Typography variant="body2">Proctoring: {state.proctoring.enabled ? 'Enabled' : 'Disabled'}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="subtitle2" color="primary">Method & Questions</Typography>
                        <Typography variant="body2">Method: {state.method.selectionMode}</Typography>
                        <Typography variant="body2">Versions: {state.versions.length}</Typography>
                        <Typography variant="body2">Total Questions: {state.questions.length}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="subtitle2" color="primary">Grading</Typography>
                        <Typography variant="body2">Pass Mark: {state.grading.passMark} {state.grading.passMarkType}</Typography>
                        <Typography variant="body2">Proctoring Required: {state.grading.requirePositiveProctoring ? 'Yes' : 'No'}</Typography>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};

// Removed unused SettingsStep component

const WizardContent = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { id } = useParams();
    const {
        state,
        updateInfo,
        setQuestions,
        resetWizard,
        updateGeneralSettings,
        updateCertificate,
        updateMethod,
        updateGrading,
        updatePersonalReport,
        updateProctoring,
        updateRetake,
        updateSecurity,
        updateNetworkAccess,
        updateAttachments,
        loadState
    } = useTestWizard();
    const { saving, lastSaved } = useAutoSave();

    const [activeStep, setActiveStep] = useState(0);
    const [nameError, setNameError] = useState<string>('');
    const [initializing, setInitializing] = useState(!id); // If no ID, we are initializing
    const [initError, setInitError] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [showSettingsAdvanced, setShowSettingsAdvanced] = useState(false);
    const computeWarnings = () => {
        const w: string[] = [];
        const name = (state.info.name || '').trim();
        if (name.length < 3) w.push('Name must be at least 3 characters');
        const duration = state.generalSettings.duration || 0;
        if (duration <= 0) w.push('Total duration must be greater than 0');
        const isGenerator = state.method.selectionMode === 'generator';
        if (!isGenerator && state.questions.length === 0) w.push('No questions added');
        const passType = state.grading.passMarkType || 'percentage';
        const pass = state.grading.passMark;
        if (passType === 'percentage') {
            if (!pass || pass <= 0 || pass > 100) w.push('Passing score (percentage) must be between 1 and 100');
        } else {
            if (!pass || pass <= 0) w.push('Passing score must be greater than 0');
        }
        return w;
    };
    const warnings = useMemo(() => computeWarnings(), [state]);
    const hasBlockingWarnings = warnings.length > 0;

    // Handle auto-creation of draft test if no ID is present
    useEffect(() => {
        const initDraft = async () => {
            if (!id) {
                try {
                    console.log('Creating new draft test...');
                    const res = await fetch('/api/tests', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: 'Untitled Test',
                            status: 'draft',
                            creation_type: 'Test with sections' // Default
                        })
                    });

                    if (res.ok) {
                        const newTest = await res.json();
                        console.log('Draft created:', newTest.id);
                        // Navigate to edit-test route to enable auto-save
                        navigate(`/admin/edit-test/${newTest.id}`, { replace: true });
                    } else {
                        console.error('Failed to create draft test');
                    }
                } catch (error) {
                    console.error('Error creating draft:', error);
                    setInitError('Failed to initialize test. Please ensure the backend server is running.');
                }
            }
        };

        initDraft();
    }, [id, navigate]);

    useEffect(() => {
        if (!id) return; // Wait for ID to be available (after redirection)

        setInitializing(false);

        if (location.state?.test) {
            const test = location.state.test;
            updateInfo({
                name: test.name,
                description: test.description,
                status: test.status,
                image: test.image
            });
            // Try to parse rules/settings if they exist
            if (test.settings) {
                try {
                    // Assuming settings is already an object or JSON string
                    // This part depends on backend format. For now, we map basic info.
                    // We can also trigger a background fetch to get full details while showing basic info immediately.
                } catch (e) {
                    console.error('Error parsing settings from state', e);
                }
            }

            // Still fetch full details to ensure we have everything (like questions)
            // But we already populated basic info so user sees something immediately.
            const fetchTest = async () => {
                try {
                    const res = await fetch(`/api/tests/${id}`);
                    if (!res.ok) throw new Error('Failed to fetch test');
                    const data = await res.json();

                    // Use the existing mapping logic
                    const newState: any = {
                        info: {
                            name: data.name,
                            description: data.description || '',
                            label: data.label || '',
                            categoryId: data.categoryId,
                            image: data.image || '',
                            status: data.status,
                            creationType: 'with_sections',
                            instructions: data.settings_new?.instructions || '',
                            acknowledgment: data.settings_new?.acknowledgment || ''
                        },
                        generalSettings: {
                            template: data.settings_new?.template || 'blank',
                            duration: data.settings_new?.totalDuration ? Math.round(data.settings_new.totalDuration / 60) : 60,
                            durationType: data.settings_new?.durationType || 'all_questions',
                            pageFormat: data.settings_new?.pageFormat || 'one_page',
                            deliveryPreference: data.settings_new?.deliveryPreference || 'online',
                            attempts: data.settings_new?.attempts || 1,
                            hideMetadata: !!data.settings_new?.hideMetadata,
                            hideFinishButton: !!data.settings_new?.hideFinishButton,
                            enforceSectionOrder: !!data.settings_new?.enforceSectionOrder,
                            calculatorType: data.settings_new?.calculatorType || 'none'
                        },
                        proctoring: {
                            enabled: !!data.settings_new?.enableProctoring,
                            recordVideo: !!data.settings_new?.recordVideo,
                            recordAudio: !!data.settings_new?.recordAudio,
                            recordScreen: !!data.settings_new?.recordScreen,
                            face: !!data.settings_new?.faceDetection,
                            multiFace: !!data.settings_new?.multiFaceDetection,
                            gaze: !!data.settings_new?.gazeTracking,
                            mouth: !!data.settings_new?.mouthDetection,
                            object: !!data.settings_new?.objectDetection,
                            audio: !!data.settings_new?.audioDetection
                        },
                        security: {
                            reportLifespan: !!data.settings_new?.reportLifespan,
                            autoLogout: !!data.settings_new?.autoLogout,
                            updateProfile: !!data.settings_new?.requireUpdateProfile,
                            browserLockdown: !!data.settings_new?.browserLockdown
                        },
                        method: {
                            method: data.method_new?.method || 'linear',
                            randomize: !!data.method_new?.randomize,
                            selectionMode: data.method_new?.type || 'manual',
                            generatorConfig: data.method_new?.generatorConfig
                        },
                        questions: data.questions || [],
                        versions: data.versions || [],
                        grading: {
                            passMark: data.grading_new?.passMark || 60,
                            passMarkType: data.grading_new?.passMarkType || 'percentage',
                            gradingScaleId: data.grading_new?.gradingScaleId
                        },
                        certificate: {
                            certificateId: data.settings_new?.certificateId || null,
                            passingScore: null,
                            options: {}
                        }
                    };
                    loadState(newState);
                    if (data.questions && data.questions.length > 0) {
                        setQuestions(data.questions);
                    }
                } catch (error) {
                    console.error('Error loading test details:', error);
                }
            };
            fetchTest();

        } else if (id) {
            const fetchTest = async () => {
                try {
                    const res = await fetch(`/api/tests/${id}`);
                    if (!res.ok) throw new Error('Failed to fetch test');

                    const data = await res.json();

                    // Map Backend Data to Wizard State
                    const newState: any = {
                        info: {
                            name: data.name,
                            description: data.description || '',
                            label: data.label || '',
                            categoryId: data.categoryId,
                            image: data.image || '',
                            status: data.status,
                            creationType: 'with_sections', // Default or derived
                            instructions: data.settings_new?.instructions || '',
                            acknowledgment: data.settings_new?.acknowledgment || ''
                        },
                        generalSettings: {
                            template: data.settings_new?.template || 'blank',
                            duration: data.settings_new?.totalDuration ? Math.round(data.settings_new.totalDuration / 60) : 60,
                            durationType: data.settings_new?.durationType || 'all_questions',
                            pageFormat: data.settings_new?.pageFormat || 'one_page',
                            deliveryPreference: data.settings_new?.deliveryPreference || 'online',
                            attempts: data.settings_new?.attempts || 1, // Mapping check needed
                            hideMetadata: !!data.settings_new?.hideMetadata,
                            hideFinishButton: !!data.settings_new?.hideFinishButton,
                            enforceSectionOrder: !!data.settings_new?.enforceSectionOrder,
                            calculatorType: data.settings_new?.calculatorType || 'none'
                        },
                        proctoring: {
                            enabled: !!data.settings_new?.enableProctoring, // Adjust field name if different
                            recordVideo: !!data.settings_new?.recordVideo,
                            recordAudio: !!data.settings_new?.recordAudio,
                            recordScreen: !!data.settings_new?.recordScreen,
                            face: !!data.settings_new?.faceDetection,
                            multiFace: !!data.settings_new?.multiFaceDetection,
                            gaze: !!data.settings_new?.gazeTracking,
                            mouth: !!data.settings_new?.mouthDetection,
                            object: !!data.settings_new?.objectDetection,
                            audio: !!data.settings_new?.audioDetection
                        },
                        security: {
                            reportLifespan: !!data.settings_new?.reportLifespan,
                            autoLogout: !!data.settings_new?.autoLogout,
                            updateProfile: !!data.settings_new?.requireUpdateProfile,
                            browserLockdown: !!data.settings_new?.browserLockdown
                        },
                        method: {
                            method: data.method_new?.method || 'linear',
                            randomize: !!data.method_new?.randomize,
                            selectionMode: data.method_new?.type || 'manual',
                            generatorConfig: data.method_new?.generatorConfig
                        },
                        questions: data.questions || [], // Legacy mapped questions
                        versions: data.versions || [],
                        grading: {
                            passMark: data.grading_new?.passMark || 60,
                            passMarkType: data.grading_new?.passMarkType || 'percentage',
                            gradingScaleId: data.grading_new?.gradingScaleId
                        },
                        certificate: {
                            certificateId: data.settings_new?.certificateId || null,
                            passingScore: null, // Derived?
                            options: {}
                        }
                    };

                    loadState(newState);

                    // If questions exist in legacy format, populate them
                    if (data.questions && data.questions.length > 0) {
                        setQuestions(data.questions);
                    }

                } catch (error) {
                    console.error('Error loading test:', error);
                }
            };

            fetchTest();
        } else {
            resetWizard();
        }
    }, [id, location.state, resetWizard, loadState, setQuestions, updateInfo]);

    const handleNext = () => {
        if (activeStep === 0) {
            const name = (state.info.name || '').trim();
            if (name.length < 3) {
                setNameError('Name must be at least 3 characters');
                return;
            }
            setNameError('');
        }
        if (activeStep === steps.length - 1) {
            handlePublish();
        } else {
            setActiveStep((prev) => prev + 1);
        }
    };

    const handleBack = () => setActiveStep((prev) => prev - 1);

    const handlePublish = async () => {
        if (computeWarnings().length > 0) return;
        // Set status to available and navigate away
        updateInfo({ status: 'available' });
        // Wait for auto-save (or force save if needed, but auto-save handles it eventually)
        // Ideally we should force a save here.
        // For MVP, navigate and let auto-save catch up or trust user pressed "Finish" after waiting a moment?
        // Better: Explicit save call.
        try {
            await fetch(`/api/tests/${id}/wizard`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ info: { status: 'published' } })
            });
            navigate('/admin/manage-tests');
        } catch (e) {
            console.error(e);
        }
    };

    const renderStepContent = (step: number) => {
        switch (step) {
            case 0: // Information
                return (
                    <Box>
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                            <Typography variant="h5">New test</Typography>
                            <Box>
                                <Button
                                    variant="contained"
                                    onClick={handleNext}
                                    sx={{ bgcolor: '#0f172a', ml: 2 }} // Dark blue like screenshot
                                >
                                    Next
                                </Button>
                            </Box>
                        </Box>

                        <Card variant="outlined" sx={{ borderRadius: 2 }}>
                            <CardContent sx={{ p: 4 }}>
                                <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
                                    <Typography variant="h6" fontWeight={600} display="flex" alignItems="center">
                                        <DescriptionOutlinedIcon sx={{ mr: 1, color: 'text.secondary' }} />
                                        Test information
                                    </Typography>
                                    <Link href="#" underline="hover" sx={{ display: 'flex', alignItems: 'center' }}>
                                        <PlayCircleOutlineIcon sx={{ mr: 0.5, fontSize: 18 }} />
                                        <Typography variant="body2">Play video</Typography>
                                    </Link>
                                </Stack>

                                <Grid container spacing={4}>
                                    <Grid item xs={12}>
                                        <TextField
                                            fullWidth
                                            label="Name"
                                            required
                                            value={state.info.name}
                                            onChange={(e) => updateInfo({ name: e.target.value })}
                                            error={!!nameError}
                                            helperText={nameError || ''}
                                            InputLabelProps={{ shrink: true }}
                                        />
                                    </Grid>
                                    <Grid item xs={12}>
                                        <TextField
                                            fullWidth
                                            label="Description"
                                            multiline
                                            minRows={4}
                                            value={state.info.description}
                                            onChange={(e) => updateInfo({ description: e.target.value })}
                                            InputLabelProps={{ shrink: true }}
                                            placeholder=""
                                        />
                                    </Grid>
                                    <Grid item xs={12}>
                                        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                                            <Typography variant="body2" color="text.secondary">Use a test template</Typography>
                                            <HelpOutlineIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                                        </Stack>
                                        <FormControl fullWidth>
                                            <Select
                                                value={state.generalSettings.template || ''}
                                                displayEmpty
                                                onChange={(e) => updateGeneralSettings({ template: String(e.target.value) })}
                                                renderValue={(selected) => {
                                                    if (selected.length === 0) {
                                                        return <Typography color="text.secondary">Select one (optional)</Typography>;
                                                    }
                                                    return selected;
                                                }}
                                            >
                                                <MenuItem value=""><em>None</em></MenuItem>
                                                <MenuItem value="default">Default</MenuItem>
                                                <MenuItem value="blank">Blank</MenuItem>
                                            </Select>
                                        </FormControl>
                                    </Grid>
                                    <Grid item xs={12}>
                                        <Stack direction="row" alignItems="center" gap={0.5} mb={1}>
                                            <Typography variant="body2" color="text.secondary">Test logo</Typography>
                                            <HelpOutlineIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                                        </Stack>
                                        <Box
                                            sx={{
                                                border: '1px dashed #bdbdbd',
                                                borderRadius: 1,
                                                p: 4,
                                                textAlign: 'center',
                                                bgcolor: '#fafafa',
                                                cursor: 'pointer',
                                                '&:hover': { bgcolor: '#f5f5f5' }
                                            }}
                                        >
                                            <CloudUploadIcon sx={{ fontSize: 48, color: '#bdbdbd', mb: 1 }} />
                                            <Typography variant="body2" color="primary">Click to browse and upload your file</Typography>
                                        </Box>
                                    </Grid>
                                </Grid>

                                <Box textAlign="center" mt={4}>
                                    <Button
                                        variant="outlined"
                                        endIcon={showAdvanced ? <KeyboardArrowUpIcon /> : <ExpandMore />}
                                        onClick={() => setShowAdvanced((prev) => !prev)}
                                        sx={{ textTransform: 'none', color: 'text.primary', borderColor: 'divider' }}
                                    >
                                        {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
                                    </Button>
                                </Box>

                                <Collapse in={showAdvanced} sx={{ mt: 3 }}>
                                    <Stack spacing={3}>
                                        {/* Test Attachments */}
                                        <Card variant="outlined">
                                            <CardContent>
                                                <Typography variant="subtitle1" fontWeight={600} display="flex" alignItems="center" gutterBottom>
                                                    <AttachFileIcon sx={{ mr: 1, color: 'text.secondary' }} />
                                                    Test attachments
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary" paragraph>
                                                    Import existing attachments from the library or create new ones.
                                                </Typography>
                                                <Stack direction="row" spacing={2}>
                                                    <Button variant="outlined" sx={{ textTransform: 'none' }}>Create new</Button>
                                                    <Button variant="outlined" sx={{ textTransform: 'none' }}>Import from library</Button>
                                                </Stack>
                                            </CardContent>
                                        </Card>

                                        {/* Test Label */}
                                        <Card variant="outlined">
                                            <CardContent>
                                                <Typography variant="subtitle1" fontWeight={600} display="flex" alignItems="center" gutterBottom>
                                                    <LabelOutlinedIcon sx={{ mr: 1, color: 'text.secondary' }} />
                                                    Test label
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary" paragraph>
                                                    Optionally add a classification label, such as "Confidential", to show on test or survey pages and exported reports.
                                                </Typography>
                                                <TextField
                                                    fullWidth
                                                    size="small"
                                                    label="Label"
                                                    value={state.info.label}
                                                    onChange={(e) => updateInfo({ label: e.target.value })}
                                                />
                                            </CardContent>
                                        </Card>

                                        {/* Test Categories */}
                                        <Card variant="outlined">
                                            <CardContent>
                                                <Typography variant="subtitle1" fontWeight={600} display="flex" alignItems="center" gutterBottom>
                                                    <CategoryOutlinedIcon sx={{ mr: 1, color: 'text.secondary' }} />
                                                    Test categories
                                                </Typography>
                                                <Typography variant="body2" color="text.secondary" paragraph>
                                                    Categories facilitate grouping based on shared characteristics such as subjects, difficulty levels, or other criteria.
                                                </Typography>
                                                <Button variant="outlined" sx={{ mb: 3, textTransform: 'none' }}>Add category</Button>

                                                <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1, p: 2 }}>
                                                    <Grid container spacing={2}>
                                                        <Grid item xs={12}>
                                                            <Stack direction="row" justifyContent="space-between">
                                                                <Typography variant="body2" color="text.secondary">Category</Typography>
                                                                <Link href="#" color="primary" sx={{ fontSize: '0.875rem', textDecoration: 'none' }}>Remove category</Link>
                                                            </Stack>
                                                            <Box sx={{ border: '1px solid #e0e0e0', borderRadius: 1, p: 1, mt: 1, bgcolor: '#fff' }}>
                                                                <Typography variant="body2">Default type</Typography>
                                                            </Box>
                                                        </Grid>
                                                        <Grid item xs={12}>
                                                            <Stack direction="row" justifyContent="space-between">
                                                                <Typography variant="body2" color="text.secondary">Category values</Typography>
                                                                <Link href="#" color="primary" sx={{ fontSize: '0.875rem', textDecoration: 'none' }}>Change values</Link>
                                                            </Stack>
                                                            <Box sx={{ mt: 1 }}>
                                                                <Chip label="Uncategorized" variant="outlined" size="small" />
                                                            </Box>
                                                        </Grid>
                                                    </Grid>
                                                </Box>
                                            </CardContent>
                                        </Card>
                                    </Stack>
                                </Collapse>
                            </CardContent>
                        </Card>
                    </Box>
                );

            case 1: return <MethodStep />; // Was 3

            case 2: // Settings (Tabbed) - Was 1
                return (
                    <Box>
                        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>Test settings</Typography>
                        <Grid container spacing={3}>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth>
                                    <InputLabel>Test template</InputLabel>
                                    <Select
                                        label="Test template"
                                        value={state.generalSettings.template || ''}
                                        onChange={(e) => updateGeneralSettings({ template: String(e.target.value) })}
                                    >
                                        <MenuItem value=""><em>Select one (optional)</em></MenuItem>
                                        <MenuItem value="default">Default</MenuItem>
                                        <MenuItem value="blank">Blank</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <TextField
                                    fullWidth
                                    label="Total duration (hh:mm:ss)"
                                    value={(function () {
                                        const m = state.generalSettings.duration || 0;
                                        const h = Math.floor(m / 60).toString().padStart(2, '0');
                                        const mm = Math.floor(m % 60).toString().padStart(2, '0');
                                        const ss = '00';
                                        return `${h}:${mm}:${ss}`;
                                    })()}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        const parts = v.split(':');
                                        let h = 0, mm = 0, ss = 0;
                                        if (parts.length >= 2) {
                                            h = parseInt(parts[0]) || 0;
                                            mm = parseInt(parts[1]) || 0; // Fixed index
                                            ss = parts[2] ? parseInt(parts[2]) || 0 : 0;
                                        }
                                        const totalMinutes = h * 60 + mm + Math.floor(ss / 60);
                                        updateGeneralSettings({ duration: totalMinutes });
                                    }}
                                />
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth>
                                    <InputLabel>Duration type</InputLabel>
                                    <Select
                                        label="Duration type"
                                        value={state.generalSettings.durationType || 'all_questions'}
                                        onChange={(e) => updateGeneralSettings({ durationType: String(e.target.value) })}
                                    >
                                        <MenuItem value="all_questions">Time to answer all questions</MenuItem>
                                        <MenuItem value="one_question">Time per question</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth>
                                    <InputLabel>Page format</InputLabel>
                                    <Select
                                        label="Page format"
                                        value={state.generalSettings.pageFormat || 'one_page'}
                                        onChange={(e) => updateGeneralSettings({ pageFormat: String(e.target.value) })}
                                    >
                                        <MenuItem value="one_page">All questions on one page</MenuItem>
                                        <MenuItem value="one_question">One question per page</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth>
                                    <InputLabel>Show report</InputLabel>
                                    <Select
                                        label="Show report"
                                        value={state.personalReport.showReport || 'immediate'}
                                        onChange={(e) => updatePersonalReport({ showReport: String(e.target.value) })}
                                    >
                                        <MenuItem value="immediate">Immediately after result verification</MenuItem>
                                        <MenuItem value="after_approval">After approval</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <FormControl fullWidth>
                                    <InputLabel>Report content</InputLabel>
                                    <Select
                                        label="Report content"
                                        value={state.personalReport.reportContent || 'score_details'}
                                        onChange={(e) => updatePersonalReport({ reportContent: String(e.target.value) })}
                                    >
                                        <MenuItem value="score_details">Score and details</MenuItem>
                                        <MenuItem value="score_only">Score only</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12}>
                                <Button
                                    variant="outlined"
                                    endIcon={<ExpandMore />}
                                    onClick={() => setShowSettingsAdvanced((p) => !p)}
                                >
                                    {showSettingsAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
                                </Button>
                                <Collapse in={showSettingsAdvanced} sx={{ mt: 2 }}>
                                    <Grid container spacing={3}>
                                        <Grid item xs={12}>
                                            <FormControl fullWidth>
                                                <InputLabel>Delivery preference</InputLabel>
                                                <Select
                                                    label="Delivery preference"
                                                    value={state.generalSettings.deliveryPreference || 'online'}
                                                    onChange={(e) => updateGeneralSettings({ deliveryPreference: String(e.target.value) })}
                                                >
                                                    <MenuItem value="online">Online</MenuItem>
                                                    <MenuItem value="offline">Offline</MenuItem>
                                                </Select>
                                            </FormControl>
                                        </Grid>
                                        <Grid item xs={12}>
                                            <Typography variant="subtitle1">Proctoring settings</Typography>
                                            <FormControlLabel
                                                control={<Checkbox checked={state.proctoring.enabled} onChange={(e) => updateProctoring({ enabled: e.target.checked })} />}
                                                label="Enable proctoring"
                                            />
                                        </Grid>
                                        <Grid item xs={12}>
                                            <Typography variant="subtitle1">Pause and repeat settings</Typography>
                                            <FormControlLabel
                                                control={<Checkbox checked={state.retake.allowContinuation} onChange={(e) => updateRetake({ allowContinuation: e.target.checked })} />}
                                                label="Allow test continuation"
                                            />
                                            <FormControlLabel
                                                control={<Checkbox checked={state.retake.allowRetaking} onChange={(e) => updateRetake({ allowRetaking: e.target.checked })} />}
                                                label="Allow test retaking"
                                            />
                                        </Grid>
                                    </Grid>
                                </Collapse>
                            </Grid>
                        </Grid>
                    </Box>
                );

            case 3: return <QuestionsStep />; // Was 4
            case 4: return <GradingStep />; // Was 5
            case 5: return <CertificateStep />; // Was 2 (Certificates)
            case 6: return <ReviewStep />; // Was 6

            case 7: // Testing sessions (New Placeholder)
                return (
                    <Box textAlign="center" py={5}>
                        <Typography variant="h5" color="text.secondary">Testing Sessions Configuration</Typography>
                        <Typography variant="body1" color="text.secondary" mt={2}>
                            Configure availability periods and session invites here.
                        </Typography>
                    </Box>
                );

            case 8: // Save Test (Was Publish)
                return (
                    <Box textAlign="center" py={5}>
                        <Typography variant="h5">Ready to Save</Typography>
                        {hasBlockingWarnings && (
                            <Box sx={{ mt: 2, mb: 2 }}>
                                <Alert severity="error">Cannot save while there are unresolved warnings</Alert>
                                <List dense sx={{ textAlign: 'left' }}>
                                    {warnings.map((w, i) => (
                                        <ListItem key={i}>
                                            <ListItemIcon>
                                                <WarningAmberIcon color="warning" />
                                            </ListItemIcon>
                                            <ListItemText primary={w} />
                                        </ListItem>
                                    ))}
                                </List>
                            </Box>
                        )}
                        <Button variant="contained" size="large" onClick={handlePublish} sx={{ mt: 3 }} disabled={hasBlockingWarnings}>
                            Save Test
                        </Button>
                    </Box>
                );
            default:
                return null;
        }
    };

    if (initializing) {
        return (
            <Box p={5} display="flex" flexDirection="column" justifyContent="center" alignItems="center" minHeight="50vh">
                {initError ? (
                    <>
                        <Typography variant="h6" color="error" gutterBottom>{initError}</Typography>
                        <Button variant="contained" onClick={() => window.location.reload()}>Retry</Button>
                    </>
                ) : (
                    <Typography variant="h6" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                        Initializing new test...
                    </Typography>
                )}
            </Box>
        );
    }

    return (
        <Box p={3}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h5">Wizard</Typography>
                <Box>
                    {saving && <Typography variant="caption" color="text.secondary" mr={2}>Saving...</Typography>}
                    {lastSaved && <Typography variant="caption" color="text.secondary">Saved {lastSaved.toLocaleTimeString()}</Typography>}
                </Box>
            </Box>
            <Card sx={{ mb: 3 }}>
                <CardContent>
                    <Stepper activeStep={activeStep} alternativeLabel>
                        {steps.map((label) => (
                            <Step key={label}>
                                <StepLabel>{label}</StepLabel>
                            </Step>
                        ))}
                    </Stepper>
                </CardContent>
            </Card>

            <Card sx={{ minHeight: 400 }}>
                <CardContent>
                    {renderStepContent(activeStep)}
                </CardContent>
            </Card>

            <Box display="flex" justifyContent="flex-end" mt={3} gap={2}>
                <Button disabled={activeStep === 0} onClick={handleBack} variant="outlined">Back</Button>
                <Button variant="contained" onClick={handleNext} disabled={activeStep === 6 && hasBlockingWarnings}>
                    {activeStep === steps.length - 1 ? 'Finish' : 'Next'}
                </Button>
            </Box>
        </Box>
    );
};

const CreateTestWizard = () => (
    <TestWizardProvider>
        <WizardContent />
    </TestWizardProvider>
);

export default CreateTestWizard;
