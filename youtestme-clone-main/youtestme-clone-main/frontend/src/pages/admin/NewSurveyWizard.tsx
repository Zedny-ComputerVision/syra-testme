import { useState } from 'react';
import {
    Box,
    Typography,
    Paper,
    Stepper,
    Step,
    StepLabel,
    Button,
    TextField,
    FormControl,
    Select,
    MenuItem,
    Stack,
    Collapse,
    Card,
    CardContent,
    FormHelperText,
    InputLabel,
    Grid,
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import DescriptionOutlinedIcon from '@mui/icons-material/DescriptionOutlined';
import { useNavigate } from 'react-router-dom';

const steps = [
    'Information',
    'Settings',
    'Questions',
    'Grading',
    'Review',
    'Testing sessions',
    'Save survey'
];

const NewSurveyWizard = () => {
    const navigate = useNavigate();
    const [activeStep, setActiveStep] = useState(0);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // Form State
    const [info, setInfo] = useState({
        name: '',
        description: '',
        template: '',
        logo: null
    });

    const handleNext = () => {
        if (activeStep === steps.length - 1) {
            navigate('/surveys'); // Or wherever save goes
        } else {
            setActiveStep((prev) => prev + 1);
        }
    };

    const handleBack = () => {
        setActiveStep((prev) => prev - 1);
    };

    const renderStepContent = (step: number) => {
        switch (step) {
            case 0:
                return (
                    <Box maxWidth={800} mx="auto">
                        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                            <Typography variant="h6" fontWeight="bold" display="flex" alignItems="center" gap={1}>
                                <DescriptionOutlinedIcon color="action" /> Survey information
                            </Typography>
                            <Button variant="contained" component="label" sx={{ bgcolor: '#0f172a', textTransform: 'none' }}>
                                Upload survey
                                <input hidden accept=".json" multiple type="file" />
                            </Button>
                        </Box>

                        <Stack spacing={3}>
                            <Box>
                                <Typography variant="subtitle2" gutterBottom>Name *</Typography>
                                <TextField
                                    fullWidth
                                    size="small"
                                    placeholder=""
                                    value={info.name}
                                    onChange={(e) => setInfo({ ...info, name: e.target.value })}
                                />
                            </Box>

                            <Box>
                                <Typography variant="subtitle2" gutterBottom>Description</Typography>
                                <TextField
                                    fullWidth
                                    multiline
                                    rows={4}
                                    placeholder=""
                                    value={info.description}
                                    onChange={(e) => setInfo({ ...info, description: e.target.value })}
                                />
                            </Box>

                            {/* Survey Logo */}
                            <Box>
                                <Stack direction="row" alignItems="center" gap={0.5} mb={1}>
                                    <Typography variant="body2" color="text.secondary">Survey logo</Typography>
                                    <HelpOutlineIcon sx={{ fontSize: 16, color: 'text.disabled' }} />
                                </Stack>
                                <Box
                                    sx={{
                                        border: '1px dashed #bdbdbd',
                                        borderRadius: 1,
                                        p: 4,
                                        textAlign: 'center',
                                        bgcolor: '#fff',
                                        cursor: 'pointer',
                                        '&:hover': { bgcolor: '#f5f5f5' }
                                    }}
                                >
                                    <CloudUploadIcon sx={{ fontSize: 48, color: '#bdbdbd', mb: 1 }} />
                                    <Typography variant="body2" color="primary">Click to browse and upload your file</Typography>
                                </Box>
                            </Box>

                            <Box textAlign="center" mt={2}>
                                <Button
                                    variant="outlined"
                                    endIcon={showAdvanced ? <KeyboardArrowUpIcon /> : <ExpandMoreIcon />}
                                    onClick={() => setShowAdvanced((prev) => !prev)}
                                    sx={{ textTransform: 'none', color: 'text.primary', borderColor: 'divider' }}
                                >
                                    {showAdvanced ? 'Hide advanced settings' : 'Show advanced settings'}
                                </Button>
                            </Box>

                            <Collapse in={showAdvanced}>
                                <Box mt={3} p={2} border="1px solid #e0e0e0" borderRadius={1}>
                                    <Typography variant="body2" color="text.secondary">Advanced settings content goes here...</Typography>
                                </Box>
                            </Collapse>
                        </Stack>
                    </Box>
                );
            case 1:
                return <Typography variant="h6" align="center" py={5}>Settings Configuration</Typography>;
            case 2:
                return <Typography variant="h6" align="center" py={5}>Questions Builder</Typography>;
            case 3:
                return <Typography variant="h6" align="center" py={5}>Grading Options</Typography>;
            case 4:
                return <Typography variant="h6" align="center" py={5}>Review Survey</Typography>;
            case 5:
                return <Typography variant="h6" align="center" py={5}>Scheduling Sessions</Typography>;
            case 6:
                return <Typography variant="h6" align="center" py={5}>Save and Publish</Typography>;
            default:
                return null;
        }
    };

    return (
        <Box p={3}>
            {/* Header */}
            <Box mb={4}>
                <Typography variant="h5" fontWeight="bold">New survey</Typography>
            </Box>

            {/* Stepper */}
            <Box mb={5}>
                <Stepper activeStep={activeStep} alternativeLabel>
                    {steps.map((label) => (
                        <Step key={label}>
                            <StepLabel>{label}</StepLabel>
                        </Step>
                    ))}
                </Stepper>
            </Box>

            {/* Content Area */}
            <Paper variant="outlined" sx={{ p: 4, mb: 3, minHeight: 400 }}>
                {renderStepContent(activeStep)}
            </Paper>

            {/* Actions */}
            <Box display="flex" justifyContent="flex-end" gap={2}>
                {activeStep === 0 ? (
                    <Button variant="contained" onClick={handleNext} sx={{ bgcolor: '#0f172a', px: 4 }}>
                        Next
                    </Button>
                ) : (
                    <>
                        <Button disabled={activeStep === 0} onClick={handleBack} variant="outlined">Back</Button>
                        <Button variant="contained" onClick={handleNext} sx={{ bgcolor: '#0f172a' }}>
                            {activeStep === steps.length - 1 ? 'Finish' : 'Next'}
                        </Button>
                    </>
                )}
            </Box>
        </Box>
    );
};

export default NewSurveyWizard;
