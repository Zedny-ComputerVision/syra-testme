# Quick Start Guide

Get up and running with the Enhanced Exam Proctoring System in 5 minutes!

## Prerequisites

- Python 3.7 or higher
- Webcam
- 2GB free disk space

## Installation (2 minutes)

```bash
# 1. Clone or download the project
cd enhanced-exam-proctoring

# 2. Install dependencies
pip install -r requirements.txt

# 3. Verify installation
python quick_test.py
```

Expected output:
```
✓ OpenCV installed
✓ MediaPipe installed
✓ NumPy installed
✓ Pandas installed
✓ OpenPyXL installed
✓ Imutils installed
✓ Camera is accessible
✓ All tests passed! System is ready.
```

## First Run (3 minutes)

### Option 1: Interactive Menu (Recommended)

```bash
python run_exam_proctoring.py
```

Choose option **3** (Record and Analyze) for a complete demo.

### Option 2: Step by Step

**Step 1: Record a test exam (1 minute)**
```bash
python capture_exam.py
```
- Sit in front of camera
- Try different head positions (look left, right, down)
- Press 'q' after 30-60 seconds

**Step 2: Analyze the recording (1 minute)**
```bash
python analyze_cheating.py
```

**Step 3: View results**
```bash
# Check outputs folder
cd outputs
# You'll find:
# - exam_video_[timestamp].mp4
# - cheating_report_[timestamp].xlsx
```

## Understanding Your First Results

### Video Output
- Open `exam_video_[timestamp].mp4`
- Look for red warnings when you looked away
- Green indicators show normal behavior

### Excel Report
- Open `cheating_report_[timestamp].xlsx`
- **Sheet 1**: Lists each incident with timestamp
- **Sheet 2**: Summary and final verdict

## Common First-Time Issues

### "Camera not accessible"
**Solution:** Close other apps using the camera (Zoom, Skype, etc.)

### "Module not found" error
**Solution:** 
```bash
pip install --upgrade -r requirements.txt
```

### Too many false positives
**Solution:** Edit `config.py`:
```python
CHEATING_FRAMES_THRESHOLD = 10  # Increase from 5
```

## Next Steps

1. **Read the full documentation**: [USAGE.md](USAGE.md)
2. **Explore examples**: [EXAMPLES.md](EXAMPLES.md)
3. **Customize settings**: Edit `config.py`
4. **Check FAQ**: [FAQ.md](FAQ.md)

## Quick Reference

### Commands
```bash
# Record exam
python capture_exam.py

# Analyze exam
python analyze_cheating.py

# Interactive menu
python run_exam_proctoring.py

# Test system
python quick_test.py
```

### File Locations
```
enhanced-exam-proctoring/
├── outputs/              # Results go here
│   ├── *.mp4            # Videos
│   └── *.xlsx           # Reports
├── frames/              # Captured images
└── config.py            # Settings
```

### Key Settings (config.py)
```python
CHEATING_FRAMES_THRESHOLD = 5    # Sensitivity
HEAD_YAW_MAX = 0.6              # Head movement range
VIDEO_FPS = 30                  # Video frame rate
CAPTURE_INTERVAL = 1            # Seconds between captures
```

## Getting Help

- **Documentation**: Read [USAGE.md](USAGE.md)
- **Examples**: Check [EXAMPLES.md](EXAMPLES.md)
- **FAQ**: See [FAQ.md](FAQ.md)
- **Issues**: Open a GitHub issue

## Success Checklist

- [ ] Python 3.7+ installed
- [ ] Dependencies installed (`pip install -r requirements.txt`)
- [ ] Camera working (`python quick_test.py`)
- [ ] First recording completed
- [ ] First analysis completed
- [ ] Results viewed (video + Excel)

Congratulations! You're ready to use the system for real exams.

---

**Need more help?** Check the [full documentation](USAGE.md) or [FAQ](FAQ.md).
