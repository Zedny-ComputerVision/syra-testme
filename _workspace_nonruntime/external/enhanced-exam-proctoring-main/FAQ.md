# Frequently Asked Questions (FAQ)

## General Questions

### What is this system?
An AI-powered exam proctoring system that monitors students during exams and automatically detects potential cheating behavior using computer vision.

### Is it free to use?
Yes, this is an open-source project under the MIT License. You can use, modify, and distribute it freely.

### What languages are supported?
The system supports both Arabic and English in the interface, reports, and documentation.

### Do I need an internet connection?
No, the system works completely offline. All processing is done locally on your computer.

---

## Technical Questions

### What are the system requirements?

**Minimum:**
- Python 3.7+
- 4GB RAM
- Webcam (720p)
- 1GB free disk space

**Recommended:**
- Python 3.8+
- 8GB RAM
- Webcam (1080p)
- GPU with CUDA support
- 5GB free disk space

### Which operating systems are supported?
- Windows 10/11
- macOS 10.14+
- Linux (Ubuntu 18.04+, Debian, Fedora)

### Can I use an external webcam?
Yes, any USB webcam compatible with OpenCV will work. The system uses the default camera (index 0) but can be configured for other cameras.

### Does it work with virtual cameras?
Yes, virtual cameras (like OBS Virtual Camera) are supported as long as they appear as a standard webcam to the system.

---

## Installation Questions

### Installation fails with "No module named cv2"
Install OpenCV:
```bash
pip install opencv-python
```

### MediaPipe installation fails
Try installing the specific version:
```bash
pip install mediapipe==0.8.11
```

### "Camera not accessible" error
1. Check if another application is using the camera
2. Grant camera permissions to Python
3. Try a different camera index in the code

### Import errors on Windows
Install Visual C++ Redistributable:
- Download from Microsoft's website
- Install and restart your computer

---

## Usage Questions

### How long can I record an exam?
There's no hard limit, but consider:
- Disk space (1 frame/second = ~100MB per hour)
- Processing time increases with duration
- Recommended: 1-3 hours per session

### Can I pause and resume recording?
Currently, no. Each recording session is continuous. This is a planned feature for future versions.

### How accurate is the cheating detection?
Accuracy depends on:
- Camera quality: 95%+ with good camera
- Lighting conditions: Best with even lighting
- Configuration: Adjustable sensitivity
- False positive rate: <10% with default settings

### Can students trick the system?
The system uses multiple detection methods:
- Head pose tracking
- Eye gaze monitoring
- Face detection
- Person counting

However, no system is perfect. Manual review of flagged incidents is recommended.

---

## Configuration Questions

### How do I adjust detection sensitivity?

Edit `config.py`:

**Less sensitive (fewer false positives):**
```python
CHEATING_FRAMES_THRESHOLD = 10  # Default: 5
HEAD_YAW_MAX = 0.8  # Default: 0.6
```

**More sensitive (catch more cheating):**
```python
CHEATING_FRAMES_THRESHOLD = 3  # Default: 5
HEAD_YAW_MAX = 0.4  # Default: 0.6
```

### Can I change the video frame rate?
Yes, in `config.py`:
```python
VIDEO_FPS = 30  # Default: 30
CAPTURE_INTERVAL = 1  # Seconds between captures
```

### How do I add custom cheating types?
Add to `config.py`:
```python
CHEATING_TYPES = {
    'custom_violation': {
        'ar': 'مخالفة مخصصة',
        'en': 'Custom Violation'
    }
}
```

---

## Output Questions

### Where are the output files saved?
All outputs are saved in the `outputs/` directory:
- Videos: `exam_video_[timestamp].mp4`
- Reports: `cheating_report_[timestamp].xlsx`
- Data: `exam_data.json`

### Can I change the output format?
Currently supports:
- Video: MP4
- Report: XLSX (Excel)
- Data: JSON

Other formats can be added by modifying the code.

### How do I read the Excel report?

**Sheet 1: تفاصيل الغش (Details)**
- Lists each cheating incident
- Shows frame number, time, and violation type

**Sheet 2: الملخص (Summary)**
- Overall statistics
- Final verdict
- Recommendations

### Can I export to PDF?
Not directly, but you can:
1. Open the Excel file
2. Save As → PDF
3. Or use a library like `openpyxl` + `reportlab`

---

## Troubleshooting

### Video is too large
Reduce file size:
1. Lower `VIDEO_FPS` in config.py
2. Increase `CAPTURE_INTERVAL`
3. Use video compression tools

### Analysis is slow
Speed up processing:
1. Use a faster computer
2. Enable GPU acceleration
3. Reduce video resolution
4. Process fewer frames

### False positives are too high
Adjust thresholds in `config.py`:
```python
CHEATING_FRAMES_THRESHOLD = 10  # Increase this
HEAD_YAW_MAX = 0.8  # Increase range
```

### Camera shows black screen
1. Check camera permissions
2. Close other applications using camera
3. Try different camera index:
   ```python
   cap = cv2.VideoCapture(1)  # Try 1, 2, etc.
   ```

### Excel file won't open
1. Ensure OpenPyXL is installed
2. Check file permissions
3. Try opening with LibreOffice if Excel fails

---

## Privacy & Security

### Is student data stored?
All data is stored locally on your computer. No cloud uploads or external API calls are made.

### Can I delete the recordings?
Yes, you can safely delete:
- `frames/` directory (frame images)
- `outputs/` directory (videos and reports)
- `exam_data.json` (raw data)

### Is the video encrypted?
By default, no. You can encrypt videos using:
```bash
# Using ffmpeg
ffmpeg -i input.mp4 -encryption_scheme cenc-aes-ctr output.mp4
```

### GDPR compliance?
The system is GDPR-compliant when used properly:
- Inform students about monitoring
- Store data securely
- Delete data when no longer needed
- Provide access to students' own data

---

## Advanced Questions

### Can I integrate with an LMS?
Yes, you can:
1. Parse the Excel report programmatically
2. Upload results via LMS API
3. See [EXAMPLES.md](EXAMPLES.md) for code samples

### Can I use multiple cameras?
Not currently supported, but planned for future versions. You can run multiple instances with different camera indices.

### Can I add custom detection algorithms?
Yes, the modular architecture allows easy extension:
1. Add detection function to `utils.py`
2. Call from `analyze_cheating.py`
3. Update `config.py` for settings

### Can I run this on a server?
Yes, but you'll need:
- Virtual display (Xvfb on Linux)
- Video input source (file or stream)
- Headless mode configuration

### Can I process pre-recorded videos?
Yes, modify `capture_exam.py` to read from video file instead of webcam:
```python
cap = cv2.VideoCapture('exam_video.mp4')
```

---

## Support

### Where can I get help?
1. Read the documentation
2. Check existing GitHub issues
3. Create a new issue
4. Contact: support@example.com

### How do I report a bug?
Create a GitHub issue with:
- System information
- Steps to reproduce
- Expected vs actual behavior
- Error messages
- Screenshots

### How can I contribute?
See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Is commercial use allowed?
Yes, under the MIT License. You can use this system commercially, but:
- Provide attribution
- Include the license
- No warranty is provided

---

## Future Features

### What's coming next?
See [CHANGELOG.md](CHANGELOG.md) for planned features:
- Object detection
- Audio analysis
- Web interface
- Mobile app
- Real-time alerts

### Can I request a feature?
Yes! Create a GitHub issue with:
- Feature description
- Use case
- Benefits
- Implementation ideas

### When will feature X be released?
Check the roadmap in [CHANGELOG.md](CHANGELOG.md). Release dates are estimates and may change.

---

## Contact

For questions not covered here:
- 📧 Email: support@example.com
- 💬 GitHub Issues: [Create an issue](https://github.com/yourusername/enhanced-exam-proctoring/issues)
- 📖 Documentation: [Read the docs](README.md)

---

**Last Updated:** March 1, 2024
