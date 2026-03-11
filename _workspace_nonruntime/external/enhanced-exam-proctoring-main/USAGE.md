# Usage Guide - Enhanced Exam Proctoring System

## Overview
This system uses artificial intelligence to monitor students during exams and automatically detect cheating attempts.

## Key Features

### 1. Multi-Level Detection
- **Head Movement Tracking**: Detects when student looks away from screen
- **Eye Gaze Tracking**: Monitors student's gaze direction accurately
- **Face Detection**: Ensures student is present in front of camera
- **Multiple Person Detection**: Alerts when more than one person is present

### 2. Comprehensive Reports
- **Annotated Video**: Video showing cheating moments in detail
- **Excel Report**: Detailed table with all cheating incidents including:
  - Frame number
  - Time (minutes:seconds)
  - Exact second
  - Violation type
  - Status

## Installation

### 1. Install Python
Ensure Python 3.7 or newer is installed

### 2. Install Libraries
```bash
pip install -r requirements.txt
```

## Usage

### Method 1: Interactive Menu
```bash
python run_exam_proctoring.py
```
Then choose from menu:
1. Record New Exam
2. Analyze Recorded Exam
3. Record and Analyze

### Method 2: Direct Commands

#### Step 1: Record Exam
```bash
python capture_exam.py
```
- Camera window will open
- Sit in front of camera as if taking an exam
- Press 'q' when finished

#### Step 2: Analyze Exam
```bash
python analyze_cheating.py
```
- Recorded video will be analyzed
- Annotated video will be created with cheating moments marked
- Detailed Excel report will be generated

## Understanding Results

### Output Video
- **Green indicators**: Student behaving normally
- **Red indicators**: Suspicious behavior detected
- **Red warning banner**: Potential cheating with reason displayed

### Excel Report

#### Sheet "Cheating Details"
| Frame Number | Time | Second | Violation Type | Status |
|--------------|------|--------|----------------|--------|
| 15 | 00:15 | 15.0 | Looking Left | Potential Cheating |
| 23 | 00:23 | 23.0 | Face Not Detected | Potential Cheating |

#### Sheet "Summary"
- Total Frames Analyzed
- Cheating Incidents Detected
- Final Result
- Recommendation

## Violation Types

1. **Looking Left/Right**: Student looking away from screen
2. **Looking Down/Up**: Suspicious head movement
3. **Face Not Detected**: Student not present in front of camera
4. **Looking Away from Screen**: Eyes looking elsewhere
5. **Multiple Persons**: More than one person in camera view

## Adjusting Settings

You can modify detection sensitivity in `config.py`:

```python
# Increase this number = less sensitive
CHEATING_FRAMES_THRESHOLD = 5

# Adjust allowed movement range
HEAD_YAW_MIN = -0.6  # Left
HEAD_YAW_MAX = 0.6   # Right
```

## Tips for Optimal Use

1. **Good Lighting**: Ensure adequate lighting
2. **Clear Camera**: Use good quality camera
3. **Stable Position**: Place camera in stable location
4. **Appropriate Distance**: Sit 50-70 cm from camera
5. **Simple Background**: Use simple, uncluttered background

## Troubleshooting

### Camera Not Working
```bash
# Check camera availability
python -c "import cv2; print(cv2.VideoCapture(0).isOpened())"
```

### Library Errors
```bash
# Reinstall libraries
pip install --upgrade -r requirements.txt
```

### Inaccurate Detection
- Adjust settings in `config.py`
- Ensure good lighting
- Check camera quality

## Support

For help or to report issues, please open an issue in the project.
