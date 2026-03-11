"""
Quick test script to verify system setup
"""
import sys


def test_imports():
    """Test if all required libraries are installed"""
    print("Testing imports...")
    errors = []
    
    try:
        import cv2
        print("✓ OpenCV installed")
    except ImportError:
        errors.append("OpenCV (cv2)")
    
    try:
        import mediapipe
        print("✓ MediaPipe installed")
    except ImportError:
        errors.append("MediaPipe")
    
    try:
        import numpy
        print("✓ NumPy installed")
    except ImportError:
        errors.append("NumPy")
    
    try:
        import pandas
        print("✓ Pandas installed")
    except ImportError:
        errors.append("Pandas")
    
    try:
        import openpyxl
        print("✓ OpenPyXL installed")
    except ImportError:
        errors.append("OpenPyXL")
    
    try:
        import imutils
        print("✓ Imutils installed")
    except ImportError:
        errors.append("Imutils")
    
    return errors


def test_camera():
    """Test if camera is accessible"""
    print("\nTesting camera...")
    try:
        import cv2
        cap = cv2.VideoCapture(0)
        if cap.isOpened():
            print("✓ Camera is accessible")
            ret, frame = cap.read()
            if ret:
                print("✓ Camera can capture frames")
            else:
                print("✗ Camera cannot capture frames")
            cap.release()
            return True
        else:
            print("✗ Camera is not accessible")
            return False
    except Exception as e:
        print(f"✗ Camera test failed: {e}")
        return False


def test_directories():
    """Test if required directories exist or can be created"""
    print("\nTesting directories...")
    import os
    
    dirs = ['outputs', 'frames']
    for d in dirs:
        try:
            os.makedirs(d, exist_ok=True)
            print(f"✓ Directory '{d}' ready")
        except Exception as e:
            print(f"✗ Cannot create directory '{d}': {e}")
            return False
    return True


def main():
    print("="*60)
    print("Enhanced Exam Proctoring System - Quick Test")
    print("="*60 + "\n")
    
    # Test imports
    import_errors = test_imports()
    
    if import_errors:
        print(f"\n✗ Missing libraries: {', '.join(import_errors)}")
        print("\nPlease install missing libraries:")
        print("pip install -r requirements.txt")
        return False
    
    # Test camera
    camera_ok = test_camera()
    
    # Test directories
    dirs_ok = test_directories()
    
    print("\n" + "="*60)
    if not import_errors and camera_ok and dirs_ok:
        print("✓ All tests passed! System is ready.")
        print("\nYou can now run:")
        print("  python run_exam_proctoring.py")
    else:
        print("✗ Some tests failed. Please fix the issues above.")
    print("="*60 + "\n")
    
    return not import_errors and camera_ok and dirs_ok


if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
