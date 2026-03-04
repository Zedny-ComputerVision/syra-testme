import os

files = [
    "frontend/src/pages/Login.tsx",
    "frontend/src/pages/authentication/SignUp.tsx",
    "frontend/src/pages/ExamWindow.tsx",
    "frontend/src/pages/VerifyID.tsx",
    "frontend/src/pages/Dashboard.tsx",
    "frontend/src/pages/MyTests.tsx",
    "frontend/src/pages/Sessions.tsx",
    "frontend/src/pages/EquipmentCheck.tsx",
]

content = """import { Box, Typography } from '@mui/material';

const Placeholder = () => {
    return (
        <Box sx={{ p: 3, color: 'text.primary' }}>
            <Typography variant="h4">Page Under Construction</Typography>
            <Typography variant="body1">This page has been created as a placeholder.</Typography>
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
