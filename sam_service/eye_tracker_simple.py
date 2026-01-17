"""
Simple Eye Tracker using OpenCV (no MediaPipe dependency)
Tracks basic gaze direction using face detection.
"""

import cv2
import numpy as np
from collections import deque
import time


class EyeTracker:
    """
    Simple eye tracker using OpenCV face detection.
    Works without MediaPipe - uses basic face detection for gaze estimation.
    """
    
    def __init__(self, min_detection_confidence=0.5, min_tracking_confidence=0.5):
        """
        Initialize eye tracker.
        """
        try:
            # Use OpenCV's face detector (Haar Cascade)
            self.face_cascade = cv2.CascadeClassifier(
                cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
            )
            self.available = True
        except Exception as e:
            print(f"Warning: Failed to initialize face detector: {e}")
            self.available = False
            return
        
        # Tracking history
        self.gaze_history = deque(maxlen=30)
        self.face_position_history = deque(maxlen=30)
        self.blink_count = 0
        self.last_blink_time = None
        
        # Focus metrics
        self.focus_start_time = None
        self.total_focus_time = 0.0
        self.last_update_time = time.time()
    
    def _calculate_gaze_direction(self, face_rect, frame_shape):
        """
        Calculate gaze direction based on face position in frame.
        Simple heuristic: if face is centered, looking at screen.
        """
        try:
            frame_height, frame_width = frame_shape[:2]
            
            # Get face center
            face_x = face_rect[0] + face_rect[2] / 2
            face_y = face_rect[1] + face_rect[3] / 2
            
            # Calculate offset from frame center
            frame_center_x = frame_width / 2
            frame_center_y = frame_height / 2
            
            offset_x = (face_x - frame_center_x) / frame_width
            offset_y = (face_y - frame_center_y) / frame_height
            
            # Threshold for "looking at screen" (centered)
            threshold = 0.2
            
            if abs(offset_x) < threshold and abs(offset_y) < threshold:
                return 'screen'
            elif abs(offset_x) > threshold * 2 or abs(offset_y) > threshold * 2:
                return 'away'
            else:
                return 'unknown'
                
        except Exception as e:
            return 'unknown'
    
    def _calculate_eye_movement_stability(self):
        """Calculate stability based on face position variance."""
        if len(self.face_position_history) < 5:
            return 50.0
        
        try:
            positions = np.array(list(self.face_position_history))
            variance = np.var(positions, axis=0)
            total_variance = np.sum(variance)
            stability = max(0.0, min(100.0, 100.0 - (total_variance * 0.01)))
            return stability
        except:
            return 50.0
    
    def process_frame(self, frame, timestamp=None):
        """Process a single frame and extract eye tracking metrics."""
        if not self.available:
            return None
        
        if timestamp is None:
            timestamp = time.time()
        
        # Convert to grayscale for face detection
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        
        # Detect faces
        faces = self.face_cascade.detectMultiScale(
            gray,
            scaleFactor=1.1,
            minNeighbors=5,
            minSize=(100, 100)
        )
        
        if len(faces) == 0:
            # No face detected
            return {
                'gaze_direction': 'unknown',
                'blink_rate': None,
                'eye_movement_stability': 0.0,
                'focus_duration': self.total_focus_time,
                'face_detected': False
            }
        
        # Use largest face
        face = max(faces, key=lambda x: x[2] * x[3])
        
        # Calculate gaze direction
        gaze_direction = self._calculate_gaze_direction(face, frame.shape)
        self.gaze_history.append(gaze_direction)
        
        # Track face position for stability
        face_center = np.array([face[0] + face[2]/2, face[1] + face[3]/2])
        self.face_position_history.append(face_center)
        
        # Update focus time
        current_time = time.time()
        time_delta = current_time - self.last_update_time
        self.last_update_time = current_time
        
        if gaze_direction == 'screen':
            if self.focus_start_time is None:
                self.focus_start_time = timestamp
            else:
                self.total_focus_time += time_delta
        else:
            self.focus_start_time = None
        
        # Calculate metrics
        eye_stability = self._calculate_eye_movement_stability()
        
        return {
            'gaze_direction': gaze_direction,
            'blink_rate': None,  # Not available without MediaPipe
            'eye_movement_stability': eye_stability,
            'focus_duration': self.total_focus_time,
            'face_detected': True,
            'timestamp': timestamp
        }
    
    def get_current_metrics(self):
        """Get current metrics without processing a new frame."""
        gaze_direction = 'unknown'
        if len(self.gaze_history) > 0:
            gaze_direction = self.gaze_history[-1]
        
        return {
            'gaze_direction': gaze_direction,
            'blink_rate': None,
            'eye_movement_stability': self._calculate_eye_movement_stability(),
            'focus_duration': self.total_focus_time,
            'face_detected': len(self.gaze_history) > 0
        }
    
    def reset(self):
        """Reset the tracker."""
        self.gaze_history.clear()
        self.face_position_history.clear()
        self.blink_count = 0
        self.last_blink_time = None
        self.focus_start_time = None
        self.total_focus_time = 0.0
        self.last_update_time = time.time()

