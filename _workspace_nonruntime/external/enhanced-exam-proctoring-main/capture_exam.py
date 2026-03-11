"""
Exam Capture Module - Records exam session with face and gaze tracking
"""
import cv2
import mediapipe as mp
import numpy as np
import json
import time
import os
import sys
from utils import im2json, calculate_head_pose, calculate_eye_gaze
from config import CAPTURE_INTERVAL, FACE_DETECTION_CONFIDENCE


# Initialize MediaPipe Face Mesh
mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils
mp_drawing_styles = mp.solutions.drawing_styles

# Get script directory
script_dir = os.path.dirname(os.path.abspath(__file__))

# Create output directories inside project folder
outputs_dir = os.path.join(script_dir, 'outputs')
frames_dir = os.path.join(script_dir, 'frames')
os.makedirs(outputs_dir, exist_ok=True)
os.makedirs(frames_dir, exist_ok=True)

# Clear previous frames
frames_path = frames_dir
for f in os.listdir(frames_path):
    if f.endswith('.jpg'):
        os.remove(os.path.join(frames_path, f))

frames_data = []


def main():
    print("\n" + "="*60)
    print("Enhanced Exam Proctoring System")
    print("="*60)
    print("\nStarting exam recording...")
    print("\nPress 'q' to stop\n")
    
    # Open webcam
    cap = cv2.VideoCapture(0)
    
    if not cap.isOpened():
        print("Error: Cannot open camera")
        return
    
    frame_count = 0
    start_time = time.time()
    last_capture_time = start_time
    
    with mp_face_mesh.FaceMesh(
        max_num_faces=2,  # للكشف عن أشخاص متعددين
        refine_landmarks=True,
        min_detection_confidence=FACE_DETECTION_CONFIDENCE,
        min_tracking_confidence=FACE_DETECTION_CONFIDENCE
    ) as face_mesh:
        
        while cap.isOpened():
            success, frame = cap.read()
            if not success:
                print("Failed to read frame")
                break
            
            # Convert BGR to RGB
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = face_mesh.process(rgb_frame)
            
            img_h, img_w = frame.shape[:2]
            current_time = time.time()
            elapsed_time = current_time - start_time
            
            # Display info on frame
            cv2.putText(frame, f"Time: {int(elapsed_time)}s", (10, 30),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            
            num_faces = 0
            if results.multi_face_landmarks:
                num_faces = len(results.multi_face_landmarks)
                
                # Draw face mesh for first face only
                face_landmarks = results.multi_face_landmarks[0]
                mp_drawing.draw_landmarks(
                    image=frame,
                    landmark_list=face_landmarks,
                    connections=mp_face_mesh.FACEMESH_TESSELATION,
                    landmark_drawing_spec=None,
                    connection_drawing_spec=mp_drawing_styles.get_default_face_mesh_tesselation_style()
                )
                
                # Calculate and display head pose
                pitch, yaw, roll = calculate_head_pose(face_landmarks, img_w, img_h)
                
                if pitch is not None:
                    cv2.putText(frame, f"Pitch: {np.degrees(pitch):.1f}", (10, 60),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
                    cv2.putText(frame, f"Yaw: {np.degrees(yaw):.1f}", (10, 90),
                               cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            
            # Display number of faces
            face_color = (0, 255, 0) if num_faces == 1 else (0, 0, 255)
            cv2.putText(frame, f"Faces: {num_faces}", (10, 120),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, face_color, 2)
            
            # Capture frame at intervals
            if current_time - last_capture_time >= CAPTURE_INTERVAL:
                frame_count += 1
                
                # Save frame image
                frame_path = os.path.join(frames_dir, f'{frame_count}.jpg')
                cv2.imwrite(frame_path, frame)
                
                # Prepare frame data
                frame_data = {
                    'index': frame_count,
                    'timestamp': elapsed_time,
                    'time_formatted': f"{int(elapsed_time//60):02d}:{int(elapsed_time%60):02d}",
                    'num_faces': num_faces,
                    'pose': None,
                    'left_eye': None,
                    'right_eye': None
                }
                
                # Add pose and gaze data if face detected
                if results.multi_face_landmarks:
                    face_landmarks = results.multi_face_landmarks[0]
                    pitch, yaw, roll = calculate_head_pose(face_landmarks, img_w, img_h)
                    
                    if pitch is not None:
                        frame_data['pose'] = {
                            'pitch': float(pitch),
                            'yaw': float(yaw),
                            'roll': float(roll)
                        }
                        
                        # Calculate eye gaze
                        left_pitch, left_yaw = calculate_eye_gaze(face_landmarks, img_w, img_h, 'left')
                        right_pitch, right_yaw = calculate_eye_gaze(face_landmarks, img_w, img_h, 'right')
                        
                        frame_data['left_eye'] = {
                            'pitch': float(left_pitch),
                            'yaw': float(left_yaw)
                        }
                        frame_data['right_eye'] = {
                            'pitch': float(right_pitch),
                            'yaw': float(right_yaw)
                        }
                
                frames_data.append(frame_data)
                
                sys.stdout.write(f"\rFrames captured: {frame_count} | Time: {int(elapsed_time)}s")
                sys.stdout.flush()
                
                last_capture_time = current_time
            
            # Display frame
            cv2.imshow('Exam Recording - Press Q to stop', frame)
            
            if cv2.waitKey(5) & 0xFF == ord('q'):
                break
    
    cap.release()
    cv2.destroyAllWindows()
    
    # Save data to JSON
    output_path = os.path.join(outputs_dir, 'exam_data.json')
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(frames_data, f, indent=4, ensure_ascii=False)
    
    print(f"\n\n{'='*60}")
    print("Recording complete!")
    print(f"{'='*60}")
    print(f"\nTotal frames captured: {frame_count}")
    print(f"Total duration: {int(elapsed_time)}s")
    print(f"Saved data to: {output_path}")
    print(f"Saved frames to: {frames_dir}")
    print("\nNow run: python analyze_cheating.py\n")


if __name__ == "__main__":
    main()
