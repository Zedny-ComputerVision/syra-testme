"""
Utility functions for exam proctoring system
"""
import cv2
import numpy as np
import json
import base64
import pickle


def im2json(img):
    """Convert numpy image to JSON string"""
    img_data = pickle.dumps(img)
    json_str = json.dumps({"image": base64.b64encode(img_data).decode('ascii')})
    return json_str


def json2im(json_str):
    """Convert JSON string back to numpy image"""
    data = json.loads(json_str)
    img_data = base64.b64decode(data['image'])
    img = pickle.loads(img_data)
    return img


def calculate_head_pose(face_landmarks, img_w, img_h):
    """
    Calculate head pose angles (pitch, yaw, roll) from face landmarks
    
    Args:
        face_landmarks: MediaPipe face landmarks
        img_w: Image width
        img_h: Image height
    
    Returns:
        tuple: (pitch, yaw, roll) in radians
    """
    # 3D model points (generic face model)
    model_points = np.array([
        (0.0, 0.0, 0.0),             # Nose tip
        (0.0, -330.0, -65.0),        # Chin
        (-225.0, 170.0, -135.0),     # Left eye left corner
        (225.0, 170.0, -135.0),      # Right eye right corner
        (-150.0, -150.0, -125.0),    # Left mouth corner
        (150.0, -150.0, -125.0)      # Right mouth corner
    ])
    
    # Camera internals
    focal_length = img_w
    center = (img_w / 2, img_h / 2)
    camera_matrix = np.array([
        [focal_length, 0, center[0]],
        [0, focal_length, center[1]],
        [0, 0, 1]
    ], dtype="double")
    
    dist_coeffs = np.zeros((4, 1))
    
    # 2D image points from landmarks
    image_points = np.array([
        (face_landmarks.landmark[1].x * img_w, face_landmarks.landmark[1].y * img_h),      # Nose tip
        (face_landmarks.landmark[152].x * img_w, face_landmarks.landmark[152].y * img_h),  # Chin
        (face_landmarks.landmark[33].x * img_w, face_landmarks.landmark[33].y * img_h),    # Left eye
        (face_landmarks.landmark[263].x * img_w, face_landmarks.landmark[263].y * img_h),  # Right eye
        (face_landmarks.landmark[61].x * img_w, face_landmarks.landmark[61].y * img_h),    # Left mouth
        (face_landmarks.landmark[291].x * img_w, face_landmarks.landmark[291].y * img_h)   # Right mouth
    ], dtype="double")
    
    # Solve PnP
    success, rotation_vector, translation_vector = cv2.solvePnP(
        model_points, image_points, camera_matrix, dist_coeffs, 
        flags=cv2.SOLVEPNP_ITERATIVE
    )
    
    if not success:
        return None, None, None
    
    # Convert rotation vector to rotation matrix
    rotation_matrix, _ = cv2.Rodrigues(rotation_vector)
    
    # Calculate Euler angles
    pose_mat = cv2.hconcat((rotation_matrix, translation_vector))
    _, _, _, _, _, _, euler_angles = cv2.decomposeProjectionMatrix(pose_mat)
    
    pitch = euler_angles[0][0]
    yaw = euler_angles[1][0]
    roll = euler_angles[2][0]
    
    # Convert to radians
    pitch_rad = np.radians(pitch)
    yaw_rad = np.radians(yaw)
    roll_rad = np.radians(roll)
    
    return pitch_rad, yaw_rad, roll_rad


def calculate_eye_gaze(face_landmarks, img_w, img_h, eye_side='left'):
    """
    Calculate eye gaze direction
    
    Args:
        face_landmarks: MediaPipe face landmarks
        img_w: Image width
        img_h: Image height
        eye_side: 'left' or 'right'
    
    Returns:
        tuple: (pitch, yaw) in radians
    """
    if eye_side == 'left':
        # Left eye landmarks
        eye_center = face_landmarks.landmark[468]  # Left iris center
        eye_left = face_landmarks.landmark[33]
        eye_right = face_landmarks.landmark[133]
    else:
        # Right eye landmarks
        eye_center = face_landmarks.landmark[473]  # Right iris center
        eye_left = face_landmarks.landmark[362]
        eye_right = face_landmarks.landmark[263]
    
    # Calculate relative position
    eye_width = abs(eye_right.x - eye_left.x)
    if eye_width > 0:
        horizontal_ratio = (eye_center.x - eye_left.x) / eye_width
    else:
        horizontal_ratio = 0.5
    
    # Convert to angles (approximate)
    yaw = (horizontal_ratio - 0.5) * 60  # degrees
    pitch = (eye_center.y - (eye_left.y + eye_right.y) / 2) * 60
    
    # Convert to radians
    yaw_rad = np.radians(yaw)
    pitch_rad = np.radians(pitch)
    
    return pitch_rad, yaw_rad


def format_time(seconds):
    """Convert seconds to MM:SS format"""
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes:02d}:{secs:02d}"


def draw_text_with_background(img, text, position, font=cv2.FONT_HERSHEY_SIMPLEX, 
                               font_scale=0.7, text_color=(255, 255, 255), 
                               bg_color=(0, 0, 0), thickness=2, padding=5):
    """Draw text with background rectangle"""
    (text_width, text_height), baseline = cv2.getTextSize(text, font, font_scale, thickness)
    
    x, y = position
    # Draw background rectangle
    cv2.rectangle(img, 
                  (x - padding, y - text_height - padding),
                  (x + text_width + padding, y + baseline + padding),
                  bg_color, -1)
    
    # Draw text
    cv2.putText(img, text, (x, y), font, font_scale, text_color, thickness, cv2.LINE_AA)
    
    return text_height + baseline + 2 * padding
