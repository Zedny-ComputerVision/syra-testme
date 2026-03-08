# Enhanced Exam Proctoring System

<div align="center">

![Python Version](https://img.shields.io/badge/python-3.7+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Status](https://img.shields.io/badge/status-active-success.svg)

Advanced AI-powered exam proctoring system using computer vision

[Features](FEATURES.md) | [Examples](EXAMPLES.md) | [FAQ](FAQ.md) | [Contributing](CONTRIBUTING.md)

</div>

---

## 📋 Overview

An intelligent, standalone exam proctoring system that combines the best detection techniques from multiple projects into one enhanced solution. Uses AI to automatically detect cheating attempts and generate detailed reports.

## ✨ Key Features

- 🎯 **Multi-Level Detection**: Combines MediaPipe & OpenCV for high accuracy
- 👤 **Head Movement Tracking**: Detects suspicious head movements (pitch, yaw, roll)
- 👁️ **Eye Gaze Tracking**: Monitors gaze direction with precision
- 👥 **Person Detection**: Ensures only one person is present
- 🎥 **Annotated Video**: Video highlighting cheating moments in detail
- 📊 **Comprehensive Excel Report**: Detailed report of all cheating incidents
- ⚙️ **Customizable**: Flexible detection sensitivity settings
- 🚀 **Easy to Use**: Simple command-line interface

## 🚀 Quick Start

### 1. Installation

```bash
# Clone the project
git clone https://github.com/yourusername/enhanced-exam-proctoring.git
cd enhanced-exam-proctoring

# Install requirements
pip install -r requirements.txt

# Test the system
python quick_test.py
```

### 2. Usage

**Method 1: Interactive Menu**
```bash
python run_exam_proctoring.py
```

**Method 2: Direct Commands**
```bash
# Record exam
python capture_exam.py

# Analyze exam
python analyze_cheating.py
```

## 📁 Outputs

After analysis, you'll find:

```
outputs/
├── exam_video_[timestamp].mp4      # Annotated video with cheating moments
├── cheating_report_[timestamp].xlsx # Detailed Excel report
└── exam_data.json                   # Raw frame data
```

## 📊 Excel Report Structure

### Sheet 1: "Cheating Details"
| Frame Number | Time | Second | Violation Type | Status |
|--------------|------|--------|----------------|--------|
| 15 | 00:15 | 15.0 | Looking Left | Potential Cheating |
| 23 | 00:23 | 23.0 | Face Not Detected | Potential Cheating |

### Sheet 2: "Summary"
- Total Frames Analyzed
- Cheating Incidents Detected
- Final Result (Cheating/Suspicious/Acceptable)
- Recommendation

## 🎯 Cheating Detection Criteria

1. **Suspicious Head Position**: Looking away from screen for 5+ seconds
2. **Looking Away from Screen**: Eyes consistently off-screen
3. **Face Not Detected**: Student disappeared from camera
4. **Multiple Persons**: More than one person detected
5. **Suspicious Movements**: Looking left/right/down/up

## ⚙️ Customization

Edit `config.py` to adjust sensitivity:

```python
# Detection sensitivity (5 = medium, 3 = high, 10 = low)
CHEATING_FRAMES_THRESHOLD = 5

# Allowed head movement range (in radians)
HEAD_YAW_MIN = -0.6  # Left
HEAD_YAW_MAX = 0.6   # Right
```

## 📦 Requirements

```
Python 3.7+
OpenCV >= 4.5.0
MediaPipe >= 0.8.0
NumPy >= 1.19.0
Pandas >= 1.2.0
OpenPyXL >= 3.0.0
Imutils >= 0.5.4
```

## 📚 Documentation

- [Complete Feature List](FEATURES.md)
- [Usage Examples](EXAMPLES.md)
- [FAQ](FAQ.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## 📄 License

This project is licensed under the MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

This project combines and enhances techniques from:
- exam-proctoring-video-analytics
- Streamlit_App_Cheat_Detection
- MediaPipe by Google
- OpenCV community

## 📞 Support

For help or issues:
- 📖 Read the [documentation](FEATURES.md)
- 💬 Open an issue on GitHub
- 📧 Contact: support@example.com

## 🔄 Version

**Current Version:** 1.0.0

See [CHANGELOG.md](CHANGELOG.md) for version history and updates.

---

<div align="center">

Made with ❤️ for better education

**[⬆ Back to Top](#enhanced-exam-proctoring-system)**

</div>
