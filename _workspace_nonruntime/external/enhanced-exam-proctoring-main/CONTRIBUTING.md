# Contributing to Enhanced Exam Proctoring System

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## How to Contribute

### Reporting Bugs

If you find a bug, please create an issue with:
- Clear description of the bug
- Steps to reproduce
- Expected behavior
- Actual behavior
- System information (OS, Python version, etc.)
- Screenshots if applicable

### Suggesting Features

Feature suggestions are welcome! Please create an issue with:
- Clear description of the feature
- Use case and benefits
- Possible implementation approach
- Any relevant examples

### Code Contributions

#### Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/yourusername/enhanced-exam-proctoring.git
   cd enhanced-exam-proctoring
   ```

3. Create a branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

4. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

#### Making Changes

1. **Code Style**
   - Follow PEP 8 guidelines
   - Use meaningful variable names
   - Add comments for complex logic
   - Keep functions focused and small

2. **Documentation**
   - Update README.md if needed
   - Add docstrings to functions
   - Update FEATURES.md for new features
   - Add examples to EXAMPLES.md

3. **Testing**
   - Test your changes thoroughly
   - Ensure existing functionality still works
   - Run quick_test.py to verify setup

4. **Commit Messages**
   - Use clear, descriptive commit messages
   - Format: `[Type] Brief description`
   - Types: Feature, Fix, Docs, Refactor, Test
   - Example: `[Feature] Add mobile phone detection`

#### Submitting Changes

1. Push to your fork:
   ```bash
   git push origin feature/your-feature-name
   ```

2. Create a Pull Request:
   - Provide clear description of changes
   - Reference any related issues
   - Include screenshots if applicable
   - List any breaking changes

3. Wait for review:
   - Address any feedback
   - Make requested changes
   - Keep discussion professional

## Development Guidelines

### Project Structure

```
enhanced-exam-proctoring/
├── capture_exam.py          # Exam recording module
├── analyze_cheating.py      # Analysis and detection module
├── utils.py                 # Utility functions
├── config.py                # Configuration settings
├── run_exam_proctoring.py   # Main runner
├── quick_test.py            # System verification
└── docs/                    # Documentation
```

### Adding New Features

#### Example: Adding Object Detection

1. **Update config.py**
   ```python
   # Object detection settings
   ENABLE_OBJECT_DETECTION = True
   OBJECT_CONFIDENCE_THRESHOLD = 0.5
   DETECTED_OBJECTS = ['cell phone', 'book']
   ```

2. **Create detection function in utils.py**
   ```python
   def detect_objects(frame, model):
       """Detect objects in frame"""
       # Implementation
       pass
   ```

3. **Integrate in analyze_cheating.py**
   ```python
   # In CheatingDetector class
   def check_objects(self, frame_data):
       """Check for prohibited objects"""
       # Implementation
       pass
   ```

4. **Update documentation**
   - Add to FEATURES.md
   - Add example to EXAMPLES.md
   - Update README.md

### Code Review Checklist

Before submitting, ensure:
- [ ] Code follows PEP 8
- [ ] All functions have docstrings
- [ ] No hardcoded values (use config.py)
- [ ] Error handling is implemented
- [ ] Code is tested
- [ ] Documentation is updated
- [ ] Commit messages are clear
- [ ] No sensitive data in code

## Areas for Contribution

### High Priority
- [ ] Add audio analysis for cheating detection
- [ ] Implement real-time alerts
- [ ] Add web interface
- [ ] Improve detection accuracy
- [ ] Add more language support

### Medium Priority
- [ ] Add database integration
- [ ] Implement user authentication
- [ ] Add batch processing
- [ ] Create mobile app
- [ ] Add cloud storage option

### Low Priority
- [ ] Add dark mode to UI
- [ ] Improve video compression
- [ ] Add more export formats
- [ ] Create installer package
- [ ] Add telemetry (opt-in)

## Questions?

If you have questions:
- Check existing issues
- Read the documentation
- Create a new issue with [Question] tag

## Code of Conduct

### Our Standards

- Be respectful and inclusive
- Accept constructive criticism
- Focus on what's best for the project
- Show empathy towards others

### Unacceptable Behavior

- Harassment or discrimination
- Trolling or insulting comments
- Publishing private information
- Unprofessional conduct

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Mentioned in release notes
- Credited in documentation

Thank you for contributing! 🎉
