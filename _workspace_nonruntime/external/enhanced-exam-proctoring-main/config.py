"""
Configuration for cheating detection system
"""

# Head Pose Thresholds (in radians)
HEAD_PITCH_MIN = -0.3  # Minimum pitch (looking down)
HEAD_PITCH_MAX = 0.2   # Maximum pitch (looking up)
HEAD_YAW_MIN = -0.6    # Minimum yaw (looking left)
HEAD_YAW_MAX = 0.6     # Maximum yaw (looking right)

# Eye Gaze Thresholds (in radians)
EYE_PITCH_MIN = -0.5
EYE_PITCH_MAX = 0.2
EYE_YAW_MIN = -0.5
EYE_YAW_MAX = 0.5

# Detection Sensitivity
POSE_CHANGE_THRESHOLD = 0.1      # Head pose change sensitivity
EYE_CHANGE_THRESHOLD = 0.2       # Eye gaze change sensitivity
CHEATING_FRAMES_THRESHOLD = 5    # Consecutive frames to confirm cheating

# Video Settings
VIDEO_FPS = 30
CAPTURE_INTERVAL = 1  # Seconds between each frame capture

# Face Detection
FACE_DETECTION_CONFIDENCE = 0.5
MIN_FACE_SIZE = (100, 100)

# Object Detection (YOLO)
YOLO_CONFIDENCE = 0.5
YOLO_NMS_THRESHOLD = 0.4

# Cheating Types
CHEATING_TYPES = {
    'bad_head_pose': 'Suspicious Head Position',
    'bad_eye_gaze': 'Looking Away from Screen',
    'face_not_detected': 'Face Not Detected',
    'multiple_persons': 'Multiple Persons Detected',
    'mobile_phone': 'Mobile Phone Detected',
    'looking_left': 'Looking Left',
    'looking_right': 'Looking Right',
    'looking_down': 'Looking Down',
    'looking_up': 'Looking Up'
}
