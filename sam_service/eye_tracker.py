"""
Eye Tracker using MediaPipe Face Mesh
Tracks gaze direction, blinks, and eye movement for focus detection.
"""

import cv2
import numpy as np
from collections import deque
import time

try:
    import mediapipe as mp
    MEDIAPIPE_AVAILABLE = True
except ImportError:
    MEDIAPIPE_AVAILABLE = False
    print("Warning: MediaPipe not available. Eye tracking will be disabled.")


class EyeTracker:
    """
    Tracks eye position, gaze direction, and blinks using MediaPipe Face Mesh.
    """
    
    # MediaPipe Face Mesh landmark indices for eyes
    # Left eye landmarks
    LEFT_EYE_INDICES = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
    # Right eye landmarks
    RIGHT_EYE_INDICES = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]
    
    # Key points for EAR calculation (Eye Aspect Ratio)
    # Each eye: [top, bottom, left, right]
    LEFT_EYE_POINTS = [159, 145, 33, 133]  # [top, bottom, left, right]
    RIGHT_EYE_POINTS = [386, 374, 362, 263]
    
    # Face center landmark (nose tip)
    NOSE_TIP = 1
    
    def __init__(self, min_detection_confidence=0.5, min_tracking_confidence=0.5):
        """
        Initialize eye tracker.
        
        Args:
            min_detection_confidence: Minimum confidence for face detection
            min_tracking_confidence: Minimum confidence for face tracking
        """
        if not MEDIAPIPE_AVAILABLE:
            self.available = False
            return
        
        self.available = True
        self.mp_face_mesh = mp.solutions.face_mesh
        self.face_mesh = self.mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=min_detection_confidence,
            min_tracking_confidence=min_tracking_confidence
        )
        
        # Blink detection parameters
        self.EAR_THRESHOLD = 0.25  # Eye Aspect Ratio threshold for blink
        self.EAR_CONSECUTIVE_FRAMES = 2  # Frames for blink detection
        
        # Tracking history
        self.ear_history = deque(maxlen=30)  # Last 30 frames
        self.gaze_history = deque(maxlen=30)
        self.blink_count = 0
        self.last_blink_time = None
        self.eye_position_history = deque(maxlen=30)
        
        # Focus metrics
        self.focus_start_time = None
        self.total_focus_time = 0.0
        self.last_update_time = time.time()
    
    def _calculate_ear(self, landmarks, eye_points):
        """
        Calculate Eye Aspect Ratio (EAR) for blink detection.
        
        EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)
        Lower EAR indicates closed eye.
        """
        try:
            # Get eye landmark coordinates
            top = np.array([landmarks[eye_points[0]].x, landmarks[eye_points[0]].y])
            bottom = np.array([landmarks[eye_points[1]].x, landmarks[eye_points[1]].y])
            left = np.array([landmarks[eye_points[2]].x, landmarks[eye_points[2]].y])
            right = np.array([landmarks[eye_points[3]].x, landmarks[eye_points[3]].y])
            
            # Calculate distances
            vertical_dist_1 = np.linalg.norm(top - bottom)
            vertical_dist_2 = np.linalg.norm(left - right)
            horizontal_dist = np.linalg.norm(left - right)
            
            # EAR calculation
            if horizontal_dist == 0:
                return 0.0
            
            ear = (vertical_dist_1 + vertical_dist_2) / (2.0 * horizontal_dist)
            return ear
            
        except Exception as e:
            return 0.0
    
    def _detect_blink(self, left_ear, right_ear):
        """
        Detect blink based on EAR values.
        
        Args:
            left_ear: Left eye EAR value
            right_ear: Right eye EAR value
            
        Returns:
            True if blink detected, False otherwise
        """
        avg_ear = (left_ear + right_ear) / 2.0
        
        # Add to history
        self.ear_history.append(avg_ear)
        
        # Check if EAR dropped below threshold (eye closed)
        if len(self.ear_history) >= self.EAR_CONSECUTIVE_FRAMES:
            recent_ears = list(self.ear_history)[-self.EAR_CONSECUTIVE_FRAMES:]
            
            # Blink detected if EAR was below threshold and then recovered
            if all(ear < self.EAR_THRESHOLD for ear in recent_ears[:-1]) and recent_ears[-1] > self.EAR_THRESHOLD:
                return True
        
        return False
    
    def _calculate_gaze_direction(self, landmarks, frame_shape):
        """
        Calculate gaze direction based on eye position relative to face center.
        
        Args:
            landmarks: MediaPipe landmarks
            frame_shape: (height, width) of frame
            
        Returns:
            'screen' if looking at screen, 'away' if looking away, 'unknown' if uncertain
        """
        try:
            # Get eye centers
            left_eye_center = np.array([
                landmarks[self.LEFT_EYE_INDICES[0]].x,
                landmarks[self.LEFT_EYE_INDICES[0]].y
            ])
            right_eye_center = np.array([
                landmarks[self.RIGHT_EYE_INDICES[0]].x,
                landmarks[self.RIGHT_EYE_INDICES[0]].y
            ])
            
            # Calculate eye center (midpoint between left and right)
            eye_center = (left_eye_center + right_eye_center) / 2.0
            
            # Get face center (nose tip)
            face_center = np.array([
                landmarks[self.NOSE_TIP].x,
                landmarks[self.NOSE_TIP].y
            ])
            
            # Calculate offset from face center
            offset = eye_center - face_center
            
            # Normalize by face size (approximate)
            # Use distance between eye centers as scale
            eye_distance = np.linalg.norm(left_eye_center - right_eye_center)
            if eye_distance > 0:
                normalized_offset = offset / eye_distance
            else:
                return 'unknown'
            
            # Determine gaze direction
            # Looking at screen: eyes centered (small offset)
            # Looking away: larger offset
            
            horizontal_offset = abs(normalized_offset[0])
            vertical_offset = abs(normalized_offset[1])
            
            # Threshold for "looking at screen" (centered gaze)
            threshold = 0.15
            
            if horizontal_offset < threshold and vertical_offset < threshold:
                return 'screen'
            elif horizontal_offset > threshold * 2 or vertical_offset > threshold * 2:
                return 'away'
            else:
                return 'unknown'
                
        except Exception as e:
            return 'unknown'
    
    def _calculate_eye_movement_stability(self):
        """
        Calculate eye movement stability based on position history.
        Lower variance = more stable = more focused.
        
        Returns:
            Stability score 0-100 (100 = very stable)
        """
        if len(self.eye_position_history) < 5:
            return 50.0  # Default moderate stability
        
        try:
            positions = np.array(list(self.eye_position_history))
            
            # Calculate variance in eye positions
            variance = np.var(positions, axis=0)
            total_variance = np.sum(variance)
            
            # Convert variance to stability score (inverse relationship)
            # Lower variance = higher stability
            # Empirical scaling
            stability = max(0.0, min(100.0, 100.0 - (total_variance * 1000.0)))
            
            return stability
            
        except Exception as e:
            return 50.0
    
    def _calculate_blink_rate(self):
        """
        Calculate blink rate in blinks per minute.
        
        Returns:
            Blink rate (blinks/min) or None if insufficient data
        """
        if self.last_blink_time is None:
            return None
        
        current_time = time.time()
        time_window = current_time - (self.last_update_time - 30.0)  # Last 30 seconds
        
        if time_window < 5.0:  # Need at least 5 seconds of data
            return None
        
        # Count blinks in recent history
        # For simplicity, use blink_count and time window
        # In production, track timestamps of each blink
        blink_rate = (self.blink_count / time_window) * 60.0
        
        # Normal blink rate: 15-20 per minute
        # Focused: 10-15 per minute
        # Stressed: 20+ per minute
        
        return blink_rate
    
    def process_frame(self, frame, timestamp=None):
        """
        Process a single frame and extract eye tracking metrics.
        
        Args:
            frame: Video frame (BGR format)
            timestamp: Frame timestamp (default: current time)
            
        Returns:
            Dictionary with eye tracking metrics or None
        """
        if not self.available:
            return None
        
        if timestamp is None:
            timestamp = time.time()
        
        # Convert BGR to RGB for MediaPipe
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        
        # Process with MediaPipe
        results = self.face_mesh.process(rgb_frame)
        
        if not results.multi_face_landmarks:
            # No face detected
            return {
                'gaze_direction': 'unknown',
                'blink_rate': None,
                'eye_movement_stability': 0.0,
                'focus_duration': self.total_focus_time,
                'face_detected': False
            }
        
        # Get first face (assuming single face)
        face_landmarks = results.multi_face_landmarks[0]
        landmarks = face_landmarks.landmark
        
        # Calculate EAR for both eyes
        left_ear = self._calculate_ear(landmarks, self.LEFT_EYE_POINTS)
        right_ear = self._calculate_ear(landmarks, self.RIGHT_EYE_POINTS)
        
        # Detect blink
        blink_detected = self._detect_blink(left_ear, right_ear)
        if blink_detected:
            self.blink_count += 1
            self.last_blink_time = timestamp
        
        # Calculate gaze direction
        gaze_direction = self._calculate_gaze_direction(landmarks, frame.shape)
        self.gaze_history.append(gaze_direction)
        
        # Track eye position for stability
        # New API: landmarks is a list, access by index
        left_eye_center = np.array([
            landmarks[self.LEFT_EYE_INDICES[0]].x,
            landmarks[self.LEFT_EYE_INDICES[0]].y
        ])
        right_eye_center = np.array([
            landmarks[self.RIGHT_EYE_INDICES[0]].x,
            landmarks[self.RIGHT_EYE_INDICES[0]].y
        ])
        eye_center = (left_eye_center + right_eye_center) / 2.0
        self.eye_position_history.append(eye_center)
        
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
        blink_rate = self._calculate_blink_rate()
        eye_stability = self._calculate_eye_movement_stability()
        
        return {
            'gaze_direction': gaze_direction,
            'blink_rate': blink_rate,
            'eye_movement_stability': eye_stability,
            'focus_duration': self.total_focus_time,
            'face_detected': True,
            'ear_left': left_ear,
            'ear_right': right_ear,
            'timestamp': timestamp
        }
    
    def get_current_metrics(self):
        """Get current metrics without processing a new frame."""
        blink_rate = self._calculate_blink_rate()
        eye_stability = self._calculate_eye_movement_stability()
        
        # Get most recent gaze direction
        gaze_direction = 'unknown'
        if len(self.gaze_history) > 0:
            gaze_direction = self.gaze_history[-1]
        
        return {
            'gaze_direction': gaze_direction,
            'blink_rate': blink_rate,
            'eye_movement_stability': eye_stability,
            'focus_duration': self.total_focus_time,
            'face_detected': len(self.gaze_history) > 0
        }
    
    def reset(self):
        """Reset the tracker (clear history)."""
        self.ear_history.clear()
        self.gaze_history.clear()
        self.eye_position_history.clear()
        self.blink_count = 0
        self.last_blink_time = None
        self.focus_start_time = None
        self.total_focus_time = 0.0
        self.last_update_time = time.time()

