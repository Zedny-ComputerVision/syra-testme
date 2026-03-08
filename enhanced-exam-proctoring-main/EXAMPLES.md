# Examples and Use Cases

## Example 1: Basic Exam Recording

```bash
# Start recording
python capture_exam.py

# Student takes exam for 10 minutes
# Press 'q' when done

# Analyze the recording
python analyze_cheating.py
```

**Expected Output:**
- `outputs/exam_data.json` - Raw frame data
- `outputs/exam_video_[timestamp].mp4` - Annotated video
- `outputs/cheating_report_[timestamp].xlsx` - Detailed report

## Example 2: Using the Interactive Menu

```bash
python run_exam_proctoring.py
```

Select option 3 for "Record and Analyze" to do both steps automatically.

## Example 3: Custom Configuration

Edit `config.py` to adjust sensitivity:

```python
# More lenient settings (fewer false positives)
HEAD_YAW_MIN = -0.8  # Allow more head movement
HEAD_YAW_MAX = 0.8
CHEATING_FRAMES_THRESHOLD = 10  # Require more frames to confirm cheating

# Stricter settings (catch more potential cheating)
HEAD_YAW_MIN = -0.4  # Less head movement allowed
HEAD_YAW_MAX = 0.4
CHEATING_FRAMES_THRESHOLD = 3  # Fewer frames needed to confirm
```

## Example 4: Batch Processing

Process multiple exam recordings:

```python
import os
import subprocess

exam_folders = ['exam1', 'exam2', 'exam3']

for folder in exam_folders:
    os.chdir(folder)
    subprocess.run(['python', 'analyze_cheating.py'])
    os.chdir('..')
```

## Example 5: Understanding the Excel Report

### Sheet 1: "تفاصيل الغش" (Cheating Details)

| رقم الفريم | الوقت | الثانية | نوع المخالفة | الحالة |
|-----------|-------|---------|--------------|--------|
| 15 | 00:15 | 15.0 | النظر لليسار | غش محتمل |
| 23 | 00:23 | 23.0 | النظر لليسار \| نظر بعيد عن الشاشة | غش محتمل |
| 45 | 00:45 | 45.0 | عدم اكتشاف الوجه | غش محتمل |
| 67 | 01:07 | 67.0 | أشخاص متعددين | غش محتمل |

**Interpretation:**
- Frame 15 (at 15 seconds): Student looked left
- Frame 23 (at 23 seconds): Student looked left AND eyes were off screen
- Frame 45 (at 45 seconds): Face not detected (student left camera view)
- Frame 67 (at 1:07): Multiple persons detected

### Sheet 2: "الملخص" (Summary)

| البيان | القيمة |
|--------|--------|
| إجمالي الفريمات المفحوصة | 120 |
| عدد حالات الغش المكتشفة | 4 |
| النتيجة النهائية | مشبوه |
| التوصية | مراجعة يدوية مطلوبة |

## Example 6: Video Output Interpretation

### Green Indicators (Normal Behavior)
- Face count: 1 (in green)
- Pitch/Yaw values in acceptable range (green text)
- No warning messages

### Red Indicators (Suspicious Behavior)
- Face count: 0 or >1 (in red)
- Pitch/Yaw values outside range (red text)
- Red warning banner at bottom: "تحذير: غش محتمل!"

## Example 7: Common Scenarios

### Scenario 1: Student Looks at Notes
**Detection:**
- Head yaw exceeds threshold
- Sustained for 5+ frames
- Classified as: "النظر لليسار" or "النظر لليمين"

### Scenario 2: Student Leaves Camera
**Detection:**
- Face not detected
- Sustained for 5+ frames
- Classified as: "عدم اكتشاف الوجه"

### Scenario 3: Someone Helps Student
**Detection:**
- Multiple faces detected
- Classified as: "أشخاص متعددين"

### Scenario 4: Student Looks at Second Monitor
**Detection:**
- Eye gaze outside acceptable range
- Head position may be normal
- Classified as: "نظر بعيد عن الشاشة"

## Example 8: Testing the System

```bash
# Run quick test to verify setup
python quick_test.py

# Expected output:
# ✓ OpenCV installed
# ✓ MediaPipe installed
# ✓ NumPy installed
# ✓ Pandas installed
# ✓ OpenPyXL installed
# ✓ Imutils installed
# ✓ Camera is accessible
# ✓ Camera can capture frames
# ✓ Directory 'outputs' ready
# ✓ Directory 'frames' ready
# ✓ All tests passed! System is ready.
```

## Example 9: Troubleshooting

### Problem: Too Many False Positives

**Solution:** Adjust thresholds in `config.py`
```python
# Increase these values
CHEATING_FRAMES_THRESHOLD = 10  # Was 5
HEAD_YAW_MAX = 0.8  # Was 0.6
```

### Problem: Missing Actual Cheating

**Solution:** Make detection more sensitive
```python
# Decrease these values
CHEATING_FRAMES_THRESHOLD = 3  # Was 5
HEAD_YAW_MAX = 0.4  # Was 0.6
```

### Problem: Camera Not Working

**Solution:**
```bash
# Test camera separately
python -c "import cv2; cap = cv2.VideoCapture(0); print('Camera OK' if cap.isOpened() else 'Camera Failed')"
```

## Example 10: Integration with LMS

```python
# Example: Integrate with Learning Management System
import requests
import json

def upload_results_to_lms(student_id, exam_id, report_path):
    """Upload exam results to LMS"""
    
    # Read Excel report
    import pandas as pd
    df = pd.read_excel(report_path, sheet_name='الملخص')
    
    # Extract results
    cheating_count = df[df['البيان'] == 'عدد حالات الغش المكتشفة']['القيمة'].values[0]
    
    # Prepare data
    data = {
        'student_id': student_id,
        'exam_id': exam_id,
        'cheating_incidents': int(cheating_count),
        'status': 'suspicious' if cheating_count > 3 else 'normal'
    }
    
    # Upload to LMS
    response = requests.post('https://lms.example.com/api/exam-results', 
                           json=data,
                           headers={'Authorization': 'Bearer YOUR_TOKEN'})
    
    return response.json()

# Usage
upload_results_to_lms('student123', 'exam456', 'outputs/cheating_report_123456.xlsx')
```
