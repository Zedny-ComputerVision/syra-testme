import os

files = [
    "frontend/src/pages/AdminTests.tsx",
    "frontend/src/pages/admin/MySurveys.tsx",
    "frontend/src/pages/admin/AttemptAnalysis.tsx",
    "frontend/src/pages/admin/UserProfiles.tsx",
    "frontend/src/pages/admin/UserGroups.tsx",
    "frontend/src/pages/admin/RolesAndPermissions.tsx",
    "frontend/src/pages/admin/ManageTests.tsx",
    "frontend/src/pages/admin/TestTemplates.tsx",
    "frontend/src/pages/admin/ManageCertificates.tsx",
    "frontend/src/pages/admin/QuestionPools.tsx",
    "frontend/src/pages/admin/QuestionPoolDetail.tsx",
    "frontend/src/pages/admin/GradingScales.tsx",
    "frontend/src/pages/admin/Categories.tsx",
    "frontend/src/pages/admin/TestingSessions.tsx",
    "frontend/src/pages/admin/Candidates.tsx",
    "frontend/src/pages/admin/ManageSurveys.tsx",
    "frontend/src/pages/admin/NewSurveyWizard.tsx",
    "frontend/src/pages/admin/ReportBuilder.tsx",
    "frontend/src/pages/admin/PredefinedReports.tsx",
    "frontend/src/pages/admin/MyFavoriteReports.tsx",
    "frontend/src/pages/admin/ScheduledReports.tsx",
    "frontend/src/pages/admin/Subscribers.tsx",
    "frontend/src/pages/admin/NewTestWizard.tsx",
    "frontend/src/pages/admin/EditTest.tsx",
    "frontend/src/pages/admin/SurveyQuestionPools.tsx",
    "frontend/src/pages/admin/SurveyGradingScales.tsx",
    "frontend/src/pages/admin/MyTests.tsx",
    "frontend/src/pages/admin/Settings.tsx",
    "frontend/src/pages/admin/Integrations.tsx",
    "frontend/src/pages/admin/Maintenance.tsx"
]

content = """import { Box, Typography } from '@mui/material';

const Placeholder = () => {
    return (
        <Box sx={{ p: 3, color: 'text.primary' }}>
            <Typography variant="h4">Page Under Construction</Typography>
            <Typography variant="body1">This page has been created as a placeholder during the migration.</Typography>
        </Box>
    );
};

export default Placeholder;
"""

base_dir = r"d:\Zedny Projects\youtestme clone"

for f in files:
    path = os.path.join(base_dir, f)
    # Ensure directory sep match OS
    path = path.replace('/', '\\')
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as file:
        file.write(content)
        print(f"Created {path}")
