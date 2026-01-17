"""
Custom Metrics Processor
Coordinates eye tracking and heart rate monitoring to provide unified metrics.
"""

import time
from heart_rate_monitor import HeartRateMonitor

# Try to import eye tracker - fallback to simple version if MediaPipe API incompatible
EyeTracker = None
try:
    from eye_tracker import EyeTracker as EyeTrackerMP
    # Test if MediaPipe has solutions API (0.9.x has it, 0.10+ doesn't)
    import mediapipe as mp
    if hasattr(mp, 'solutions'):
        EyeTracker = EyeTrackerMP
    else:
        # MediaPipe 0.10+ - use simple tracker
        raise AttributeError("MediaPipe 0.10+ doesn't have solutions API")
except (ImportError, AttributeError) as e:
    # Fallback to simple eye tracker
    print(f"⚠️ [CUSTOM] Using simple eye tracker (MediaPipe API incompatible): {e}")
    from eye_tracker_simple import EyeTracker


class CustomMetricsProcessor:
    """
    Processes video frames using custom eye tracking and heart rate monitoring.
    Provides fallback metrics when Presage SDK is unavailable.
    """
    
    def __init__(self, fps=30):
        """
        Initialize custom metrics processor.
        
        Args:
            fps: Expected frame rate (default 30)
        """
        self.fps = fps
        self.heart_rate_monitor = HeartRateMonitor(fps=fps)
        
        # Initialize eye tracker with error handling
        try:
            if EyeTracker is not None:
                self.eye_tracker = EyeTracker()
            else:
                from eye_tracker_simple import EyeTracker as SimpleEyeTracker
                self.eye_tracker = SimpleEyeTracker()
        except Exception as e:
            print(f"⚠️ [CUSTOM] Failed to initialize eye tracker, using simple version: {e}")
            from eye_tracker_simple import EyeTracker as SimpleEyeTracker
            self.eye_tracker = SimpleEyeTracker()
        
        self.frame_count = 0
        self.last_metrics = None
        self.initialized = False
    
    def process_frame(self, frame, timestamp=None):
        """
        Process a single frame with both eye tracker and heart rate monitor.
        
        Args:
            frame: Video frame (BGR format)
            timestamp: Frame timestamp (default: current time)
            
        Returns:
            Dictionary with combined metrics
        """
        if timestamp is None:
            timestamp = time.time()
        
        self.frame_count += 1
        
        # Process with heart rate monitor
        hr_metrics = self.heart_rate_monitor.process_frame(frame, timestamp)
        
        # Process with eye tracker
        eye_metrics = self.eye_tracker.process_frame(frame, timestamp)
        
        # Combine metrics
        combined_metrics = {
            'heart_rate': None,
            'breathing_rate': None,
            'gaze_direction': 'unknown',
            'blink_rate': None,
            'eye_movement_stability': 0.0,
            'focus_duration': 0.0,
            'signal_quality': 0.0,
            'source': 'custom',
            'frame_count': self.frame_count,
            'timestamp': timestamp
        }
        
        # Add heart rate metrics
        if hr_metrics:
            combined_metrics['heart_rate'] = hr_metrics.get('heart_rate')
            combined_metrics['breathing_rate'] = hr_metrics.get('breathing_rate')
            combined_metrics['signal_quality'] = hr_metrics.get('signal_quality', 0.0)
        
        # Add eye tracking metrics
        if eye_metrics:
            combined_metrics['gaze_direction'] = eye_metrics.get('gaze_direction', 'unknown')
            combined_metrics['blink_rate'] = eye_metrics.get('blink_rate')
            combined_metrics['eye_movement_stability'] = eye_metrics.get('eye_movement_stability', 0.0)
            combined_metrics['focus_duration'] = eye_metrics.get('focus_duration', 0.0)
        
        # Calculate overall quality score
        quality_score = self._calculate_overall_quality(combined_metrics)
        combined_metrics['overall_quality'] = quality_score
        
        self.last_metrics = combined_metrics
        self.initialized = True
        
        return combined_metrics
    
    def _calculate_overall_quality(self, metrics):
        """
        Calculate overall quality score based on available metrics.
        
        Args:
            metrics: Dictionary of metrics
            
        Returns:
            Quality score 0-100
        """
        quality = 0.0
        factors = 0
        
        # Heart rate quality
        if metrics.get('heart_rate') is not None:
            signal_quality = metrics.get('signal_quality', 0.0)
            quality += signal_quality * 0.4  # 40% weight
            factors += 0.4
        
        # Eye tracking quality
        if metrics.get('face_detected', False):
            eye_stability = metrics.get('eye_movement_stability', 0.0)
            quality += eye_stability * 0.3  # 30% weight
            factors += 0.3
        
        # Gaze detection quality
        if metrics.get('gaze_direction') != 'unknown':
            quality += 30.0  # 30% weight
            factors += 0.3
        
        # Normalize by factors
        if factors > 0:
            quality = quality / factors
        
        return min(100.0, quality)
    
    def get_current_metrics(self):
        """
        Get current metrics without processing a new frame.
        
        Returns:
            Dictionary with current metrics or None
        """
        if not self.initialized:
            return None
        
        hr_metrics = self.heart_rate_monitor.get_current_metrics()
        eye_metrics = self.eye_tracker.get_current_metrics()
        
        combined = {
            'heart_rate': hr_metrics.get('heart_rate') if hr_metrics else None,
            'breathing_rate': hr_metrics.get('breathing_rate') if hr_metrics else None,
            'gaze_direction': eye_metrics.get('gaze_direction', 'unknown') if eye_metrics else 'unknown',
            'blink_rate': eye_metrics.get('blink_rate') if eye_metrics else None,
            'eye_movement_stability': eye_metrics.get('eye_movement_stability', 0.0) if eye_metrics else 0.0,
            'focus_duration': eye_metrics.get('focus_duration', 0.0) if eye_metrics else 0.0,
            'signal_quality': hr_metrics.get('signal_quality', 0.0) if hr_metrics else 0.0,
            'source': 'custom',
            'frame_count': self.frame_count
        }
        
        return combined
    
    def reset(self):
        """Reset both monitors."""
        self.heart_rate_monitor.reset()
        self.eye_tracker.reset()
        self.frame_count = 0
        self.last_metrics = None
        self.initialized = False
    
    def is_available(self):
        """Check if custom metrics are available (eye tracker initialized)."""
        return self.eye_tracker.available if hasattr(self.eye_tracker, 'available') else False

