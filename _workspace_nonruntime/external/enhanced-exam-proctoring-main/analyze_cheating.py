"""
Cheating Analysis Module - Analyzes exam footage and generates reports
"""
import cv2
import json
import numpy as np
import pandas as pd
import os
import sys
import time
from datetime import datetime
from utils import format_time, draw_text_with_background
from config import (
    HEAD_PITCH_MIN, HEAD_PITCH_MAX, HEAD_YAW_MIN, HEAD_YAW_MAX,
    EYE_PITCH_MIN, EYE_PITCH_MAX, EYE_YAW_MIN, EYE_YAW_MAX,
    POSE_CHANGE_THRESHOLD, EYE_CHANGE_THRESHOLD, CHEATING_FRAMES_THRESHOLD,
    VIDEO_FPS, CHEATING_TYPES
)


class CheatingDetector:
    def __init__(self):
        self.cheating_incidents = []
        self.bad_pose_count = 0
        self.bad_gaze_count = 0
        self.prev_pitch = 0
        self.prev_yaw = 0
        self.prev_left_eye_pitch = 0
        self.prev_left_eye_yaw = 0
        self.prev_right_eye_pitch = 0
        self.prev_right_eye_yaw = 0
        
    def check_head_pose(self, frame_data):
        """Check if head pose indicates cheating"""
        cheating_detected = False
        reason = []
        
        if not frame_data['pose']:
            self.bad_pose_count += 1
            if self.bad_pose_count >= CHEATING_FRAMES_THRESHOLD:
                cheating_detected = True
                reason.append(CHEATING_TYPES['face_not_detected'])
            return cheating_detected, reason
        
        pitch = frame_data['pose']['pitch']
        yaw = frame_data['pose']['yaw']
        
        # Check if pose is outside acceptable range
        pose_bad = False
        if pitch < HEAD_PITCH_MIN:
            reason.append(CHEATING_TYPES['looking_down'])
            pose_bad = True
        elif pitch > HEAD_PITCH_MAX:
            reason.append(CHEATING_TYPES['looking_up'])
            pose_bad = True
            
        if yaw < HEAD_YAW_MIN:
            reason.append(CHEATING_TYPES['looking_right'])
            pose_bad = True
        elif yaw > HEAD_YAW_MAX:
            reason.append(CHEATING_TYPES['looking_left'])
            pose_bad = True
        
        # Check if head is stationary in bad position
        if pose_bad:
            if (abs(self.prev_pitch - pitch) < POSE_CHANGE_THRESHOLD and 
                abs(self.prev_yaw - yaw) < POSE_CHANGE_THRESHOLD):
                self.bad_pose_count += 1
                if self.bad_pose_count >= CHEATING_FRAMES_THRESHOLD:
                    cheating_detected = True
            else:
                self.bad_pose_count = 0
        else:
            self.bad_pose_count = 0
            reason = []
        
        self.prev_pitch = pitch
        self.prev_yaw = yaw
        
        return cheating_detected, reason
    
    def check_eye_gaze(self, frame_data):
        """Check if eye gaze indicates cheating"""
        if not frame_data['pose']:
            return False, []
        
        bad_left = False
        bad_right = False
        reason = []
        
        # Check left eye
        if frame_data['left_eye']:
            left_pitch = frame_data['left_eye']['pitch']
            left_yaw = frame_data['left_eye']['yaw']
            
            if not (EYE_PITCH_MIN < left_pitch < EYE_PITCH_MAX) or \
               not (EYE_YAW_MIN < left_yaw < EYE_YAW_MAX):
                if (abs(left_pitch - self.prev_left_eye_pitch) < EYE_CHANGE_THRESHOLD and
                    abs(left_yaw - self.prev_left_eye_yaw) < EYE_CHANGE_THRESHOLD):
                    bad_left = True
            
            self.prev_left_eye_pitch = left_pitch
            self.prev_left_eye_yaw = left_yaw
        
        # Check right eye
        if frame_data['right_eye']:
            right_pitch = frame_data['right_eye']['pitch']
            right_yaw = frame_data['right_eye']['yaw']
            
            if not (EYE_PITCH_MIN < right_pitch < EYE_PITCH_MAX) or \
               not (EYE_YAW_MIN < right_yaw < EYE_YAW_MAX):
                if (abs(right_pitch - self.prev_right_eye_pitch) < EYE_CHANGE_THRESHOLD and
                    abs(right_yaw - self.prev_right_eye_yaw) < EYE_CHANGE_THRESHOLD):
                    bad_right = True
            
            self.prev_right_eye_pitch = right_pitch
            self.prev_right_eye_yaw = right_yaw
        
        if bad_left or bad_right:
            self.bad_gaze_count += 1
            reason.append(CHEATING_TYPES['bad_eye_gaze'])
            if self.bad_gaze_count >= CHEATING_FRAMES_THRESHOLD:
                return True, reason
        else:
            self.bad_gaze_count = 0
        
        return False, []
    
    def check_multiple_persons(self, frame_data):
        """Check if multiple persons detected"""
        if frame_data['num_faces'] > 1:
            return True, [CHEATING_TYPES['multiple_persons']]
        return False, []
    
    def add_incident(self, frame_index, timestamp, time_formatted, reasons):
        """Add cheating incident to list"""
        self.cheating_incidents.append({
            'frame': frame_index,
            'timestamp': timestamp,
            'time': time_formatted,
            'reasons': reasons
        })


def draw_frame_info(frame, frame_data, is_cheating, reasons, detector):
    """Draw information and warnings on frame"""
    h, w = frame.shape[:2]
    y_offset = 30
    
    # Frame info
    draw_text_with_background(frame, f"Frame: {frame_data['index']}", (10, y_offset),
                             font_scale=0.6, bg_color=(50, 50, 50))
    y_offset += 35
    
    draw_text_with_background(frame, f"Time: {frame_data['time_formatted']}", (10, y_offset),
                             font_scale=0.6, bg_color=(50, 50, 50))
    y_offset += 35
    
    # Face count
    face_color = (0, 200, 0) if frame_data['num_faces'] == 1 else (0, 0, 200)
    draw_text_with_background(frame, f"Faces: {frame_data['num_faces']}", (10, y_offset),
                             font_scale=0.6, bg_color=face_color)
    y_offset += 40
    
    # Head pose info
    if frame_data['pose']:
        pitch = frame_data['pose']['pitch']
        yaw = frame_data['pose']['yaw']
        
        pitch_ok = HEAD_PITCH_MIN < pitch < HEAD_PITCH_MAX
        yaw_ok = HEAD_YAW_MIN < yaw < HEAD_YAW_MAX
        
        pitch_color = (0, 200, 0) if pitch_ok else (0, 0, 200)
        yaw_color = (0, 200, 0) if yaw_ok else (0, 0, 200)
        
        draw_text_with_background(frame, f"Pitch: {np.degrees(pitch):.1f}", (10, y_offset),
                                 font_scale=0.5, bg_color=pitch_color, thickness=1)
        y_offset += 30
        
        draw_text_with_background(frame, f"Yaw: {np.degrees(yaw):.1f}", (10, y_offset),
                                 font_scale=0.5, bg_color=yaw_color, thickness=1)
        y_offset += 30
    else:
        draw_text_with_background(frame, "Face Not Detected", (10, y_offset),
                                 font_scale=0.6, bg_color=(0, 0, 200))
        y_offset += 35
    
    # Eye gaze info
    if frame_data['pose']:
        if frame_data['left_eye']:
            left_pitch = frame_data['left_eye']['pitch']
            left_yaw = frame_data['left_eye']['yaw']
            left_ok = (EYE_PITCH_MIN < left_pitch < EYE_PITCH_MAX and 
                      EYE_YAW_MIN < left_yaw < EYE_YAW_MAX)
            left_color = (0, 150, 0) if left_ok else (0, 0, 150)
            
            draw_text_with_background(frame, f"L Eye: {np.degrees(left_yaw):.1f}", (10, y_offset),
                                     font_scale=0.4, bg_color=left_color, thickness=1)
            y_offset += 25
    
    # Cheating warning
    if is_cheating:
        warning_y = h - 100
        cv2.rectangle(frame, (0, warning_y), (w, h), (0, 0, 255), -1)
        
        warning_text = "WARNING: Potential Cheating!"
        cv2.putText(frame, warning_text, (w//2 - 200, warning_y + 35),
                   cv2.FONT_HERSHEY_SIMPLEX, 1.0, (255, 255, 255), 2, cv2.LINE_AA)
        
        reason_text = " | ".join(reasons[:2])  # Show first 2 reasons
        cv2.putText(frame, reason_text, (20, warning_y + 70),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2, cv2.LINE_AA)


def generate_excel_report(detector, output_path):
    """Generate Excel report of cheating incidents"""
    if not detector.cheating_incidents:
        # Create empty report
        df = pd.DataFrame({
            'Result': ['No cheating detected'],
            'Details': ['Student followed exam rules']
        })
        df.to_excel(output_path, index=False, engine='openpyxl')
        return
    
    # Prepare data
    data = []
    for incident in detector.cheating_incidents:
        data.append({
            'Frame Number': incident['frame'],
            'Time': incident['time'],
            'Second': f"{incident['timestamp']:.1f}",
            'Violation Type': ' | '.join(incident['reasons']),
            'Status': 'Potential Cheating'
        })
    
    df = pd.DataFrame(data)
    
    # Create Excel writer
    with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
        # Write incidents
        df.to_excel(writer, sheet_name='Cheating Details', index=False)
        
        # Summary sheet
        summary_data = {
            'Metric': [
                'Total Frames Analyzed',
                'Cheating Incidents Detected',
                'Final Result',
                'Recommendation'
            ],
            'Value': [
                len(detector.cheating_incidents),
                len(detector.cheating_incidents),
                'Cheating' if len(detector.cheating_incidents) > 3 else 'Suspicious',
                'Manual Review Required' if len(detector.cheating_incidents) > 0 else 'Acceptable'
            ]
        }
        summary_df = pd.DataFrame(summary_data)
        summary_df.to_excel(writer, sheet_name='Summary', index=False)
    
    print(f"\nExcel report created: {output_path}")


def main():
    print("\n" + "="*60)
    print("Exam Cheating Analysis")
    print("="*60 + "\n")
    
    # Get script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    outputs_dir = os.path.join(script_dir, 'outputs')
    frames_dir = os.path.join(script_dir, 'frames')
    
    # Load exam data
    data_path = os.path.join(outputs_dir, 'exam_data.json')
    if not os.path.exists(data_path):
        print("Error: Exam data not found!")
        print("Please run capture_exam.py first")
        return
    
    with open(data_path, 'r', encoding='utf-8') as f:
        frames_data = json.load(f)
    
    print(f"Loaded {len(frames_data)} frames\n")
    
    # Initialize detector
    detector = CheatingDetector()
    
    # Video writer
    timestamp = int(time.time())
    video_path = os.path.join(outputs_dir, f'exam_video_{timestamp}.mp4')
    video_codec = cv2.VideoWriter_fourcc(*'mp4v')
    video_writer = None
    
    print("Starting analysis...\n")
    
    # Process each frame
    for i, frame_data in enumerate(frames_data):
        # Load frame image
        frame_path = os.path.join(frames_dir, f"{frame_data['index']}.jpg")
        if not os.path.exists(frame_path):
            continue
        
        frame = cv2.imread(frame_path)
        if frame is None:
            continue
        
        # Detect cheating
        all_reasons = []
        
        # Check head pose
        pose_cheating, pose_reasons = detector.check_head_pose(frame_data)
        if pose_cheating:
            all_reasons.extend(pose_reasons)
        
        # Check eye gaze
        gaze_cheating, gaze_reasons = detector.check_eye_gaze(frame_data)
        if gaze_cheating:
            all_reasons.extend(gaze_reasons)
        
        # Check multiple persons
        multi_cheating, multi_reasons = detector.check_multiple_persons(frame_data)
        if multi_cheating:
            all_reasons.extend(multi_reasons)
        
        is_cheating = len(all_reasons) > 0
        
        # Add incident if cheating detected
        if is_cheating:
            detector.add_incident(
                frame_data['index'],
                frame_data['timestamp'],
                frame_data['time_formatted'],
                all_reasons
            )
        
        # Draw info on frame
        draw_frame_info(frame, frame_data, is_cheating, all_reasons, detector)
        
        # Initialize video writer
        if video_writer is None:
            h, w = frame.shape[:2]
            video_writer = cv2.VideoWriter(video_path, video_codec, VIDEO_FPS, (w, h))
        
        # Write frame multiple times for smooth video
        for _ in range(VIDEO_FPS):
            video_writer.write(frame)
        
        # Progress
        sys.stdout.write(f"\rProcessing frame {i+1}/{len(frames_data)}")
        sys.stdout.flush()
    
    if video_writer:
        video_writer.release()
    
    print(f"\n\n{'='*60}")
    print("Analysis Complete!")
    print(f"{'='*60}\n")
    
    # Generate Excel report
    excel_path = os.path.join(outputs_dir, f'cheating_report_{timestamp}.xlsx')
    generate_excel_report(detector, excel_path)
    
    # Print summary
    print(f"\nTotal frames: {len(frames_data)}")
    print(f"Cheating incidents detected: {len(detector.cheating_incidents)}")
    
    if detector.cheating_incidents:
        print("\nFirst 5 incidents:")
        for incident in detector.cheating_incidents[:5]:
            print(f"  - Time {incident['time']}: {', '.join(incident['reasons'])}")
    else:
        print("\nNo cheating detected!")
    
    print(f"\nVideo: {video_path}")
    print(f"Report: {excel_path}\n")


if __name__ == "__main__":
    main()
